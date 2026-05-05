// Publish the five Shopify policies for every configured brand to the
// corresponding Shopify store via the shopPolicyUpdate GraphQL mutation.
// This overwrites any existing policy body in the live storefront.
//
// Run: node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/policies-publish.ts
//   or one brand: ... scripts/policies-publish.ts black-vault-apparel

import { BRANDS } from "../lib/brands";
import { loadPolicyConfig } from "../lib/policies-config";
import { generateAllPolicies } from "../lib/policies-generator";
import { pushAllPolicies } from "../lib/policies-shopify";

async function publishForBrand(brandSlug: string) {
  const config = await loadPolicyConfig(brandSlug);
  const policies = generateAllPolicies(config);
  console.log(`\n[policies] ${brandSlug} (${config.legalEntity}) — pushing ${policies.length} policies`);
  const results = await pushAllPolicies(brandSlug, policies);
  for (const r of results) {
    if (r.ok) {
      console.log(`  ✓ ${r.type}${r.url ? `  ${r.url}` : ""}`);
    } else {
      console.log(`  ✗ ${r.type}: ${r.error}`);
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  console.log(`[policies] ${brandSlug}: ${okCount}/${results.length} succeeded`);
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const brands = args.length > 0 ? args : Object.keys(BRANDS);
  let totalFail = 0;
  for (const brand of brands) {
    if (!(brand in BRANDS)) {
      console.warn(`[policies] skipping unknown brand: ${brand}`);
      continue;
    }
    try {
      const results = await publishForBrand(brand);
      totalFail += results.filter((r) => !r.ok).length;
    } catch (error) {
      console.error(`[policies] FAILED for ${brand}:`, error);
      totalFail += 1;
    }
  }
  if (totalFail > 0) {
    console.log(`\n[policies] DONE with ${totalFail} failure(s).`);
    process.exit(1);
  }
  console.log(`\n[policies] DONE — all policies published.`);
}

main().catch((error) => {
  console.error("[policies] FAILED:", error);
  process.exit(1);
});
