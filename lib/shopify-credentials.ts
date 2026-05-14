import "server-only";

import { resolveBrand, type Brand } from "@/lib/brands";
import type { TenantContext } from "@/lib/tenant-context";

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

/** Build credentials from a tenant's encrypted secret vault. Throws a clear
 *  "configure in dashboard" error if the tenant hasn't set both fields. */
function credsFromTenantContext(tenantCtx: TenantContext): ShopifyCredentials {
  if (!tenantCtx.tenant) {
    throw new Error("credsFromTenantContext called without a real tenant");
  }
  const token = tenantCtx.requireSecret("shopifyAdminToken");
  const storeDomain = tenantCtx.requireSecret("shopifyStoreDomain");
  return {
    // For tenants there's a single store — brand identity comes from the
    // Tenant.brand record, not env var prefixes. Use brandSlug for routing,
    // brand.name for display.
    brandSlug: tenantCtx.tenant.brandSlug,
    brandName: tenantCtx.tenant.brand.name,
    token,
    storeDomain,
    apiVersion: SHOPIFY_ADMIN_API_VERSION
  };
}

/** Resolve Shopify credentials. Tenant-aware:
 *
 *  - Tenant context (real merchant): pull from the encrypted secret vault.
 *    `brand` argument is ignored — tenants have exactly one Shopify store
 *    attached to their tenant record. If the tenant hasn't configured
 *    shopifyAdminToken or shopifyStoreDomain, requireSecret throws a clear
 *    "configure in dashboard" error.
 *  - Founder context (or no tenantCtx supplied): fall through to the legacy
 *    env-var-by-brand-prefix path. Preserves pre-BYOK behavior for Karling's
 *    instance and for cron/admin code that hasn't been wired through yet.
 */
export function resolveShopifyCredentials(
  brand: Brand | string | undefined | null,
  tenantCtx?: TenantContext
): ShopifyCredentials {
  if (tenantCtx && !tenantCtx.isFounder) {
    return credsFromTenantContext(tenantCtx);
  }

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
// aggregating across stores (e.g. listing draft products in the founder
// dashboard). Tenant equivalent is a single-element list with the tenant's
// own creds — see listShopifyCredentialsForContext below.
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

/** Tenant-aware variant: founder returns every configured brand,
 *  tenant returns their single store's creds. Used by aggregation tools
 *  (list_drafts across brands, list_cleanup_queue) so a tenant doesn't
 *  accidentally enumerate the founder's BV/LL stores. */
export function listShopifyCredentialsForContext(tenantCtx: TenantContext): ShopifyCredentials[] {
  if (tenantCtx.isFounder) return listConfiguredShopifyCredentials();
  try {
    return [credsFromTenantContext(tenantCtx)];
  } catch {
    // Tenant hasn't configured their Shopify yet — return empty so the
    // aggregating tool can report "no stores connected" cleanly.
    return [];
  }
}
