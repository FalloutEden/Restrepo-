// Disable the storefront password protection on the BV Shopify store.
// Currently the storefront returns "Opening soon" — customers can't reach products.
//
// Tries multiple Shopify Admin API paths in order:
//   1. REST  PUT /online_store/password_protection.json (legacy but still supported)
//   2. GraphQL onlineStorePasswordProtectionUpdate mutation
//   3. REST shop.json preference flip
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/disable-storefront-password.ts
//
// Read-only diagnostic mode (don't actually disable):
//   ... scripts/disable-storefront-password.ts --dry

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";

async function rest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit = {}) {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": creds.token,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const text = await r.text();
  if (!r.ok) {
    return { ok: false as const, status: r.status, body: text };
  }
  return { ok: true as const, status: r.status, body: text ? (JSON.parse(text) as T) : ({} as T) };
}

async function graphql<T>(creds: ShopifyCredentials, query: string, variables: Record<string, unknown>) {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  const text = await r.text();
  const parsed = text ? JSON.parse(text) : {};
  return { status: r.status, body: parsed as { data?: T; errors?: unknown }, raw: text };
}

async function main() {
  const dry = process.argv.includes("--dry");
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] brand=${creds.brandSlug} store=${creds.storeDomain}  api=${creds.apiVersion}`);

  // First, read shop preferences to see current state.
  const shop = await rest<{ shop: { name: string; password_enabled?: boolean } }>(
    creds,
    "/shop.json?fields=name,password_enabled"
  );
  if (!shop.ok) {
    console.error(`[shop] failed: ${shop.status} ${shop.body}`);
    return;
  }
  console.log(`[shop] name="${shop.body.shop.name}"  password_enabled=${shop.body.shop.password_enabled}`);

  if (dry) {
    console.log(`[dry] not making changes. password_enabled is ${shop.body.shop.password_enabled}.`);
    return;
  }

  if (shop.body.shop.password_enabled === false) {
    console.log(`[ok] password protection already disabled`);
    return;
  }

  // Path A: Try the legacy REST endpoint
  console.log(`[A] PUT /online_store/password_protection.json {enabled:false}`);
  const a = await rest(creds, "/online_store/password_protection.json", {
    method: "PUT",
    body: JSON.stringify({ online_store_password_protection: { enabled: false } })
  });
  console.log(`   → ${a.status} ${typeof a.body === "string" ? a.body.slice(0, 200) : JSON.stringify(a.body).slice(0, 200)}`);
  if (a.ok) {
    console.log(`[ok] disabled via REST password_protection`);
    return;
  }

  // Path B: GraphQL mutation
  console.log(`[B] GraphQL onlineStorePasswordProtectionUpdate(enabled:false)`);
  const b = await graphql<{
    onlineStorePasswordProtectionUpdate: {
      onlineStorePasswordProtection: { enabled: boolean } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    creds,
    `mutation Disable($input: OnlineStorePasswordProtectionInput!) {
      onlineStorePasswordProtectionUpdate(input: $input) {
        onlineStorePasswordProtection { enabled }
        userErrors { field message }
      }
    }`,
    { input: { enabled: false } }
  );
  console.log(`   → ${b.status} ${b.raw.slice(0, 300)}`);
  const bData = b.body.data?.onlineStorePasswordProtectionUpdate;
  if (bData?.onlineStorePasswordProtection?.enabled === false) {
    console.log(`[ok] disabled via GraphQL onlineStorePasswordProtectionUpdate`);
    return;
  }

  // Path C: Try setting preferences endpoint
  console.log(`[C] PUT /preferences.json {enabled:false}`);
  const c = await rest(creds, "/preferences.json", {
    method: "PUT",
    body: JSON.stringify({ password_enabled: false })
  });
  console.log(`   → ${c.status} ${typeof c.body === "string" ? c.body.slice(0, 200) : JSON.stringify(c.body).slice(0, 200)}`);

  console.log(`\n[fail] no path worked automatically. Manual fix:`);
  console.log(`  1. Open https://${creds.storeDomain}/admin/online_store/preferences`);
  console.log(`  2. Scroll to "Password protection" section`);
  console.log(`  3. UNCHECK "Restrict access to visitors with the password"`);
  console.log(`  4. Save`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
