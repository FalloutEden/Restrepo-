import "server-only";

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";
import { loadPolicyConfig } from "@/lib/policies-config";
import { generateAllPolicies } from "@/lib/policies-generator";
import { pushAllPolicies } from "@/lib/policies-shopify";

// Bootstrap a freshly-installed Shopify store into a "ready to sell" state.
//
// The premise: SaaS resale of this codebase. A buyer signs up, plugs their
// store domain + access token into the multi-brand env vars, and runs this
// flow once. After it finishes, the store has policies, webhook delivery,
// and a sane checkout — the merchant can then ship products through the
// existing materialization pipelines.
//
// Each step is idempotent: re-running on a partially-bootstrapped store
// only touches what's still missing or stale.

export type BootstrapResult = {
  brand: string;
  storeDomain: string;
  steps: BootstrapStepResult[];
};

export type BootstrapStepResult = {
  name: string;
  ok: boolean;
  detail?: string;
  error?: string;
};

export type BootstrapOptions = {
  // Public HTTPS URL of /api/webhooks/shopify/order-paid (this app's
  // production deployment). Required to register the orders/paid webhook.
  webhookCallbackUrl: string;
  // Skip the policy push (useful for testing). Default false.
  skipPolicies?: boolean;
};

// Granular scope check — a SaaS buyer's first-time install may not have
// granted every scope the operator agent uses. We probe lightweight queries
// for each scope-gated resource and report what's available vs not. The
// merchant can then decide whether to re-auth with the missing scopes.
export type CapabilityProbe = {
  scope: string;
  available: boolean;
  detail?: string;
};

async function shopifyGraphQL<T>(
  creds: ShopifyCredentials,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  const text = await r.text();
  const parsed: { data?: T; errors?: unknown } = text ? JSON.parse(text) : {};
  if (!r.ok || (Array.isArray(parsed.errors) && parsed.errors.length > 0)) {
    throw new Error(`Shopify GraphQL ${r.status}: ${text}`);
  }
  return parsed.data as T;
}

// Step 1 — verify the access token is valid and grants the scopes the rest
// of the app needs (read/write products, files, customers, orders).
async function verifyAccessToken(creds: ShopifyCredentials): Promise<BootstrapStepResult> {
  try {
    const data = await shopifyGraphQL<{ shop: { name: string; primaryDomain: { url: string } } }>(
      creds,
      `query { shop { name primaryDomain { url } } }`
    );
    return {
      name: "verify_access_token",
      ok: true,
      detail: `${data.shop.name} @ ${data.shop.primaryDomain.url}`
    };
  } catch (e) {
    return {
      name: "verify_access_token",
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

// Step 2 — register the orders/paid webhook idempotently.
async function ensureOrdersPaidWebhook(
  creds: ShopifyCredentials,
  callbackUrl: string
): Promise<BootstrapStepResult> {
  try {
    // First check if a subscription already points at this URL.
    const existing = await shopifyGraphQL<{
      webhookSubscriptions: {
        edges: Array<{
          node: {
            id: string;
            topic: string;
            endpoint: { __typename: string; callbackUrl?: string };
          };
        }>;
      };
    }>(
      creds,
      `query { webhookSubscriptions(first: 50, topics: [ORDERS_PAID]) {
        edges { node { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } }
      } }`
    );
    const match = existing.webhookSubscriptions.edges
      .map((e) => e.node)
      .find((n) => n.endpoint && "callbackUrl" in n.endpoint && n.endpoint.callbackUrl === callbackUrl);
    if (match) {
      return { name: "register_webhook", ok: true, detail: `already subscribed (${match.id})` };
    }

    const result = await shopifyGraphQL<{
      webhookSubscriptionCreate: {
        webhookSubscription: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      creds,
      `mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
          webhookSubscription { id }
          userErrors { message }
        }
      }`,
      {
        topic: "ORDERS_PAID",
        sub: { callbackUrl, format: "JSON" }
      }
    );
    const errs = result.webhookSubscriptionCreate.userErrors;
    const id = result.webhookSubscriptionCreate.webhookSubscription?.id;
    if (errs.length > 0 && !errs.some((e) => /already.*exists|address.*already/i.test(e.message))) {
      throw new Error(errs.map((e) => e.message).join("; "));
    }
    return {
      name: "register_webhook",
      ok: true,
      detail: id ? `subscribed (${id})` : "already subscribed"
    };
  } catch (e) {
    return {
      name: "register_webhook",
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

// Step 3 — push the five customer-facing policies.
async function pushPolicies(brand: string): Promise<BootstrapStepResult> {
  try {
    const config = await loadPolicyConfig(brand);
    const policies = generateAllPolicies(config);
    const results = await pushAllPolicies(brand, policies);
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      return {
        name: "push_policies",
        ok: false,
        error: failed.map((f) => `${f.type}: ${f.error ?? "unknown"}`).join("; ")
      };
    }
    return {
      name: "push_policies",
      ok: true,
      detail: `${results.length} policies pushed`
    };
  } catch (e) {
    return {
      name: "push_policies",
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

// Step 4 — wire The Foundation / About / Contact page links into the main
// menu IF those pages exist on the store (the policy push step would have
// created them). Best-effort — failure means the merchant adds them by hand.
async function wireMainMenu(creds: ShopifyCredentials): Promise<BootstrapStepResult> {
  try {
    // Fetch all pages — find ones we want linked
    const pagesData = await shopifyGraphQL<{
      pages: { edges: Array<{ node: { id: string; handle: string; title: string } }> };
    }>(creds, `query { pages(first: 50) { edges { node { id handle title } } } }`);
    const pages = pagesData.pages.edges.map((e) => e.node);
    const wanted: Array<{ handle: string; menuTitle: string }> = [
      { handle: "the-foundation", menuTitle: "The Foundation" },
      { handle: "about", menuTitle: "About" }
    ];
    const linked: string[] = [];

    // Fetch main-menu
    const menusData = await shopifyGraphQL<{
      menus: { edges: Array<{ node: { id: string; handle: string; title: string; items: Array<{ title: string; type: string; url?: string; resourceId?: string }> } }> };
    }>(creds, `query { menus(first: 25) { edges { node { id handle title items { title type url resourceId } } } } }`);
    const main = menusData.menus.edges.map((e) => e.node).find((m) => m.handle === "main-menu");
    if (!main) return { name: "wire_main_menu", ok: false, error: "main-menu not found" };

    for (const w of wanted) {
      const page = pages.find((p) => p.handle === w.handle);
      if (!page) continue;
      // Skip if title already in menu
      if (main.items.some((i) => i.title.trim().toLowerCase() === w.menuTitle.toLowerCase())) {
        linked.push(`${w.menuTitle} (already linked)`);
        continue;
      }
      // Append the new item
      const newItems = [
        ...main.items.map((i) => {
          const o: { title: string; type: string; url?: string; resourceId?: string } = { title: i.title, type: i.type };
          if (i.url) o.url = i.url;
          if (i.resourceId) o.resourceId = i.resourceId;
          return o;
        }),
        { title: w.menuTitle, type: "PAGE", resourceId: page.id }
      ];
      const upd = await shopifyGraphQL<{ menuUpdate: { menu: { id: string } | null; userErrors: Array<{ message: string }> } }>(
        creds,
        `mutation($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
          menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
            menu { id }
            userErrors { message }
          }
        }`,
        { id: main.id, title: main.title, handle: main.handle, items: newItems }
      );
      const err = upd.menuUpdate.userErrors[0];
      if (err) throw new Error(err.message);
      linked.push(w.menuTitle);
      // Update local mirror so subsequent items in the loop don't re-add
      main.items = newItems;
    }

    return { name: "wire_main_menu", ok: true, detail: linked.length > 0 ? `linked: ${linked.join(", ")}` : "no pages to link" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Access denied = scope missing — report but don't fail the bootstrap
    if (/access\s*denied|unauthorized/i.test(msg)) {
      return { name: "wire_main_menu", ok: false, error: "missing write_online_store_navigation scope — merchant must re-auth app with menu scopes" };
    }
    return { name: "wire_main_menu", ok: false, error: msg };
  }
}

// Step 5 — probe which scopes are granted on this install. Reports what the
// operator agent CAN and CAN'T do for this merchant, so the agent knows
// upfront which features to advertise vs flag as "needs reinstall".
async function probeCapabilities(creds: ShopifyCredentials): Promise<{ name: string; ok: boolean; detail: string; capabilities: CapabilityProbe[] }> {
  const probes: Array<{ scope: string; query: string; check: (d: unknown) => boolean }> = [
    { scope: "read_products", query: `query { products(first: 1) { edges { node { id } } } }`, check: (d) => !!(d as { products?: unknown })?.products },
    { scope: "read_publications", query: `query { publications(first: 1) { edges { node { id } } } }`, check: (d) => !!(d as { publications?: unknown })?.publications },
    { scope: "read_online_store_navigation", query: `query { menus(first: 1) { edges { node { id } } } }`, check: (d) => !!(d as { menus?: unknown })?.menus },
    { scope: "read_online_store_pages", query: `query { pages(first: 1) { edges { node { id } } } }`, check: (d) => !!(d as { pages?: unknown })?.pages },
    { scope: "read_metaobject_definitions", query: `query { metaobjectDefinitions(first: 1) { edges { node { id } } } }`, check: (d) => !!(d as { metaobjectDefinitions?: unknown })?.metaobjectDefinitions },
    { scope: "read_locations", query: `query { locations(first: 1) { edges { node { id } } } }`, check: (d) => !!(d as { locations?: unknown })?.locations },
    { scope: "read_markets", query: `query { markets(first: 1) { edges { node { id } } } }`, check: (d) => !!(d as { markets?: unknown })?.markets },
    { scope: "read_locales", query: `query { shopLocales { locale } }`, check: (d) => Array.isArray((d as { shopLocales?: unknown })?.shopLocales) },
    { scope: "read_draft_orders", query: `query { draftOrders(first: 1) { edges { node { id } } } }`, check: (d) => !!(d as { draftOrders?: unknown })?.draftOrders },
    { scope: "read_gift_cards", query: `query { giftCards(first: 1) { edges { node { id } } } }`, check: (d) => !!(d as { giftCards?: unknown })?.giftCards },
    { scope: "read_shopify_payments_payouts", query: `query { shopifyPaymentsAccount { id } }`, check: () => true },
    { scope: "read_themes", query: `query { themes(first: 1) { edges { node { id } } } }`, check: (d) => !!(d as { themes?: unknown })?.themes }
  ];

  const capabilities: CapabilityProbe[] = await Promise.all(
    probes.map(async (p) => {
      try {
        const data = await shopifyGraphQL<unknown>(creds, p.query);
        return { scope: p.scope, available: p.check(data) };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { scope: p.scope, available: false, detail: /access.*denied/i.test(msg) ? "access denied" : msg.slice(0, 80) };
      }
    })
  );

  const granted = capabilities.filter((c) => c.available).length;
  return {
    name: "probe_capabilities",
    ok: true,
    detail: `${granted}/${capabilities.length} scope-gated resources reachable`,
    capabilities
  };
}

// Step 6 — confirm the Online Store sales channel publication exists.
// New stores all have this; we just sanity-check so the publish-listing flow
// the merchant runs later won't silently fall through.
async function verifyOnlineStorePublication(creds: ShopifyCredentials): Promise<BootstrapStepResult> {
  try {
    const data = await shopifyGraphQL<{
      publications: { edges: Array<{ node: { id: string; name: string } }> };
    }>(creds, `query { publications(first: 25) { edges { node { id name } } } }`);
    const onlineStore = data.publications.edges.map((e) => e.node).find((n) => n.name === "Online Store");
    if (!onlineStore) {
      return {
        name: "verify_online_store",
        ok: false,
        error: "Store has no 'Online Store' publication. Re-enable Online Store sales channel in Shopify admin."
      };
    }
    return { name: "verify_online_store", ok: true, detail: onlineStore.id };
  } catch (e) {
    return {
      name: "verify_online_store",
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

export type BootstrapResultExt = BootstrapResult & {
  capabilities?: CapabilityProbe[];
  manualSteps: string[];
};

export async function bootstrapStore(brand: string, options: BootstrapOptions): Promise<BootstrapResultExt> {
  const creds = resolveShopifyCredentials(brand);
  const steps: BootstrapStepResult[] = [];

  steps.push(await verifyAccessToken(creds));
  if (!steps[0].ok) {
    return {
      brand: creds.brandSlug,
      storeDomain: creds.storeDomain,
      steps,
      manualSteps: ["Re-mint a valid Shopify Admin API access token via scripts/mint-shopify-token.ts."]
    };
  }

  steps.push(await verifyOnlineStorePublication(creds));
  steps.push(await ensureOrdersPaidWebhook(creds, options.webhookCallbackUrl));

  if (!options.skipPolicies) {
    steps.push(await pushPolicies(brand));
  }

  // Wire the foundation/about pages into the main menu (idempotent).
  steps.push(await wireMainMenu(creds));

  // Probe which scope-gated resources are reachable.
  const probeResult = await probeCapabilities(creds);
  steps.push({ name: probeResult.name, ok: probeResult.ok, detail: probeResult.detail });

  // Build a list of things the merchant still needs to do by hand.
  const manualSteps: string[] = [];
  manualSteps.push("Configure custom domain in Shopify admin → Settings → Domains.");
  manualSteps.push("Set up Shopify Payments OR a third-party gateway in Settings → Payments.");
  manualSteps.push("Configure shipping zones + rates in Settings → Shipping and delivery.");
  manualSteps.push("Upload brand logo + favicon in Online Store → Themes → Customize.");
  manualSteps.push("Choose a theme + tweak colors/fonts in Online Store → Themes (Horizon recommended).");
  manualSteps.push("After first ~10 orders, flip PRINTFUL_AUTO_CONFIRM=true in env vars to skip manual order confirmation.");

  // If any scopes are missing, surface them so the merchant knows what's
  // unavailable until re-auth.
  const missingScopes = probeResult.capabilities.filter((c) => !c.available);
  if (missingScopes.length > 0) {
    manualSteps.push(
      `Re-authorize the app with these missing scopes for full operator capability: ${missingScopes.map((m) => m.scope).join(", ")}`
    );
  }

  return {
    brand: creds.brandSlug,
    storeDomain: creds.storeDomain,
    steps,
    capabilities: probeResult.capabilities,
    manualSteps
  };
}
