import "server-only";

import {
  createTenant,
  getTenantByBrandSlug,
  setTenantSecret,
  updateTenant,
  cancelTenant,
  type Tenant
} from "@/lib/tenancy";
import { brandSlugFromShop } from "@/lib/shopify-oauth";
import { audit } from "@/lib/audit";

// Turn a freshly OAuth-installed Shopify shop into a tenant of the operator.
// The shop domain is the stable identity; the OAuth offline access token becomes
// the tenant's shopifyAdminToken in the encrypted vault — so every BYOK tool we
// lifted works for this shop immediately, with no manual token paste.

const SHOPIFY_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2024-04";

type ShopInfo = { name: string; email: string };

async function fetchShopInfo(shop: string, accessToken: string): Promise<ShopInfo> {
  try {
    const r = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" }
    });
    if (r.ok) {
      const body = (await r.json()) as { shop?: { name?: string; email?: string } };
      return {
        name: body.shop?.name?.trim() || shop.replace(/\.myshopify\.com$/, ""),
        email: body.shop?.email?.trim() || `owner@${shop}`
      };
    }
  } catch {
    // fall through to defaults — onboarding must not fail on a shop-info blip
  }
  return { name: shop.replace(/\.myshopify\.com$/, ""), email: `owner@${shop}` };
}

/**
 * Find-or-create the tenant for a shop and store its OAuth token. Idempotent:
 * a reinstall updates the existing tenant's token rather than duplicating it.
 * Returns the tenant (with its bearer token, used to address the embedded app).
 */
export async function onboardShopAsTenant(params: {
  shop: string;
  accessToken: string;
  scope: string;
}): Promise<Tenant> {
  const { shop, accessToken, scope } = params;
  const brandSlug = brandSlugFromShop(shop);
  const info = await fetchShopInfo(shop, accessToken);

  let tenant = await getTenantByBrandSlug(brandSlug);
  if (!tenant) {
    tenant = await createTenant({ brandSlug, ownerEmail: info.email, brandName: info.name });
    audit({ action: "tenant.created", actor: "shopify-oauth", target: tenant.id, detail: { shop, scope } });
  } else {
    audit({ action: "tenant.updated", actor: "shopify-oauth", target: tenant.id, detail: { shop, reinstall: true } });
  }

  // Store the OAuth token + domain in the encrypted vault. This is what makes
  // the lifted BYOK tools operate on the merchant's own store.
  await setTenantSecret(tenant.id, "shopifyAdminToken", accessToken);
  await setTenantSecret(tenant.id, "shopifyStoreDomain", shop);
  await updateTenant(tenant.id, { subscriptionStatus: tenant.subscriptionStatus ?? "trialing" });

  // Re-read so the caller gets the token-laden record.
  const refreshed = await getTenantByBrandSlug(brandSlug);
  return refreshed ?? tenant;
}

/**
 * GDPR shop/redact + app uninstall cleanup: remove the credentials/PII we hold
 * for a shop and cancel the tenant. (We don't store end-customer PII beyond
 * Shopify itself; the sensitive data we hold is the shop's tokens + owner email.)
 */
export async function offboardShop(shop: string): Promise<void> {
  const brandSlug = brandSlugFromShop(shop);
  const tenant = await getTenantByBrandSlug(brandSlug);
  if (!tenant) return;
  // Clear every stored secret for this tenant.
  for (const key of Object.keys(tenant.secrets) as Array<keyof typeof tenant.secrets>) {
    await setTenantSecret(tenant.id, key, undefined);
  }
  await cancelTenant(tenant.id);
  audit({ action: "tenant.canceled", actor: "shopify-gdpr", target: tenant.id, detail: { shop, reason: "redact/uninstall" } });
}
