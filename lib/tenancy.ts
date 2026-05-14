import "server-only";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { sql } from "@vercel/postgres";

// Multi-tenant model for the hosted operator SaaS (Project Elsa).
//
// Each merchant who signs up gets a Tenant — an isolated record with their
// own Shopify + Printful + (later) Klaviyo credentials, a unique bearer
// token for API access, and a Stripe subscription pointer.
//
// Storage:
//   - PRODUCTION: Vercel Postgres (or any Postgres connection in POSTGRES_URL).
//     Persistent, ACID, indexed. Migration runs lazily on first call.
//   - LOCAL DEV: file-based JSON in .openclaw/tenants/<id>.json when
//     POSTGRES_URL is unset. Same data shape; same public API.
//
// Credential encryption: the merchant's third-party API tokens (Shopify
// admin API token, Printful API key, Klaviyo private API key) are sensitive
// and must NOT live in plain text. We AES-256-GCM encrypt them with a key
// derived from TENANCY_MASTER_KEY (env var, required in prod). Each
// credential gets a unique IV; the tag is stored alongside.
//
// All public functions are ASYNC so the Postgres path works. File storage
// uses async too (fs/promises) for consistency.

// ── Crypto setup ──────────────────────────────────────────────────────────

const DEV_KEY_HEX = "0000000000000000000000000000000000000000000000000000000000000001";

function getMasterKey(): Buffer {
  const env = process.env.TENANCY_MASTER_KEY?.trim();
  if (env) {
    if (env.length !== 64) {
      throw new Error("TENANCY_MASTER_KEY must be 64 hex chars (32 bytes)");
    }
    return Buffer.from(env, "hex");
  }
  if (process.env.VERCEL) {
    throw new Error(
      "TENANCY_MASTER_KEY is required in production. Generate one with " +
        "`openssl rand -hex 32` and set in Vercel env vars."
    );
  }
  return Buffer.from(DEV_KEY_HEX, "hex");
}

function encryptString(plain: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

function decryptString(payload: string): string {
  if (!payload.startsWith("v1:")) {
    throw new Error("Unknown credential format (expected v1: prefix)");
  }
  const [, ivB64, tagB64, ctB64] = payload.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const key = getMasterKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// ── Types ─────────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "paused";

export type EncryptedSecrets = {
  // Shopify
  shopifyAdminToken?: string;
  shopifyStoreDomain?: string;
  shopifyWebhookSecret?: string;
  // Printful
  printfulApiKey?: string;
  printfulStoreId?: string;
  // Klaviyo
  klaviyoApiKey?: string;
  // CJ Dropshipping
  cjApiKey?: string;
  cjEmail?: string;
  // LLM provider keys — BYOK. When set, the tenant's spend flows through
  // their own Anthropic/OpenAI billing account, not the founder's. When
  // unset, requests from that tenant should error (not silently fall back
  // to the founder's keys — that's a billing leak). See lib/tenant-context.ts.
  anthropicApiKey?: string;
  openaiApiKey?: string;
};

export type Tenant = {
  id: string;
  brandSlug: string;
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
  bearerToken: string;
  stripe?: {
    customerId?: string;
    subscriptionId?: string;
    priceId?: string;
    currentPeriodEnd?: string;
  };
  subscriptionStatus: SubscriptionStatus;
  brand: {
    name: string;
    tagline?: string;
    voiceVibe?: string;
    primaryColor?: string;
    fulfillment: "printful" | "manual";
  };
  secrets: EncryptedSecrets;
  config: {
    operatorEnabled: boolean;
    spendBudgetUsdMonthly?: number;
  };
};

// ── Storage selection ─────────────────────────────────────────────────────

function usingPostgres(): boolean {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING);
}

// ── File storage (local dev) ──────────────────────────────────────────────

const TENANTS_DIR = (() => {
  const onVercel = Boolean(process.env.VERCEL);
  if (onVercel) return path.join("/tmp", "openclaw", "tenants");
  return path.join(process.cwd(), ".openclaw", "tenants");
})();

function ensureFileDir() {
  if (!fs.existsSync(TENANTS_DIR)) fs.mkdirSync(TENANTS_DIR, { recursive: true });
}

function fileFor(tenantId: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(tenantId)) {
    throw new Error(`Invalid tenant id: ${tenantId.slice(0, 50)}`);
  }
  return path.join(TENANTS_DIR, `${tenantId}.json`);
}

async function fileReadById(id: string): Promise<Tenant | null> {
  const p = fileFor(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(await fs.promises.readFile(p, "utf8")) as Tenant;
}

async function fileReadByBearer(bearer: string): Promise<Tenant | null> {
  ensureFileDir();
  for (const f of await fs.promises.readdir(TENANTS_DIR)) {
    if (!f.endsWith(".json")) continue;
    const t = JSON.parse(await fs.promises.readFile(path.join(TENANTS_DIR, f), "utf8")) as Tenant;
    if (t.bearerToken === bearer) return t;
  }
  return null;
}

async function fileReadBySlug(slug: string): Promise<Tenant | null> {
  ensureFileDir();
  for (const f of await fs.promises.readdir(TENANTS_DIR)) {
    if (!f.endsWith(".json")) continue;
    const t = JSON.parse(await fs.promises.readFile(path.join(TENANTS_DIR, f), "utf8")) as Tenant;
    if (t.brandSlug === slug) return t;
  }
  return null;
}

async function fileList(): Promise<Tenant[]> {
  ensureFileDir();
  const out: Tenant[] = [];
  for (const f of await fs.promises.readdir(TENANTS_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(await fs.promises.readFile(path.join(TENANTS_DIR, f), "utf8")) as Tenant);
    } catch {}
  }
  return out;
}

async function fileWrite(t: Tenant): Promise<void> {
  ensureFileDir();
  await fs.promises.writeFile(fileFor(t.id), JSON.stringify(t, null, 2), "utf8");
}

// ── Postgres storage (production) ─────────────────────────────────────────

let postgresMigrated = false;

async function pgMigrate(): Promise<void> {
  if (postgresMigrated) return;
  await sql`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      brand_slug TEXT UNIQUE NOT NULL,
      owner_email TEXT NOT NULL,
      bearer_token TEXT UNIQUE NOT NULL,
      subscription_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data JSONB NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_tenants_bearer ON tenants(bearer_token)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(brand_slug)`;
  postgresMigrated = true;
}

type TenantRow = {
  id: string;
  brand_slug: string;
  owner_email: string;
  bearer_token: string;
  subscription_status: string;
  created_at: string;
  updated_at: string;
  data: Omit<Tenant, "id" | "brandSlug" | "ownerEmail" | "bearerToken" | "subscriptionStatus" | "createdAt" | "updatedAt">;
};

function rowToTenant(r: TenantRow): Tenant {
  return {
    id: r.id,
    brandSlug: r.brand_slug,
    ownerEmail: r.owner_email,
    bearerToken: r.bearer_token,
    subscriptionStatus: r.subscription_status as SubscriptionStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    stripe: r.data.stripe,
    brand: r.data.brand,
    secrets: r.data.secrets,
    config: r.data.config
  };
}

async function pgReadById(id: string): Promise<Tenant | null> {
  await pgMigrate();
  const r = await sql<TenantRow>`SELECT * FROM tenants WHERE id = ${id} LIMIT 1`;
  return r.rows[0] ? rowToTenant(r.rows[0]) : null;
}

async function pgReadByBearer(bearer: string): Promise<Tenant | null> {
  await pgMigrate();
  const r = await sql<TenantRow>`SELECT * FROM tenants WHERE bearer_token = ${bearer} LIMIT 1`;
  return r.rows[0] ? rowToTenant(r.rows[0]) : null;
}

async function pgReadBySlug(slug: string): Promise<Tenant | null> {
  await pgMigrate();
  const r = await sql<TenantRow>`SELECT * FROM tenants WHERE brand_slug = ${slug} LIMIT 1`;
  return r.rows[0] ? rowToTenant(r.rows[0]) : null;
}

async function pgList(): Promise<Tenant[]> {
  await pgMigrate();
  const r = await sql<TenantRow>`SELECT * FROM tenants ORDER BY created_at DESC LIMIT 5000`;
  return r.rows.map(rowToTenant);
}

async function pgWrite(t: Tenant): Promise<void> {
  await pgMigrate();
  const data = JSON.stringify({
    stripe: t.stripe,
    brand: t.brand,
    secrets: t.secrets,
    config: t.config
  });
  await sql`
    INSERT INTO tenants (id, brand_slug, owner_email, bearer_token, subscription_status, created_at, updated_at, data)
    VALUES (${t.id}, ${t.brandSlug}, ${t.ownerEmail}, ${t.bearerToken}, ${t.subscriptionStatus}, ${t.createdAt}, ${t.updatedAt}, ${data}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      brand_slug = EXCLUDED.brand_slug,
      owner_email = EXCLUDED.owner_email,
      bearer_token = EXCLUDED.bearer_token,
      subscription_status = EXCLUDED.subscription_status,
      updated_at = EXCLUDED.updated_at,
      data = EXCLUDED.data
  `;
}

// ── Public API ────────────────────────────────────────────────────────────

export function newTenantId(): string {
  return "tnt_" + crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 16);
}

export function newBearerToken(): string {
  return "btk_" + crypto.randomBytes(24).toString("base64").replace(/[+/=]/g, "");
}

export type CreateTenantInput = {
  brandSlug: string;
  ownerEmail: string;
  brandName: string;
  voiceVibe?: string;
  tagline?: string;
};

export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const existing = await getTenantByBrandSlug(input.brandSlug);
  if (existing) throw new Error(`brandSlug already taken: ${input.brandSlug}`);
  const now = new Date().toISOString();
  const tenant: Tenant = {
    id: newTenantId(),
    brandSlug: input.brandSlug,
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
    createdAt: now,
    updatedAt: now,
    bearerToken: newBearerToken(),
    subscriptionStatus: "incomplete",
    brand: {
      name: input.brandName,
      tagline: input.tagline,
      voiceVibe: input.voiceVibe,
      fulfillment: "printful"
    },
    secrets: {},
    config: {
      operatorEnabled: false,
      spendBudgetUsdMonthly: 25
    }
  };
  if (usingPostgres()) await pgWrite(tenant);
  else await fileWrite(tenant);
  return tenant;
}

export async function getTenant(tenantId: string): Promise<Tenant | null> {
  return usingPostgres() ? pgReadById(tenantId) : fileReadById(tenantId);
}

export async function getTenantByBearer(bearerToken: string): Promise<Tenant | null> {
  if (!bearerToken || !bearerToken.startsWith("btk_")) return null;
  return usingPostgres() ? pgReadByBearer(bearerToken) : fileReadByBearer(bearerToken);
}

export async function getTenantByBrandSlug(slug: string): Promise<Tenant | null> {
  return usingPostgres() ? pgReadBySlug(slug) : fileReadBySlug(slug);
}

export async function listTenants(): Promise<Tenant[]> {
  return usingPostgres() ? pgList() : fileList();
}

export async function updateTenant(
  tenantId: string,
  patch: Partial<Omit<Tenant, "id" | "createdAt">>
): Promise<Tenant> {
  const cur = await getTenant(tenantId);
  if (!cur) throw new Error(`No tenant ${tenantId}`);
  const next: Tenant = {
    ...cur,
    ...patch,
    id: cur.id,
    createdAt: cur.createdAt,
    updatedAt: new Date().toISOString()
  };
  if (usingPostgres()) await pgWrite(next);
  else await fileWrite(next);
  return next;
}

export async function setTenantSecret(
  tenantId: string,
  key: keyof EncryptedSecrets,
  plain: string | undefined
): Promise<Tenant> {
  const cur = await getTenant(tenantId);
  if (!cur) throw new Error(`No tenant ${tenantId}`);
  const nonSecretKeys: Array<keyof EncryptedSecrets> = ["shopifyStoreDomain", "printfulStoreId"];
  const secrets: EncryptedSecrets = { ...cur.secrets };
  if (!plain) {
    delete secrets[key];
  } else if (nonSecretKeys.includes(key)) {
    secrets[key] = plain;
  } else {
    secrets[key] = encryptString(plain);
  }
  return updateTenant(tenantId, { secrets });
}

export function getTenantSecret(tenant: Tenant, key: keyof EncryptedSecrets): string {
  const raw = tenant.secrets[key];
  if (!raw) throw new Error(`Tenant ${tenant.id} is missing required secret: ${key}`);
  const nonSecretKeys: Array<keyof EncryptedSecrets> = ["shopifyStoreDomain", "printfulStoreId"];
  if (nonSecretKeys.includes(key)) return raw;
  return decryptString(raw);
}

export async function rotateBearer(tenantId: string): Promise<Tenant> {
  return updateTenant(tenantId, { bearerToken: newBearerToken() });
}

export async function cancelTenant(tenantId: string): Promise<Tenant> {
  const cur = await getTenant(tenantId);
  if (!cur) throw new Error(`No tenant ${tenantId}`);
  return updateTenant(tenantId, {
    subscriptionStatus: "canceled",
    config: { ...cur.config, operatorEnabled: false }
  });
}

export function isTenantActive(tenant: Tenant): boolean {
  if (!tenant.config.operatorEnabled) return false;
  return tenant.subscriptionStatus === "active" || tenant.subscriptionStatus === "trialing";
}
