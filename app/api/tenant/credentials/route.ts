import { NextResponse } from "next/server";

import { resolveTenantContext } from "@/lib/tenant-context";
import { setTenantSecret, type EncryptedSecrets } from "@/lib/tenancy";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/tenant/credentials — tenant pastes their third-party API tokens,
// we encrypt them into the tenant vault via lib/tenancy.setTenantSecret.
//
// This is the ONLY surface tenants use to enter credentials. They never see
// .env.local, Vercel CLI, or any infrastructure. Form field → encrypted row
// in Postgres → operator tools read back via tenantContext.requireSecret.
//
// Body shape (every field optional — tenants can stage their setup):
//   {
//     shopifyAdminToken?:   string  // shpat_…
//     shopifyStoreDomain?:  string  // your-store.myshopify.com
//     shopifyWebhookSecret?: string // shpss_…
//     printfulApiKey?:      string
//     printfulStoreId?:     string
//   }
//
// Auth: tenant bearer required. Admin callers are rejected — they manage
// their own credentials via .env / Vercel env vars, not through this surface.

const ALLOWED_KEYS: Array<keyof EncryptedSecrets> = [
  "shopifyAdminToken",
  "shopifyStoreDomain",
  "shopifyWebhookSecret",
  "printfulApiKey",
  "printfulStoreId"
];

type RequestBody = Partial<Record<(typeof ALLOWED_KEYS)[number], string>>;

function ipFromRequest(req: Request): string | undefined {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined;
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
    // Lightweight shape checks — better to reject obvious mispastes here
    // than to fail at the Shopify/Printful API later with an opaque 401.
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
