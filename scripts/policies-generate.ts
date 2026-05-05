// Generate the five Shopify policies for every configured brand and save
// them to .openclaw/policies/<brand>/. Does NOT push to Shopify.
//
// Run: node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/policies-generate.ts
//   or for one brand: ... scripts/policies-generate.ts black-vault-apparel

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { BRANDS } from "../lib/brands";
import { loadPolicyConfig } from "../lib/policies-config";
import { generateAllPolicies } from "../lib/policies-generator";

const OUTPUT_ROOT = path.join(process.cwd(), ".openclaw", "policies");

async function generateForBrand(brandSlug: string) {
  const config = await loadPolicyConfig(brandSlug);
  const policies = generateAllPolicies(config);
  const dir = path.join(OUTPUT_ROOT, brandSlug);
  await mkdir(dir, { recursive: true });
  for (const policy of policies) {
    const filePath = path.join(dir, policy.filename);
    await writeFile(filePath, policy.body, "utf8");
    console.log(`[policies] wrote ${filePath}`);
  }
  console.log(`[policies] ${brandSlug}: ${policies.length} files (${config.legalEntity})\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const brands = args.length > 0 ? args : Object.keys(BRANDS);
  for (const brand of brands) {
    if (!(brand in BRANDS)) {
      console.warn(`[policies] skipping unknown brand: ${brand}`);
      continue;
    }
    await generateForBrand(brand);
  }
}

main().catch((error) => {
  console.error("[policies] FAILED:", error);
  process.exit(1);
});
