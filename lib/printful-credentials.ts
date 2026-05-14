import "server-only";

import type { TenantContext } from "@/lib/tenant-context";

// Printful credential resolution. Mirrors lib/shopify-credentials.ts:
//   - Tenant context → pull from the encrypted vault (no env fallback,
//     so a tenant who hasn't configured Printful gets a clear "configure
//     in dashboard" error rather than silently using the founder's key).
//   - Founder context (or no ctx supplied) → legacy PRINTFUL_API_KEY +
//     PRINTFUL_STORE_ID env vars. Preserves pre-BYOK behavior for
//     Karling's instance and for cron/admin paths not yet wired through.

export type PrintfulCredentials = {
  token: string;
  storeId: string;
  /** Default Printful variant id used by buildPrintfulProduct when the
   *  spec doesn't carry one. Founder env-var path only — tenant context
   *  doesn't carry a default variant since each tenant chooses their own
   *  catalog blanks via the merchant UI. */
  defaultVariantId?: number;
  /** Default retail price used by buildPrintfulProduct when the spec
   *  doesn't carry one. Founder env-var path only. */
  defaultRetailPrice?: string;
};

function trim(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length > 0 ? t : null;
}

export function resolvePrintfulCredentials(tenantCtx?: TenantContext): PrintfulCredentials {
  // Tenant context — strict, no env fallback.
  if (tenantCtx && !tenantCtx.isFounder) {
    const token = tenantCtx.requireSecret("printfulApiKey");
    const storeId = tenantCtx.requireSecret("printfulStoreId");
    return { token, storeId };
  }

  // Founder env-var path.
  const token = trim(process.env.PRINTFUL_API_KEY);
  const storeId = trim(process.env.PRINTFUL_STORE_ID);
  if (!token) {
    throw new Error("Missing PRINTFUL_API_KEY in environment.");
  }
  if (!storeId) {
    throw new Error("Missing PRINTFUL_STORE_ID in environment.");
  }
  const variantIdRaw = trim(process.env.PRINTFUL_DEFAULT_VARIANT_ID);
  const defaultVariantId =
    variantIdRaw && Number.isFinite(Number(variantIdRaw)) ? Number(variantIdRaw) : undefined;
  const defaultRetailPrice = trim(process.env.PRINTFUL_RETAIL_PRICE) ?? undefined;
  return { token, storeId, defaultVariantId, defaultRetailPrice };
}

/** Convenience: does this context have Printful configured? Used by tools
 *  that want to short-circuit with a clear error instead of waiting until
 *  the first HTTP request. */
export function hasPrintfulCredentials(tenantCtx?: TenantContext): boolean {
  try {
    resolvePrintfulCredentials(tenantCtx);
    return true;
  } catch {
    return false;
  }
}
