// Register the Shopify orders/paid webhook against your store.
//
// Run with:
//   node --env-file=.env.local --import tsx scripts/register-shopify-webhook.ts <https-callback-url> [brand]
//
// The callback URL must be HTTPS. Append the route path:
//   https://your-app.vercel.app/api/webhooks/shopify/order-paid
//
// Brand defaults to "locklayer" (uses unprefixed SHOPIFY_API_KEY +
// SHOPIFY_STORE_DOMAIN env vars). Pass "black-vault-apparel" to target the
// BV store (uses SHOPIFY_BLACKVAULT_* env vars).
//
// After this succeeds, set SHOPIFY_WEBHOOK_SECRET (in .env.local locally,
// or in Vercel env vars for production) to your custom app's "API secret
// key" (Shopify admin → Settings → Apps and sales channels → Develop apps →
// your app → API credentials → API secret key). That's the value Shopify
// uses to HMAC-sign webhook payloads.

import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const callbackUrl = process.argv[2];
const brandArg = process.argv[3] ?? "locklayer";

if (!callbackUrl || !callbackUrl.startsWith("https://")) {
  console.error("Usage: register-shopify-webhook.ts <https-callback-url> [brand]");
  console.error("Example: https://restrepo.vercel.app/api/webhooks/shopify/order-paid black-vault-apparel");
  console.error("Brand options: locklayer, black-vault-apparel");
  process.exit(1);
}

const creds = (() => {
  try {
    return resolveShopifyCredentials(brandArg);
  } catch (e) {
    console.error(`Could not load Shopify credentials for brand "${brandArg}":`, e instanceof Error ? e.message : e);
    process.exit(1);
  }
})();

const mutation = `
  mutation webhookSubscriptionCreate(
    $topic: WebhookSubscriptionTopic!
    $webhookSubscription: WebhookSubscriptionInput!
  ) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: $webhookSubscription
    ) {
      webhookSubscription {
        id
        topic
        endpoint {
          __typename
          ... on WebhookHttpEndpoint { callbackUrl }
        }
      }
      userErrors { field message }
    }
  }
`;

async function main() {
  console.log(`Brand: ${creds.brandName} (${creds.brandSlug})`);
  console.log(`Store: ${creds.storeDomain}`);
  console.log(`Callback: ${callbackUrl}\n`);

  const response = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": creds.token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        topic: "ORDERS_PAID",
        webhookSubscription: {
          callbackUrl,
          format: "JSON"
        }
      }
    })
  });

  const body = await response.text();
  console.log(`HTTP ${response.status}`);
  console.log(body);

  if (!response.ok) process.exit(1);

  try {
    const parsed = JSON.parse(body) as {
      data?: {
        webhookSubscriptionCreate?: {
          webhookSubscription?: { id?: string };
          userErrors?: Array<{ field?: string[]; message: string }>;
        };
      };
    };
    const errs = parsed.data?.webhookSubscriptionCreate?.userErrors ?? [];
    if (errs.length > 0) {
      console.error("\nShopify reported userErrors:", JSON.stringify(errs, null, 2));
      // Already-exists is not a hard failure — emit a friendlier line.
      if (errs.some((e) => /already.*exists|address.*already/i.test(e.message))) {
        console.log("\nWebhook already exists for this URL on this store. No action needed.");
        return;
      }
      process.exit(2);
    }
    const id = parsed.data?.webhookSubscriptionCreate?.webhookSubscription?.id;
    if (id) {
      console.log(`\n✔ Registered orders/paid webhook on ${creds.brandName}`);
      console.log(`  Subscription id: ${id}`);
      console.log(`  Callback: ${callbackUrl}`);
      console.log(`\nNext steps:`);
      console.log(`  1. Find your custom app's "API secret key" in Shopify admin:`);
      console.log(`     Settings → Apps and sales channels → Develop apps → [your app] →`);
      console.log(`     API credentials tab → "API secret key" (NOT the access token)`);
      console.log(`  2. Add it to Vercel env vars as SHOPIFY_WEBHOOK_SECRET`);
      console.log(`  3. Redeploy on Vercel so the new env var is picked up`);
    }
  } catch (e) {
    console.error("Could not parse response body as JSON:", e);
    process.exit(3);
  }
}

main().catch((err) => {
  console.error("Registration failed:", err);
  process.exit(1);
});
