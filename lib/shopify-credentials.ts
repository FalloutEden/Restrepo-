import "server-only";

import { resolveBrand, type Brand } from "@/lib/brands";

export type ShopifyCredentials = {
  brandSlug: string;
  brandName: string;
  token: string;
  storeDomain: string;
  apiVersion: string;
};

const SHOPIFY_ADMIN_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2024-04";

// LockLayer was the original (and only) store for a long time, so its env vars
// are unprefixed: SHOPIFY_API_KEY / SHOPIFY_STORE_DOMAIN. New brands get a
// SHOPIFY_<BRAND>_* prefix.
const BRAND_ENV_PREFIX: Record<string, string | null> = {
  locklayer: null,
  "black-vault-apparel": "BLACKVAULT"
};

function envKey(prefix: string | null, suffix: string) {
  return prefix ? `SHOPIFY_${prefix}_${suffix}` : `SHOPIFY_${suffix}`;
}

export function resolveShopifyCredentials(brand: Brand | string | undefined | null): ShopifyCredentials {
  const resolved: Brand = typeof brand === "object" && brand ? brand : resolveBrand(brand ?? undefined);
  const prefix = BRAND_ENV_PREFIX[resolved.slug] ?? null;

  const tokenKey = envKey(prefix, "API_KEY");
  const domainKey = envKey(prefix, "STORE_DOMAIN");

  const token = process.env[tokenKey]?.trim();
  const storeDomain = process.env[domainKey]?.trim();

  if (!token) {
    throw new Error(`Missing ${tokenKey} for brand ${resolved.slug}.`);
  }
  if (!storeDomain) {
    throw new Error(`Missing ${domainKey} for brand ${resolved.slug}.`);
  }

  return {
    brandSlug: resolved.slug,
    brandName: resolved.name,
    token,
    storeDomain,
    apiVersion: SHOPIFY_ADMIN_API_VERSION
  };
}

// Returns creds for every brand whose env vars are configured. Used when
// aggregating across stores (e.g. listing draft products in the dashboard).
export function listConfiguredShopifyCredentials(): ShopifyCredentials[] {
  const result: ShopifyCredentials[] = [];
  for (const slug of Object.keys(BRAND_ENV_PREFIX)) {
    try {
      result.push(resolveShopifyCredentials(slug));
    } catch {
      // brand not configured in this environment — skip
    }
  }
  return result;
}
