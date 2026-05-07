// Register the Shopify products/update webhook for a given brand.
//
// Once registered, every product status flip in Shopify admin (draft → active,
// inventory edit, title change, etc.) fires our /api/webhooks/shopify/products-update
// handler. The handler auto-attaches active-but-unpublished products to the
// Online Store sales channel — solving the "product is active but invisible
// to customers" problem on stores whose custom app lacks write_publications.
//
// Run:
//   node --env-file=.env.local --import tsx scripts/register-products-update-webhook.ts \
//     <https-callback-url> [brand]
//
// Examples:
//   ... https://restrepo.vercel.app/api/webhooks/shopify/products-update locklayer
//   ... https://restrepo.vercel.app/api/webhooks/shopify/products-update black-vault-apparel

type Brand = "locklayer" | "black-vault-apparel";
const BRAND_ENV_PREFIX: Record<Brand, string | null> = {
  locklayer: null,
  "black-vault-apparel": "BLACKVAULT"
};
const BRAND_DISPLAY: Record<Brand, string> = {
  locklayer: "LockLayer",
  "black-vault-apparel": "Black Vault Apparel"
};

function resolveCredsInline(brand: Brand) {
  const prefix = BRAND_ENV_PREFIX[brand];
  const tokenKey = prefix ? `SHOPIFY_${prefix}_API_KEY` : "SHOPIFY_API_KEY";
  const domainKey = prefix ? `SHOPIFY_${prefix}_STORE_DOMAIN` : "SHOPIFY_STORE_DOMAIN";
  const token = process.env[tokenKey]?.trim();
  const storeDomain = process.env[domainKey]?.trim();
  if (!token) throw new Error(`Missing ${tokenKey} for brand ${brand}.`);
  if (!storeDomain) throw new Error(`Missing ${domainKey} for brand ${brand}.`);
  return {
    brandSlug: brand,
    brandName: BRAND_DISPLAY[brand],
    token,
    storeDomain,
    apiVersion: process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2024-04"
  };
}

const callbackUrl = process.argv[2];
const brandArg = (process.argv[3] ?? "locklayer") as Brand;

if (!callbackUrl || !callbackUrl.startsWith("https://")) {
  console.error("Usage: register-products-update-webhook.ts <https-callback-url> [brand]");
  console.error("Example: https://restrepo.vercel.app/api/webhooks/shopify/products-update locklayer");
  console.error("Brand options: locklayer, black-vault-apparel");
  process.exit(1);
}

if (!(brandArg in BRAND_ENV_PREFIX)) {
  console.error(`Unknown brand "${brandArg}". Valid: locklayer, black-vault-apparel`);
  process.exit(1);
}

const creds = resolveCredsInline(brandArg);

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
  console.log(`Topic: PRODUCTS_UPDATE`);
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
        topic: "PRODUCTS_UPDATE",
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
      if (errs.some((e) => /already.*exists|address.*already/i.test(e.message))) {
        console.log("\nWebhook already exists for this URL on this store. No action needed.");
        return;
      }
      console.error("\nShopify reported userErrors:", JSON.stringify(errs, null, 2));
      process.exit(2);
    }
    const id = parsed.data?.webhookSubscriptionCreate?.webhookSubscription?.id;
    if (id) {
      console.log(`\n✔ Registered products/update webhook on ${creds.brandName}`);
      console.log(`  Subscription id: ${id}`);
      console.log(`  Callback: ${callbackUrl}`);
      console.log(`\nThe handler will attach active-but-unpublished products to the Online Store sales channel automatically when fired.`);
      console.log(`No new env var is needed — webhook HMAC verification reuses the existing SHOPIFY_*_WEBHOOK_SECRET that the orders/paid webhook uses.`);
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

export {};
