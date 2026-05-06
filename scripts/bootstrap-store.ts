// One-shot SaaS-resale store bootstrap.
//
// Given a brand whose env vars are configured (SHOPIFY_<BRAND>_API_KEY +
// SHOPIFY_<BRAND>_STORE_DOMAIN + optionally SHOPIFY_<BRAND>_WEBHOOK_SECRET),
// this verifies the access token, registers the orders/paid webhook against
// the deployment URL, pushes the five customer-facing policies, and confirms
// the Online Store sales channel exists.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/bootstrap-store.ts <brand> <webhookCallbackUrl>
//
// Example:
//   ... bootstrap-store.ts black-vault-apparel https://restrepo.vercel.app/api/webhooks/shopify/order-paid

import { bootstrapStore } from "@/lib/store-bootstrap";

async function main() {
  const [brand, webhookCallbackUrl] = process.argv.slice(2);
  if (!brand || !webhookCallbackUrl) {
    console.error("Usage: bootstrap-store.ts <brand> <webhookCallbackUrl>");
    process.exit(1);
  }
  console.log(`[bootstrap] brand=${brand} callback=${webhookCallbackUrl}\n`);
  const result = await bootstrapStore(brand, { webhookCallbackUrl });
  console.log(`Store: ${result.storeDomain}\n`);
  for (const step of result.steps) {
    const mark = step.ok ? "✓" : "✗";
    const tail = step.detail ? ` — ${step.detail}` : step.error ? ` — ERROR: ${step.error}` : "";
    console.log(`  ${mark} ${step.name}${tail}`);
  }
  const failed = result.steps.filter((s) => !s.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} step(s) failed.`);
    process.exit(2);
  }
  console.log("\nDone. Store is ready to materialize products.");
}

main().catch((e) => { console.error(e); process.exit(1); });
