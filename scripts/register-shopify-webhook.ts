// Register the Shopify orders/paid webhook against your store.
//
// Run with:
//   node --env-file=.env.local --import tsx scripts/register-shopify-webhook.ts <https-callback-url>
//
// The callback URL must be HTTPS and must match the path of the route at
// app/api/webhooks/shopify/order-paid. For local dev use an ngrok tunnel,
// e.g. https://abc123.ngrok.app/api/webhooks/shopify/order-paid.
//
// After this succeeds, set SHOPIFY_WEBHOOK_SECRET in .env.local to your custom
// app's "API secret key" (Shopify admin → Apps → Develop apps → your app → API
// credentials). That's the value Shopify uses to HMAC-sign webhook payloads.

const SHOP = process.env.SHOPIFY_STORE_DOMAIN?.trim();
const TOKEN = process.env.SHOPIFY_API_KEY?.trim();
const VERSION = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2024-04";

if (!SHOP || !TOKEN) {
  console.error("Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_API_KEY in env.");
  process.exit(1);
}

const callbackUrl = process.argv[2];
if (!callbackUrl || !callbackUrl.startsWith("https://")) {
  console.error("Usage: register-shopify-webhook.ts <https-callback-url>");
  console.error("Example: https://abc123.ngrok.app/api/webhooks/shopify/order-paid");
  process.exit(1);
}

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
  const response = await fetch(`https://${SHOP}/admin/api/${VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": TOKEN as string,
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
      console.error("Shopify reported userErrors:", JSON.stringify(errs, null, 2));
      process.exit(2);
    }
    const id = parsed.data?.webhookSubscriptionCreate?.webhookSubscription?.id;
    if (id) {
      console.log(`\n✔ Registered orders/paid webhook: ${id}`);
      console.log(`  Callback: ${callbackUrl}`);
      console.log(`\nNext: set SHOPIFY_WEBHOOK_SECRET in .env.local to your app's API secret key.`);
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
