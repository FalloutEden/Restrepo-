import "server-only";

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

import { resolveBrand, type Brand } from "@/lib/brands";

// Brand-level info that drives policy generation. Anything in here flows into
// privacy / terms / refund / shipping / contact. Stored on disk per brand so
// the policies can be re-generated deterministically.

export type BrandPolicyConfig = {
  brandSlug: string;
  // Customer-facing legal name. For sole props this is the DBA — e.g.
  // "Black Vault Apparel" or "LockLayer Security". When the user files an
  // LLC later, swap to "<LLC name> dba <brand>".
  legalEntity: string;
  // Operating jurisdiction (governing law in ToS, "based in" in privacy).
  governingState: string;
  governingCountry: string;
  // Single contact channel. Email-only is acceptable in US policies; physical
  // address is only legally required for marketing email (CAN-SPAM) — kept
  // optional here so the user can leave it blank until launch.
  supportEmail: string;
  mailingAddress?: string;
  // Customer-protection knobs.
  returnsWindowDays: number;
  // Lower bound on customer age for purchases (US standard: 18 to form a contract).
  minimumAge: number;
  // Fulfillment partner shown in shipping/refund text. Drives lead-time copy
  // and the "made to order" vs "shipped from warehouse" framing.
  fulfillmentPartner: "printful" | "cj-dropshipping";
  // Lead-time hints (business days). Used in shipping policy.
  productionDays: { min: number; max: number };
  // Optional addendum the user wants pinned at the top (e.g. "Free shipping
  // on orders over $75 through Memorial Day"). Skipped when empty.
  noticeBanner?: string;
  // For LockLayer: surface security-product liability language. Off by
  // default for apparel.
  includeSecurityLiabilityDisclaimer: boolean;
};

export type AllBrandPolicyConfigs = Record<string, BrandPolicyConfig>;

const ROOT = path.join(process.cwd(), ".openclaw", "operator", "brand-info");

function configPath(brandSlug: string) {
  return path.join(ROOT, `${brandSlug}.json`);
}

async function fileExists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// Defaults derived from lib/brands.ts so users can change one brand without
// touching the rest. Override by writing the per-brand JSON file.
export function defaultPolicyConfig(brand: Brand | string): BrandPolicyConfig {
  const resolved = typeof brand === "object" ? brand : resolveBrand(brand);
  const isApparel = resolved.defaultFulfillment === "printful";

  // The user only confirmed support@blackvaultapparel.com on 2026-05-01, so
  // both brands share that inbox until told otherwise. Splitting later is one
  // JSON edit.
  const supportEmail = "support@blackvaultapparel.com";

  return {
    brandSlug: resolved.slug,
    legalEntity: resolved.name,
    governingState: "Utah",
    governingCountry: "United States",
    supportEmail,
    returnsWindowDays: 30,
    minimumAge: 18,
    fulfillmentPartner: isApparel ? "printful" : "cj-dropshipping",
    productionDays: isApparel ? { min: 2, max: 7 } : { min: 5, max: 15 },
    includeSecurityLiabilityDisclaimer: !isApparel
  };
}

export async function loadPolicyConfig(brandSlug: string): Promise<BrandPolicyConfig> {
  const file = configPath(brandSlug);
  if (!(await fileExists(file))) {
    return defaultPolicyConfig(brandSlug);
  }
  try {
    const raw = await readFile(file, "utf8");
    const stored = JSON.parse(raw) as Partial<BrandPolicyConfig>;
    return { ...defaultPolicyConfig(brandSlug), ...stored, brandSlug };
  } catch {
    return defaultPolicyConfig(brandSlug);
  }
}

export async function savePolicyConfig(config: BrandPolicyConfig): Promise<void> {
  await mkdir(ROOT, { recursive: true });
  await writeFile(configPath(config.brandSlug), JSON.stringify(config, null, 2), "utf8");
}
