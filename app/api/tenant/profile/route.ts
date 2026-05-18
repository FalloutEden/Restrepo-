import { NextResponse } from "next/server";

import { resolveTenantContext } from "@/lib/tenant-context";
import { patchTenantProfile, readTenantProfile, type TenantBrandProfile } from "@/lib/tenant-profile";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/tenant/profile — tenant manages their own brand profile.
//
// GET returns the current profile (or null if intake hasn't happened yet).
// PATCH merges a small whitelist of fields into the existing profile.
//
// Why a whitelist: the profile drives operator behavior, and we don't want
// the API to be a back-door for setting arbitrary fields (e.g. completedAt,
// shopifyStoreDomain — which has a sibling field in the encrypted vault and
// needs to go through /api/tenant/credentials so it's audited as a secret).
//
// Auth: tenant bearer required. Admin callers are rejected — founder profile
// lives in legacy paths and isn't managed via this surface.

const ALLOWED_FIELDS: Array<keyof TenantBrandProfile> = [
  "brandName",
  "tagline",
  "audience",
  "voice",
  "fulfillment",
  "domain",
  "tierOneNotes"
];

type PatchBody = Partial<Record<(typeof ALLOWED_FIELDS)[number], string | null>>;

function ipFromRequest(req: Request): string | undefined {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined;
}

export async function GET(request: Request) {
  const ctx = await resolveTenantContext(request);
  if (ctx.isFounder || !ctx.tenant) {
    return NextResponse.json({ error: "Tenant bearer required." }, { status: 401 });
  }
  const profile = await readTenantProfile(ctx.tenant.id);
  return NextResponse.json({ tenantId: ctx.tenant.id, profile });
}

export async function PATCH(request: Request) {
  const ctx = await resolveTenantContext(request);
  if (ctx.isFounder || !ctx.tenant) {
    return NextResponse.json({ error: "Tenant bearer required." }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Build the patch from the allowed fields only. Anything else is silently
  // ignored so a misshapen client can't poison the profile.
  const patch: Partial<TenantBrandProfile> = {};
  const written: string[] = [];
  for (const key of ALLOWED_FIELDS) {
    const raw = body[key];
    if (raw === undefined) continue;
    if (raw === null) {
      // Explicit null = clear the field.
      (patch as Record<string, unknown>)[key] = undefined;
      written.push(key);
      continue;
    }
    if (typeof raw !== "string") {
      return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
    }
    const trimmed = raw.trim();
    if (key === "domain" && trimmed.length > 0) {
      // Cheap shape check — accept anything that looks like a hostname so
      // we don't reject .shop, .co, .store, etc. unfairly.
      const normalized = trimmed.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(normalized)) {
        return NextResponse.json(
          { error: "domain should look like a hostname (e.g. yourstore.com)" },
          { status: 400 }
        );
      }
      (patch as Record<string, unknown>)[key] = normalized;
      written.push(key);
      continue;
    }
    if (key === "fulfillment") {
      const allowed: TenantBrandProfile["fulfillment"][] = ["printful", "cj-dropship", "digital", "manual", "unknown"];
      if (!allowed.includes(trimmed as TenantBrandProfile["fulfillment"])) {
        return NextResponse.json({ error: `fulfillment must be one of: ${allowed.join(", ")}` }, { status: 400 });
      }
      (patch as Record<string, unknown>)[key] = trimmed;
      written.push(key);
      continue;
    }
    (patch as Record<string, unknown>)[key] = trimmed;
    written.push(key);
  }

  if (written.length === 0) {
    return NextResponse.json(
      { error: "No recognized fields. Allowed: " + ALLOWED_FIELDS.join(", ") },
      { status: 400 }
    );
  }

  const next = await patchTenantProfile(patch, ctx.tenant.id);

  audit({
    action: "tenant.updated",
    actor: ctx.tenant.id,
    target: ctx.tenant.id,
    ip: ipFromRequest(request),
    detail: { fields: written },
    ok: true
  });

  return NextResponse.json({ ok: true, updated: written, profile: next });
}
