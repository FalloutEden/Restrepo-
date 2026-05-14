import "server-only";

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { buildTenantPaths, FOUNDER_TENANT_ID } from "@/lib/tenant-context";

// Tenant brand profile — captured during the turn-1 intake flow (gap 3
// of the 2026-05-14 BYOK launch-gate dossier).
//
// What this exists for: a stranger lands on /operator without context,
// the operator self-introduces (gap 4), runs a short intake conversation
// asking for brand name, audience, voice, fulfillment lane, and Shopify
// store info. The answers persist here so the operator never has to ask
// twice — every subsequent turn the system prompt pulls this in and
// references the tenant's brand by name.
//
// Storage: per-tenant JSON at .openclaw/tenants/<id>/operator/profile.json
// (or .openclaw/operator/profile.json for the founder). Same backward-compat
// model as the rest of operator-state.
//
// Schema: kept intentionally narrow. New fields can be added without
// migration since unknown fields are tolerated and missing fields are
// treated as "not yet captured."

export type FulfillmentLane = "printful" | "cj-dropship" | "digital" | "manual" | "unknown";

export type TenantBrandProfile = {
  /** When the intake was first completed enough to mark the profile "ready." */
  completedAt?: string;
  /** Last update — bumped on every set. */
  updatedAt: string;

  // Identity
  brandName?: string;
  tagline?: string;

  // Audience + voice — strings the operator uses verbatim in copy
  audience?: string;
  voice?: string;

  // Platform wiring
  fulfillment?: FulfillmentLane;
  shopifyStoreDomain?: string; // e.g. "pawvault.myshopify.com"

  // What the merchant has already done (Tier 1 footwork) — short notes
  // so the operator can avoid asking them to do it again.
  tierOneNotes?: string;

  // Free-form notes the operator captures during intake (anything that
  // doesn't fit a field above).
  notes?: string[];
};

const PROFILE_FILE_NAME = "profile.json";

function profilePathFor(tenantId: string): string {
  const paths = buildTenantPaths(tenantId);
  return path.join(paths.root, PROFILE_FILE_NAME);
}

/** Read a tenant's brand profile. Returns null when no profile has been
 *  captured yet — the operator interprets that as "run the intake flow." */
export async function readTenantProfile(
  tenantId: string = FOUNDER_TENANT_ID
): Promise<TenantBrandProfile | null> {
  const fp = profilePathFor(tenantId);
  if (!existsSync(fp)) return null;
  try {
    const raw = await fs.readFile(fp, "utf8");
    return JSON.parse(raw) as TenantBrandProfile;
  } catch {
    return null;
  }
}

/** Merge a patch into the existing profile (or create one). Always updates
 *  updatedAt. Sets completedAt the first time the profile has enough fields
 *  to be useful (brandName + audience + voice + fulfillment all present). */
export async function patchTenantProfile(
  patch: Partial<TenantBrandProfile>,
  tenantId: string = FOUNDER_TENANT_ID
): Promise<TenantBrandProfile> {
  const fp = profilePathFor(tenantId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  const current = (await readTenantProfile(tenantId)) ?? { updatedAt: new Date().toISOString() };
  const next: TenantBrandProfile = {
    ...current,
    ...patch,
    notes: dedupeNotes([...(current.notes ?? []), ...(patch.notes ?? [])]),
    updatedAt: new Date().toISOString()
  };
  if (!next.completedAt && isProfileComplete(next)) {
    next.completedAt = next.updatedAt;
  }
  await fs.writeFile(fp, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Does this profile have the minimum fields needed to drive the operator's
 *  brand-aware behavior? brandName + audience + voice + fulfillment lane is
 *  the bar. Without these the operator should keep running intake. */
export function isProfileComplete(profile: TenantBrandProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.brandName?.trim() &&
      profile.audience?.trim() &&
      profile.voice?.trim() &&
      profile.fulfillment &&
      profile.fulfillment !== "unknown"
  );
}

/** Compact string the operator can use to tell whether a profile exists +
 *  what's still missing. Used in the system prompt's dynamic block. */
export function summarizeProfileStatus(profile: TenantBrandProfile | null): {
  hasProfile: boolean;
  isComplete: boolean;
  missing: string[];
  brandName?: string;
} {
  if (!profile) {
    return {
      hasProfile: false,
      isComplete: false,
      missing: ["brandName", "audience", "voice", "fulfillment"],
      brandName: undefined
    };
  }
  const missing: string[] = [];
  if (!profile.brandName?.trim()) missing.push("brandName");
  if (!profile.audience?.trim()) missing.push("audience");
  if (!profile.voice?.trim()) missing.push("voice");
  if (!profile.fulfillment || profile.fulfillment === "unknown") missing.push("fulfillment");
  return {
    hasProfile: true,
    isComplete: missing.length === 0,
    missing,
    brandName: profile.brandName
  };
}

function dedupeNotes(notes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of notes) {
    const trimmed = n.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out.slice(-20); // cap to last 20 notes so the prompt stays bounded
}
