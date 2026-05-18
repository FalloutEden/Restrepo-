import "server-only";

import path from "node:path";

import { getTenant, getTenantByBearer, getTenantSecret, type Tenant, type EncryptedSecrets } from "@/lib/tenancy";

// Tenant context — the single object every per-tenant operation accepts.
//
// Why this exists: pre-BYOK, the operator codebase read credentials directly
// from process.env.* and wrote state to fixed `.openclaw/operator/*` paths.
// On a multi-tenant SaaS that's a critical leak — Tenant A would write to
// Tenant B's activity log and act on Karling's Shopify token. Gap 7 and
// gap 8 in the 2026-05-14 BYOK launch-gate dossier.
//
// Resolution. A request comes in, we figure out which tenant it belongs to,
// and produce a context object. Two flavors:
//
//   - FOUNDER context: admin auth, anonymous (local dev), or no tenant
//     identified. Uses legacy `.openclaw/operator/*` paths so existing BV
//     and LL state keeps working without migration. Falls back to env-var
//     credentials so the founder's Anthropic/OpenAI/Shopify keys still work
//     for the management dashboard.
//
//   - TENANT context: real merchant identified by btk_* bearer. Uses
//     `.openclaw/tenants/<tenantId>/operator/*` so two tenants never share
//     a filesystem path. Pulls credentials from the encrypted vault on the
//     tenant record. NO env fallback for credentials — if a tenant hasn't
//     supplied their own key, the operation errors with a clear message so
//     they never silently spend on the founder's card.
//
// Path layout (per tenant; founder maps to legacy `.openclaw/operator/`):
//
//   <root>/conversations/<id>.jsonl
//   <root>/proposals/<id>/{proposal.json,brief.md?,roi.csv?}
//   <root>/tasks/<id>.json
//   <root>/activity.jsonl
//   <root>/state.json
//   <root>/memory.md
//   <root>/spend.jsonl
//   <root>/spend-budget.json
//   <root>/content-studio/<dropId>/*
//
// The `knowledge/` directory stays global (it's committed to the repo, ships
// with the deployment bundle, and is curated by the founder). Audit, runs,
// research/feeds, research/synthesis, brand assets, materialized-products
// also stay global for now — those are SaaS-level or pre-tenant artifacts.

// ── Constants ─────────────────────────────────────────────────────────────

// Only count as "running on Vercel for filesystem purposes" when this is
// actually a production runtime — not when .env.local was pulled from prod
// and shipped VERCEL=1 to the developer's box. NODE_ENV === "development"
// is the only reliable marker that we're in `next dev` (Next sets it itself
// and .env.local can't override).
const IS_VERCEL = process.env.VERCEL === "1" && process.env.NODE_ENV === "production";

/** Sentinel tenant id for the founder / admin / unauthenticated dev context.
 *  Maps to the legacy `.openclaw/operator/` paths so the founder's existing
 *  Black Vault and LockLayer state is preserved without migration. */
export const FOUNDER_TENANT_ID = "_founder";

/** Names of credentials this layer knows how to resolve. Each name maps to:
 *  - an EncryptedSecrets key (where the tenant's value lives), and
 *  - one or more env-var names (the founder fallback chain).
 *
 *  Adding a new credential here is the only place you should declare it. */
export type CredentialName =
  | "anthropicApiKey"
  | "openaiApiKey"
  | "shopifyAdminToken"
  | "shopifyStoreDomain"
  | "shopifyWebhookSecret"
  | "printfulApiKey"
  | "printfulStoreId"
  | "klaviyoApiKey"
  | "cjApiKey"
  | "cjEmail";

type CredentialDef = {
  /** Where the tenant's encrypted value lives, if applicable. */
  secretKey?: keyof EncryptedSecrets;
  /** Env-var names checked in order for founder/legacy fallback. */
  envFallback: string[];
  /** Used in errors / logs. */
  label: string;
};

const CREDENTIAL_DEFS: Record<CredentialName, CredentialDef> = {
  anthropicApiKey: {
    secretKey: "anthropicApiKey",
    envFallback: ["ANTHROPIC_API_KEY"],
    label: "Anthropic API key"
  },
  openaiApiKey: {
    secretKey: "openaiApiKey",
    envFallback: ["OPENAI_API_KEY"],
    label: "OpenAI API key"
  },
  shopifyAdminToken: {
    secretKey: "shopifyAdminToken",
    envFallback: ["SHOPIFY_BLACKVAULT_API_KEY", "SHOPIFY_API_KEY"],
    label: "Shopify admin token"
  },
  shopifyStoreDomain: {
    secretKey: "shopifyStoreDomain",
    envFallback: ["SHOPIFY_BLACKVAULT_STORE_DOMAIN", "SHOPIFY_STORE_DOMAIN"],
    label: "Shopify store domain"
  },
  shopifyWebhookSecret: {
    secretKey: "shopifyWebhookSecret",
    envFallback: ["SHOPIFY_BLACKVAULT_WEBHOOK_SECRET", "SHOPIFY_WEBHOOK_SECRET"],
    label: "Shopify webhook secret"
  },
  printfulApiKey: {
    secretKey: "printfulApiKey",
    envFallback: ["PRINTFUL_API_KEY"],
    label: "Printful API key"
  },
  printfulStoreId: {
    secretKey: "printfulStoreId",
    envFallback: ["PRINTFUL_STORE_ID"],
    label: "Printful store id"
  },
  klaviyoApiKey: {
    secretKey: "klaviyoApiKey",
    envFallback: ["KLAVIYO_API_KEY"],
    label: "Klaviyo API key"
  },
  cjApiKey: {
    secretKey: "cjApiKey",
    envFallback: ["CJ_API_KEY", "CJ_ACCESS_TOKEN"],
    label: "CJ Dropshipping API key"
  },
  cjEmail: {
    secretKey: "cjEmail",
    envFallback: ["CJ_EMAIL"],
    label: "CJ Dropshipping account email"
  }
};

// ── Types ─────────────────────────────────────────────────────────────────

export type TenantPaths = {
  /** Filesystem root for this tenant's operator state. */
  root: string;
  conversationsDir: string;
  proposalsDir: string;
  tasksDir: string;
  activityLog: string;
  stateFile: string;
  memoryFile: string;
  spendLog: string;
  spendBudgetFile: string;
  contentStudioDir: string;
  /** Per-conversation jsonl file resolver. */
  conversation(id: string): string;
  /** Per-proposal directory resolver. */
  proposal(id: string): string;
  /** Per-task file resolver. */
  task(id: string): string;
};

export type TenantContext = {
  /** Stable identifier. FOUNDER_TENANT_ID for admin/dev contexts; tnt_* for real tenants. */
  tenantId: string;
  /** True when this is the founder / admin context. Used to decide whether to
   *  fall through to env-var credentials and legacy filesystem paths. */
  isFounder: boolean;
  /** The full Tenant record when this is a real tenant; null in founder mode. */
  tenant: Tenant | null;
  /** Tenant-scoped filesystem paths. Use these instead of hardcoded
   *  `.openclaw/operator/*` literals. */
  paths: TenantPaths;
  /** Resolve a credential. Throws a clear error when missing. */
  requireSecret(name: CredentialName): string;
  /** Resolve a credential. Returns null when missing — for callers that can degrade. */
  getSecret(name: CredentialName): string | null;
  /** Does this context have a usable value for the named credential? */
  hasSecret(name: CredentialName): boolean;
};

// ── Path resolution ───────────────────────────────────────────────────────

/** Root path for a tenant's operator state. Founder maps to the legacy
 *  `.openclaw/operator/` so existing BV/LL state survives the migration
 *  without a one-shot move. Real tenants get their own subtree. */
function rootFor(tenantId: string): string {
  const base = IS_VERCEL ? path.join("/tmp", "openclaw") : path.join(process.cwd(), ".openclaw");
  if (tenantId === FOUNDER_TENANT_ID) {
    return path.join(base, "operator");
  }
  if (!/^[a-zA-Z0-9_]+$/.test(tenantId)) {
    throw new Error(`Invalid tenant id (path traversal blocked): ${tenantId.slice(0, 60)}`);
  }
  return path.join(base, "tenants", tenantId, "operator");
}

export function buildTenantPaths(tenantId: string): TenantPaths {
  const root = rootFor(tenantId);
  const conversationsDir = path.join(root, "conversations");
  const proposalsDir = path.join(root, "proposals");
  const tasksDir = path.join(root, "tasks");
  const contentStudioDir = path.join(root, "content-studio");
  return {
    root,
    conversationsDir,
    proposalsDir,
    tasksDir,
    activityLog: path.join(root, "activity.jsonl"),
    stateFile: path.join(root, "state.json"),
    memoryFile: path.join(root, "memory.md"),
    spendLog: path.join(root, "spend.jsonl"),
    spendBudgetFile: path.join(root, "spend-budget.json"),
    contentStudioDir,
    conversation(id: string) {
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        throw new Error(`Invalid conversation id: ${id.slice(0, 60)}`);
      }
      return path.join(conversationsDir, `${id}.jsonl`);
    },
    proposal(id: string) {
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        throw new Error(`Invalid proposal id: ${id.slice(0, 60)}`);
      }
      return path.join(proposalsDir, id);
    },
    task(id: string) {
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        throw new Error(`Invalid task id: ${id.slice(0, 60)}`);
      }
      return path.join(tasksDir, `${id}.json`);
    }
  };
}

// ── Credential resolution ────────────────────────────────────────────────

function trim(value: string | undefined | null): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t.length > 0 ? t : null;
}

function resolveCredential(
  name: CredentialName,
  isFounder: boolean,
  tenant: Tenant | null
): string | null {
  const def = CREDENTIAL_DEFS[name];

  // Tenant-mode: secret vault first. No env fallback — a tenant who hasn't
  // configured their own key gets a clear error, not a silent charge to the
  // founder's card.
  if (!isFounder && tenant) {
    const sk = def.secretKey;
    if (sk && tenant.secrets[sk]) {
      try {
        return getTenantSecret(tenant, sk);
      } catch {
        // Encryption failure (key rotation, corruption) — surface as missing.
        return null;
      }
    }
    return null;
  }

  // Founder mode: env-var fallback chain. This preserves the pre-BYOK
  // behavior for Karling's instance and for local dev where env vars are set
  // in .env.local.
  for (const envName of def.envFallback) {
    const v = trim(process.env[envName]);
    if (v) return v;
  }
  return null;
}

// ── Context construction ────────────────────────────────────────────────

/** Build a founder-mode context. The default when no real tenant is
 *  identified — covers admin auth, local dev, cron jobs running on the
 *  founder's behalf, and the management dashboard. */
export function founderContext(): TenantContext {
  const paths = buildTenantPaths(FOUNDER_TENANT_ID);
  return {
    tenantId: FOUNDER_TENANT_ID,
    isFounder: true,
    tenant: null,
    paths,
    getSecret(name) {
      return resolveCredential(name, true, null);
    },
    hasSecret(name) {
      return resolveCredential(name, true, null) !== null;
    },
    requireSecret(name) {
      const v = resolveCredential(name, true, null);
      if (!v) {
        throw new Error(
          `Founder context missing ${CREDENTIAL_DEFS[name].label}. ` +
            `Set one of: ${CREDENTIAL_DEFS[name].envFallback.join(", ")}.`
        );
      }
      return v;
    }
  };
}

/** Build a real-tenant context. Paths are scoped under the tenant's
 *  directory; credentials must come from the tenant's encrypted vault. */
export function tenantContext(tenant: Tenant): TenantContext {
  const paths = buildTenantPaths(tenant.id);
  return {
    tenantId: tenant.id,
    isFounder: false,
    tenant,
    paths,
    getSecret(name) {
      return resolveCredential(name, false, tenant);
    },
    hasSecret(name) {
      return resolveCredential(name, false, tenant) !== null;
    },
    requireSecret(name) {
      const v = resolveCredential(name, false, tenant);
      if (!v) {
        const def = CREDENTIAL_DEFS[name];
        throw new Error(
          `Tenant ${tenant.brandSlug} has not configured a ${def.label}. ` +
            `Set it from the operator dashboard before calling tools that need it.`
        );
      }
      return v;
    }
  };
}

/** Resolve a context from an incoming request. The middleware already
 *  validated the bearer; we just look it up and return the appropriate
 *  flavor. Failures degrade to founder context so admin and local dev keep
 *  working — they would have failed earlier in middleware if they shouldn't. */
export async function resolveTenantContext(req: Request): Promise<TenantContext> {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : "";

  if (bearer.startsWith("btk_")) {
    const tenant = await getTenantByBearer(bearer);
    if (tenant) return tenantContext(tenant);
  }

  // No btk_ bearer → admin/anonymous/local dev. Founder context.
  return founderContext();
}

/** Build a context for a known tenant id. Used by background jobs and tests
 *  that don't have a Request handy. */
export async function contextForTenantId(tenantId: string): Promise<TenantContext> {
  if (tenantId === FOUNDER_TENANT_ID) return founderContext();
  const tenant = await getTenant(tenantId);
  if (!tenant) {
    throw new Error(`No tenant with id ${tenantId.slice(0, 60)}`);
  }
  return tenantContext(tenant);
}
