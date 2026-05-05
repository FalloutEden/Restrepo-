// Smoke test: create a fake Shopify order payload and run it through the
// Printful order helper directly (bypassing the HTTP webhook + HMAC). This
// verifies that the variant mapping established at materialize-time still
// resolves correctly on Printful's side.
//
// Run with:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs \
//     --import tsx scripts/smoke-webhook.ts <shopifyVariantId>
//
// Pass a Shopify variant id that was created via materializeProduct (its
// Printful sync variant has external_id = String(shopifyVariantId)). With
// PRINTFUL_AUTO_CONFIRM unset/false, this creates a Printful draft order —
// nothing is billed and you can delete it from Printful's UI.

import { createPrintfulOrderFromShopify, type ShopifyOrderPayload } from "@/lib/printful-orders";

async function main() {
  const variantIdArg = process.argv[2];
  if (!variantIdArg) {
    console.error("Usage: smoke-webhook.ts <shopifyVariantId>");
    process.exit(1);
  }

  const variantId = Number(variantIdArg);
  if (!Number.isFinite(variantId)) {
    console.error("Variant id must be numeric.");
    process.exit(1);
  }

  const payload: ShopifyOrderPayload = {
    id: Date.now(),
    name: `#TEST-${Date.now()}`,
    email: "smoketest@example.com",
    currency: "USD",
    financial_status: "paid",
    line_items: [
      {
        variant_id: variantId,
        quantity: 1,
        price: "34.99",
        title: "Smoke test product"
      }
    ],
    shipping_address: {
      first_name: "Smoke",
      last_name: "Test",
      address1: "123 Test Street",
      city: "Austin",
      province_code: "TX",
      country_code: "US",
      zip: "78701",
      phone: "555-0100"
    }
  };

  const result = await createPrintfulOrderFromShopify(payload);
  console.log(JSON.stringify(result, null, 2));

  if (result.status === "error") process.exit(2);
}

main().catch((err) => {
  console.error("[smoke-webhook] failed:", err);
  process.exit(1);
});
