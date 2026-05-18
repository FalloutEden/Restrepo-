import "server-only";

import { listConfiguredShopifyCredentials, resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";
import { listShopifyDrafts } from "@/lib/shopify-service";
import type { TenantContext } from "@/lib/tenant-context";

// Read-only health probe for everything that needs to be true before a store
// can flip the launch switch. Two audiences:
//
//   - FOUNDER (admin context, no tenantCtx OR tenantCtx.isFounder === true):
//     Runs every check across every configured brand. Includes deployment-
//     level checks (operator auth secret, required env vars, Printful
//     auto-confirm posture) that are about the platform itself.
//
//   - TENANT (real merchant, tenantCtx.isFounder === false): Runs only the
//     four checks that apply to THEIR store (Shopify connection, password
//     gate, products, drafts). Skips the deployment checks — those are about
//     infrastructure they don't own. Credential resolution reads from the
//     encrypted tenant vault via credsFromTenantContext; no env-var fallback.

export type CheckStatus = "ok" | "warn" | "fail";

export type LaunchCheck = {
  id: string;
  name: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
};

export type LaunchStatusReport = {
  brand: string;
  generatedAt: string;
  overall: CheckStatus;
  checks: LaunchCheck[];
};

function pickWorst(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "ok";
}

// ── Shopify-shaped check helpers ──────────────────────────────────────────
// These take pre-resolved credentials so the same logic can serve founder
// (env-var creds) and tenant (vault creds) without re-resolving per check.

async function shopifyConnectionCheck(creds: ShopifyCredentials, tenantCtx?: TenantContext): Promise<LaunchCheck> {
  try {
    const url = `https://${creds.storeDomain}/admin/api/${creds.apiVersion}/shop.json`;
    const r = await fetch(url, {
      headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" }
    });
    if (!r.ok) {
      return {
        id: "shopify_connection",
        name: "Shopify admin token works",
        status: "fail",
        detail: `Shopify returned ${r.status}`,
        fix: tenantCtx && !tenantCtx.isFounder
          ? "Open Settings → Shopify and paste a fresh admin API token from your store's custom app."
          : r.status === 401
            ? "Token is invalid or revoked. Re-authorize the BV custom app and update SHOPIFY_BLACKVAULT_API_KEY."
            : "Check store domain + API version in lib/shopify-credentials.ts."
      };
    }
    return {
      id: "shopify_connection",
      name: "Shopify admin token works",
      status: "ok",
      detail: `Connected to ${creds.storeDomain}`
    };
  } catch (e) {
    return {
      id: "shopify_connection",
      name: "Shopify admin token works",
      status: "fail",
      detail: e instanceof Error ? e.message : "Unknown error",
      fix: tenantCtx && !tenantCtx.isFounder
        ? "Connect your Shopify store from Settings to enable this check."
        : "Set SHOPIFY_BLACKVAULT_API_KEY and SHOPIFY_BLACKVAULT_STORE_DOMAIN in your env."
    };
  }
}

async function passwordProtectionCheck(creds: ShopifyCredentials): Promise<LaunchCheck> {
  try {
    const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}/shop.json?fields=password_enabled`, {
      headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" }
    });
    if (!r.ok) {
      return {
        id: "password_protection",
        name: "Storefront reachable to customers",
        status: "warn",
        detail: `Could not read shop preferences (${r.status})`
      };
    }
    const body = (await r.json()) as { shop: { password_enabled?: boolean } };
    if (body.shop.password_enabled === true) {
      return {
        id: "password_protection",
        name: "Storefront reachable to customers",
        status: "fail",
        detail: "Storefront is password-protected — customers see a password gate, not products.",
        fix: "Open Shopify admin → Online Store → Preferences → Password protection → UNCHECK 'Restrict access' → Save. Shopify walls this off from the API; flip it in the admin UI."
      };
    }
    return {
      id: "password_protection",
      name: "Storefront reachable to customers",
      status: "ok",
      detail: "Public access enabled"
    };
  } catch (e) {
    return {
      id: "password_protection",
      name: "Storefront reachable to customers",
      status: "warn",
      detail: e instanceof Error ? e.message : "Unknown error"
    };
  }
}

async function productsActiveCheck(creds: ShopifyCredentials): Promise<LaunchCheck> {
  try {
    const url = `https://${creds.storeDomain}/admin/api/${creds.apiVersion}/products/count.json?status=active`;
    const r = await fetch(url, {
      headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" }
    });
    if (!r.ok) {
      return {
        id: "products_active",
        name: "Active products on Online Store",
        status: "fail",
        detail: `count endpoint returned ${r.status}`
      };
    }
    const body = (await r.json()) as { count: number };
    if (body.count === 0) {
      return {
        id: "products_active",
        name: "Active products on Online Store",
        status: "fail",
        detail: "No active products",
        fix: "Ask the operator to build a few product drafts, then publish them — or flip status=active in Shopify admin."
      };
    }
    if (body.count < 5) {
      return {
        id: "products_active",
        name: "Active products on Online Store",
        status: "warn",
        detail: `${body.count} active products (target: ≥5 for a credible launch)`,
        fix: "Add more SKUs or publish drafts before launching."
      };
    }
    return {
      id: "products_active",
      name: "Active products on Online Store",
      status: "ok",
      detail: `${body.count} active products`
    };
  } catch (e) {
    return {
      id: "products_active",
      name: "Active products on Online Store",
      status: "fail",
      detail: e instanceof Error ? e.message : "Unknown error"
    };
  }
}

async function unreviewedDraftsCheck(brand: string): Promise<LaunchCheck> {
  try {
    const drafts = await listShopifyDrafts(50, brand);
    if (drafts.length === 0) {
      return {
        id: "drafts_reviewed",
        name: "No unreviewed drafts blocking launch",
        status: "ok",
        detail: "0 drafts pending"
      };
    }
    return {
      id: "drafts_reviewed",
      name: "No unreviewed drafts blocking launch",
      status: "warn",
      detail: `${drafts.length} drafts pending — they won't appear on the storefront until published.`,
      fix: "Ask the operator to publish or delete the drafts, or review them in Shopify admin."
    };
  } catch (e) {
    return {
      id: "drafts_reviewed",
      name: "No unreviewed drafts blocking launch",
      status: "warn",
      detail: e instanceof Error ? e.message : "Unknown error"
    };
  }
}

// ── Founder-only deployment checks ────────────────────────────────────────
// These probe the SaaS platform itself, not any particular store. Tenants
// don't own the deployment, so they never run.

function webhookSecretCheck(): LaunchCheck {
  const has =
    Boolean(process.env.SHOPIFY_BLACKVAULT_WEBHOOK_SECRET?.trim()) ||
    Boolean(process.env.SHOPIFY_WEBHOOK_SECRET?.trim());
  return {
    id: "webhook_secret",
    name: "Shopify webhook secret configured",
    status: has ? "ok" : "fail",
    detail: has ? "Set" : "Missing",
    fix: has ? undefined : "Set SHOPIFY_BLACKVAULT_WEBHOOK_SECRET in env (the shpss_-prefixed value from Shopify Partners)."
  };
}

async function operatorAuthSecretCheck(): Promise<LaunchCheck> {
  const onVercel = Boolean(process.env.VERCEL) && process.env.NODE_ENV === "production";
  const localHas = Boolean(process.env.OPERATOR_AUTH_SECRET?.trim());

  if (onVercel) {
    return {
      id: "operator_auth_secret",
      name: "Operator API auth secret",
      status: localHas ? "ok" : "fail",
      detail: localHas ? "Set in Vercel env" : "Unset on Vercel — operator API will return 503.",
      fix: localHas
        ? undefined
        : "Set OPERATOR_AUTH_SECRET in Vercel project env (use `openssl rand -hex 32`) and redeploy."
    };
  }

  try {
    const r = await fetch("https://restrepo.vercel.app/api/operator/state", {
      method: "GET",
      signal: AbortSignal.timeout(5000)
    });
    if (r.status === 401) {
      return {
        id: "operator_auth_secret",
        name: "Operator API auth secret (Vercel)",
        status: "ok",
        detail: "Set on Vercel — production API requires bearer token (401 to unauth)."
      };
    }
    if (r.status === 503) {
      return {
        id: "operator_auth_secret",
        name: "Operator API auth secret (Vercel)",
        status: "fail",
        detail: "Vercel deployment is fail-closed — OPERATOR_AUTH_SECRET is unset.",
        fix: "Set OPERATOR_AUTH_SECRET in Vercel project env and redeploy."
      };
    }
    return {
      id: "operator_auth_secret",
      name: "Operator API auth secret (Vercel)",
      status: "warn",
      detail: `Vercel /api/operator/state returned ${r.status} — unexpected; investigate.`
    };
  } catch (e) {
    return {
      id: "operator_auth_secret",
      name: "Operator API auth secret (Vercel)",
      status: "warn",
      detail: `Could not probe Vercel deployment: ${e instanceof Error ? e.message : "unknown error"}`
    };
  }
}

function requiredEnvVarsCheck(): LaunchCheck {
  const required = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "PRINTFUL_API_KEY",
    "PRINTFUL_STORE_ID",
    "SHOPIFY_BLACKVAULT_API_KEY",
    "SHOPIFY_BLACKVAULT_STORE_DOMAIN"
  ];
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length === 0) {
    return {
      id: "required_env",
      name: "Required env vars present",
      status: "ok",
      detail: `${required.length}/${required.length} set`
    };
  }
  return {
    id: "required_env",
    name: "Required env vars present",
    status: "fail",
    detail: `Missing: ${missing.join(", ")}`,
    fix: "Add the missing keys to .env.local (local) or Vercel project env (production)."
  };
}

function printfulAutoConfirmCheck(): LaunchCheck {
  const value = process.env.PRINTFUL_AUTO_CONFIRM?.trim().toLowerCase();
  const isOn = value === "true" || value === "1";
  return {
    id: "printful_auto_confirm",
    name: "Printful auto-confirm posture",
    status: isOn ? "warn" : "ok",
    detail: isOn
      ? "Auto-confirm ON — first 5–10 orders should be reviewed manually before this is set."
      : "Auto-confirm OFF — orders land as Printful drafts; merchant manually approves each.",
    fix: isOn
      ? "Recommend OFF for the first 5–10 orders. Flip to true after trust is built."
      : undefined
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/** Founder mode. Brand-keyed, env-var-credentialed, runs every check. */
export async function getLaunchStatus(brand: string): Promise<LaunchStatusReport> {
  let creds: ShopifyCredentials;
  try {
    creds = resolveShopifyCredentials(brand);
  } catch (e) {
    // No creds at all — return a single-check fail report rather than throwing.
    return {
      brand,
      generatedAt: new Date().toISOString(),
      overall: "fail",
      checks: [
        {
          id: "shopify_connection",
          name: "Shopify admin token works",
          status: "fail",
          detail: e instanceof Error ? e.message : "Unknown error",
          fix: "Set SHOPIFY_BLACKVAULT_API_KEY and SHOPIFY_BLACKVAULT_STORE_DOMAIN in your env."
        }
      ]
    };
  }

  const checks = await Promise.all([
    shopifyConnectionCheck(creds),
    passwordProtectionCheck(creds),
    productsActiveCheck(creds),
    unreviewedDraftsCheck(brand),
    operatorAuthSecretCheck()
  ]);
  checks.push(webhookSecretCheck(), requiredEnvVarsCheck(), printfulAutoConfirmCheck());

  return {
    brand,
    generatedAt: new Date().toISOString(),
    overall: pickWorst(checks.map((c) => c.status)),
    checks
  };
}

export async function getLaunchStatusForAllBrands(): Promise<LaunchStatusReport[]> {
  const all = listConfiguredShopifyCredentials();
  return Promise.all(all.map((c) => getLaunchStatus(c.brandSlug)));
}

/** Tenant mode. Reads creds from the tenant's encrypted vault, runs only the
 *  4 store-level checks (Shopify connection, password gate, products, drafts).
 *  Skips deployment-infrastructure checks — those are not the tenant's concern.
 *
 *  If the tenant hasn't connected their Shopify, returns a single-check fail
 *  report with a clear "open Settings → connect Shopify" fix string. The page
 *  uses that signal to render the credential form. */
export async function getTenantLaunchStatus(tenantCtx: TenantContext): Promise<LaunchStatusReport> {
  if (tenantCtx.isFounder || !tenantCtx.tenant) {
    throw new Error("getTenantLaunchStatus called without a real tenant context");
  }
  const brand = tenantCtx.tenant.brandSlug;
  let creds: ShopifyCredentials;
  try {
    creds = resolveShopifyCredentials(brand, tenantCtx);
  } catch (e) {
    return {
      brand,
      generatedAt: new Date().toISOString(),
      overall: "fail",
      checks: [
        {
          id: "shopify_connection",
          name: "Shopify admin token works",
          status: "fail",
          detail: e instanceof Error ? e.message : "Shopify not connected",
          fix: "Connect your Shopify store from Settings to start the readiness checks."
        }
      ]
    };
  }

  const checks = await Promise.all([
    shopifyConnectionCheck(creds, tenantCtx),
    passwordProtectionCheck(creds),
    productsActiveCheck(creds),
    unreviewedDraftsCheck(brand)
  ]);

  return {
    brand,
    generatedAt: new Date().toISOString(),
    overall: pickWorst(checks.map((c) => c.status)),
    checks
  };
}
