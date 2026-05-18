import { NextResponse } from "next/server";

import { resolveTenantContext } from "@/lib/tenant-context";
import { getTenant, setTenantSecret, type EncryptedSecrets } from "@/lib/tenancy";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/tenant/credentials — tenant manages their own third-party API tokens.
// This is the ONLY surface tenants use to enter credentials. They never see
// .env.local, Vercel CLI, or any infrastructure. Form field → encrypted row
// in Postgres → operator tools read back via tenantContext.requireSecret.
//
// GET — returns which credentials are configured (presence only, never the
//       values). Used by /settings to render "✓ Configured" indicators.
// POST — writes one or more credentials to the encrypted vault. Each field
//        is shape-validated before any write happens. Empty string = clear.
//
// Auth: tenant bearer required for both verbs. Admin callers are rejected —
// they manage their own credentials via .env / Vercel env vars.

const ALLOWED_KEYS: Array<keyof EncryptedSecrets> = [
  "shopifyAdminToken",
  "shopifyStoreDomain",
  "shopifyWebhookSecret",
  "printfulApiKey",
  "printfulStoreId",
  "klaviyoApiKey",
  "anthropicApiKey",
  "openaiApiKey",
  "stripeConnectAccountId"
];

type RequestBody = Partial<Record<(typeof ALLOWED_KEYS)[number], string>>;

function ipFromRequest(req: Request): string | undefined {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined;
}

export async function GET(request: Request) {
  const ctx = await resolveTenantContext(request);
  if (ctx.isFounder || !ctx.tenant) {
    return NextResponse.json(
      { error: "Tenant bearer required." },
      { status: 401 }
    );
  }
  // Re-read the tenant so the response reflects whatever the latest write
  // landed in Postgres. ctx.tenant could be slightly stale if a prior POST
  // happened in the same request lifecycle.
  const tenant = await getTenant(ctx.tenant.id);
  const configured: Record<string, boolean> = {};
  for (const key of ALLOWED_KEYS) {
    configured[key] = Boolean(tenant?.secrets?.[key]);
  }
  return NextResponse.json({ tenantId: ctx.tenant.id, configured });
}

export async function POST(request: Request) {
  const ctx = await resolveTenantContext(request);
  if (ctx.isFounder || !ctx.tenant) {
    return NextResponse.json(
      { error: "Tenant bearer required. Admin credentials are managed via Vercel project env, not this endpoint." },
      { status: 401 }
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ip = ipFromRequest(request);

  // Validate shapes BEFORE writing anything so a half-saved state can't happen.
  const cleaned: RequestBody = {};
  for (const key of ALLOWED_KEYS) {
    const raw = body[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string") {
      return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
    }
    const trimmed = raw.trim();
    if (trimmed === "") {
      // Empty string = caller wants to clear the credential.
      cleaned[key] = "";
      continue;
    }
    // Lightweight shape checks — better to reject obvious mispastes here than
    // to fail at the third-party API later with an opaque 401.
    if (key === "shopifyAdminToken" && !/^shpat_[A-Za-z0-9]{20,}$/.test(trimmed)) {
      return NextResponse.json(
        { error: "shopifyAdminToken must look like shpat_… (admin API access token)" },
        { status: 400 }
      );
    }
    if (key === "shopifyStoreDomain") {
      const normalized = trimmed.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (!/^[a-z0-9-]+\.myshopify\.com$/.test(normalized)) {
        return NextResponse.json(
          { error: "shopifyStoreDomain must look like your-store.myshopify.com" },
          { status: 400 }
        );
      }
      cleaned[key] = normalized;
      continue;
    }
    if (key === "shopifyWebhookSecret" && !/^shpss_[A-Za-z0-9]{16,}$/.test(trimmed)) {
      return NextResponse.json(
        { error: "shopifyWebhookSecret must look like shpss_… (Shopify webhook signing secret)" },
        { status: 400 }
      );
    }
    if (key === "anthropicApiKey" && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
      return NextResponse.json(
        { error: "anthropicApiKey must look like sk-ant-… (Anthropic console API key)" },
        { status: 400 }
      );
    }
    if (key === "openaiApiKey" && !/^sk-[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
      return NextResponse.json(
        { error: "openaiApiKey must look like sk-… (OpenAI platform API key)" },
        { status: 400 }
      );
    }
    if (key === "klaviyoApiKey" && !/^pk_[A-Za-z0-9]{16,}$/.test(trimmed)) {
      return NextResponse.json(
        { error: "klaviyoApiKey must look like pk_… (Klaviyo private API key)" },
        { status: 400 }
      );
    }
    if (key === "stripeConnectAccountId" && !/^acct_[A-Za-z0-9]{14,}$/.test(trimmed)) {
      return NextResponse.json(
        { error: "stripeConnectAccountId must look like acct_… (Stripe connected account id)" },
        { status: 400 }
      );
    }
    cleaned[key] = trimmed;
  }

  const written: string[] = [];
  for (const key of ALLOWED_KEYS) {
    if (!(key in cleaned)) continue;
    const value = cleaned[key];
    // Empty string clears the credential (passes undefined into setTenantSecret).
    await setTenantSecret(ctx.tenant.id, key, value === "" ? undefined : value);
    written.push(key);
  }

  if (written.length === 0) {
    return NextResponse.json(
      { error: "No recognized credentials in body. Allowed: " + ALLOWED_KEYS.join(", ") },
      { status: 400 }
    );
  }

  // Audit log — don't log the values, just the keys that were set/cleared.
  audit({
    action: "tenant.secret_set",
    actor: ctx.tenant.id,
    target: ctx.tenant.id,
    ip,
    detail: { keys: written },
    ok: true
  });

  return NextResponse.json({ ok: true, updated: written });
}
