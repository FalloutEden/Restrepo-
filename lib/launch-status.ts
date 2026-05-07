import "server-only";

import { listConfiguredShopifyCredentials, resolveShopifyCredentials } from "@/lib/shopify-credentials";
import { listShopifyDrafts } from "@/lib/shopify-service";

// Read-only health probe for everything that needs to be true before BV (or
// any tenant) can flip the launch switch. Each check returns ok/warn/fail
// and a human-readable hint. The dashboard renders these as a checklist;
// the operator tool returns them so the agent can answer "are we ready
// to launch?" with grounded data instead of guessing.

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

async function checkShopifyConnection(brand: string): Promise<LaunchCheck> {
  try {
    const creds = resolveShopifyCredentials(brand);
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
        fix: r.status === 401
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
      fix: "Set SHOPIFY_BLACKVAULT_API_KEY and SHOPIFY_BLACKVAULT_STORE_DOMAIN in your env."
    };
  }
}

async function checkPasswordProtection(brand: string): Promise<LaunchCheck> {
  try {
    const creds = resolveShopifyCredentials(brand);
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
        detail: "Storefront is password-protected — customers see 'Welcome to the Vault' password gate, not the products.",
        fix: "Open Shopify admin → Online Store → Preferences → Password protection → UNCHECK 'Restrict access to visitors with the password' → Save. Shopify deliberately walls this off from API; you have to flip it in the admin UI."
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

async function checkProductsActive(brand: string): Promise<LaunchCheck> {
  try {
    const creds = resolveShopifyCredentials(brand);
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
        fix: "Run attach_all_to_online_store and publish_listing on each product, OR flip status=active in Shopify admin."
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

async function checkUnreviewedDrafts(brand: string): Promise<LaunchCheck> {
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
      fix: "Run scripts/store-cleanup.ts (P=publish, D=delete) or review them in Shopify admin."
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

function checkWebhookSecret(): LaunchCheck {
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

async function checkOperatorAuthSecret(): Promise<LaunchCheck> {
  const onVercel = Boolean(process.env.VERCEL);
  const localHas = Boolean(process.env.OPERATOR_AUTH_SECRET?.trim());

  // When running on Vercel itself, just read the local env (which is the
  // Vercel runtime env).
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

  // Running locally — the local env-var presence doesn't reflect production.
  // Probe the deployed surface to determine the real state. /api/operator/state
  // returns 401 when the secret is set, 503 when unset (per middleware.ts).
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

function checkRequiredEnvVars(): LaunchCheck {
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

function checkPrintfulAutoConfirm(): LaunchCheck {
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

export async function getLaunchStatus(brand: string): Promise<LaunchStatusReport> {
  const checks = await Promise.all([
    checkShopifyConnection(brand),
    checkPasswordProtection(brand),
    checkProductsActive(brand),
    checkUnreviewedDrafts(brand),
    checkOperatorAuthSecret()
  ]);
  // Sync checks
  checks.push(checkWebhookSecret(), checkRequiredEnvVars(), checkPrintfulAutoConfirm());
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
