// Re-skin every BV active product's primary image onto the BV mock background.
// Idempotent: tags processed products with `bv-bg-composited`; re-runs skip them
// unless --force.
//
// Run dry-run (no API spend, no state changes):
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-bg-bulk-composite.ts --dry --mode ai
//
// Live run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-bg-bulk-composite.ts --mode ai
//
// Options:
//   --mode ai|cutout|sharp   compositor mode (default: ai). 'ai' costs ~$0.04/image; 'cutout' also costs $0.04 (gpt-image-1 cutout); 'sharp' is free if mockups are on white seamless.
//   --product <id>           process one product instead of all
//   --force                  re-process even if `bv-bg-composited` tag is set
//   --delete-original        delete the original primary image after compositing (default: keep as backup at position 2)
//   --dry                    list what would happen, no changes

import { compositeBrandImagesOnBvBg, type BgCompositeMode } from "@/lib/bulk-store-ops";

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : null;
  };
  const mode = (get("--mode") ?? "ai") as BgCompositeMode;
  const productId = get("--product") ? Number(get("--product")) : undefined;
  return {
    mode,
    productId,
    force: argv.includes("--force"),
    dryRun: argv.includes("--dry"),
    keepOriginal: !argv.includes("--delete-original")
  };
}

async function main() {
  const args = parseArgs();
  if (!["ai", "cutout", "sharp", "editorial"].includes(args.mode)) {
    throw new Error(`--mode must be ai|cutout|sharp|editorial, got ${args.mode}`);
  }
  console.log(
    `[bg-bulk] brand=black-vault-apparel mode=${args.mode}${args.dryRun ? " (DRY RUN)" : ""}${args.force ? " force=on" : ""}${args.productId ? ` product=${args.productId}` : ""}`
  );
  const r = await compositeBrandImagesOnBvBg("black-vault-apparel", args);
  console.log(`\n[bg-bulk] ${r.processed}/${r.total} processed, ${r.skipped} skipped, ${r.failed.length} failed`);
  for (const item of r.perItem) {
    const badge = item.status === "ok" ? "✓" : item.status === "skipped" ? "—" : "✗";
    console.log(`  ${badge} ${String(item.id).padEnd(16)} ${item.title}${item.reason ? ` (${item.reason})` : ""}`);
  }
  if (r.failed.length > 0) {
    console.log(`\n[bg-bulk] FAILURES:`);
    for (const f of r.failed) console.log(`  - ${f.id} ${f.title}: ${f.message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
