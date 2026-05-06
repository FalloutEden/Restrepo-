// Interactive store-cleanup CLI.
//
// Walks every product that needs merchant review (drafts + active-but-not-
// published-to-Online-Store) one by one and prompts:
//
//   [V]iew (open admin URL) [P]ublish [D]elete [S]kip [Q]uit
//
// Yes-publish hits Shopify GraphQL `publishablePublish` so the product lands
// on the Online Store sales channel — the missing step in our pre-existing
// "set status=active" flow that was leaving products invisible to customers.
//
// Safe to interrupt mid-loop. Idempotent: re-running just shows whatever's
// still pending.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/store-cleanup.ts
//
// Optional flags:
//   --brand=black-vault-apparel    only one brand
//   --auto-publish                 publish everything in the queue, no prompts
//   --include-published            also visit already-live products

import readline from "node:readline";
import { listShopifyCleanupQueue, publishShopifyProduct, deleteShopifyProduct } from "@/lib/shopify-service";
import type { ShopifyCleanupItem } from "@/lib/shopify-service";

type Args = {
  brand?: string;
  autoPublish: boolean;
  includePublished: boolean;
};

function parseArgs(): Args {
  const out: Args = { autoPublish: false, includePublished: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--brand=")) out.brand = arg.slice(8);
    else if (arg === "--auto-publish") out.autoPublish = true;
    else if (arg === "--include-published") out.includePublished = true;
  }
  return out;
}

async function prompt(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((res) => rl.question(q, (a) => res(a.trim())));
}

function describe(item: ShopifyCleanupItem) {
  const reasonLabel =
    item.reason === "draft"
      ? "DRAFT (not yet active)"
      : item.reason === "active-not-published"
        ? "ACTIVE but NOT on Online Store"
        : "ACTIVE + on Online Store";
  return [
    `\n──────────────────────────────────────────────`,
    `Title:  ${item.title}`,
    `Brand:  ${item.brandName} (${item.brand})`,
    `Status: ${reasonLabel}`,
    `Admin:  ${item.adminUrl}`,
    item.imageUrl ? `Image:  ${item.imageUrl}` : null,
    item.tags.length ? `Tags:   ${item.tags.slice(0, 6).join(", ")}` : null
  ].filter(Boolean).join("\n");
}

async function main() {
  const args = parseArgs();
  console.log(`[store-cleanup] brand=${args.brand ?? "all"} autoPublish=${args.autoPublish} includePublished=${args.includePublished}`);

  const queue = await listShopifyCleanupQueue({
    brand: args.brand,
    includePublished: args.includePublished
  });

  if (queue.length === 0) {
    console.log("Nothing pending review. ✓");
    return;
  }

  console.log(`${queue.length} product(s) need review:`);
  const counts = queue.reduce<Record<string, number>>((acc, item) => {
    acc[item.reason] = (acc[item.reason] ?? 0) + 1;
    return acc;
  }, {});
  for (const [reason, n] of Object.entries(counts)) console.log(`  ${reason}: ${n}`);

  if (args.autoPublish) {
    let ok = 0;
    let fail = 0;
    for (const item of queue) {
      if (item.reason === "active-published") continue;
      try {
        await publishShopifyProduct(item.id, item.brand);
        console.log(`  ✓ published ${item.title}`);
        ok += 1;
      } catch (e) {
        console.warn(`  ✗ failed ${item.title}: ${e instanceof Error ? e.message : e}`);
        fail += 1;
      }
    }
    console.log(`\n=== Done. Published ${ok}, failed ${fail}.`);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let published = 0;
  let deleted = 0;
  let skipped = 0;
  try {
    for (const item of queue) {
      console.log(describe(item));
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const ans = (await prompt(rl, "  [P]ublish / [D]elete / [S]kip / [Q]uit › ")).toLowerCase();
        if (ans === "p" || ans === "yes" || ans === "y") {
          try {
            const result = await publishShopifyProduct(item.id, item.brand);
            console.log(`  ✓ published (onlineStore=${result.onlineStorePublished})`);
            published += 1;
          } catch (e) {
            console.warn(`  ✗ publish failed: ${e instanceof Error ? e.message : e}`);
          }
          break;
        }
        if (ans === "d" || ans === "delete") {
          const confirm = (await prompt(rl, "    really delete? [y/N] › ")).toLowerCase();
          if (confirm === "y" || confirm === "yes") {
            try {
              await deleteShopifyProduct(item.id, item.brand);
              console.log("  ✓ deleted");
              deleted += 1;
            } catch (e) {
              console.warn(`  ✗ delete failed: ${e instanceof Error ? e.message : e}`);
            }
          } else {
            console.log("  → keeping");
          }
          break;
        }
        if (ans === "s" || ans === "skip" || ans === "n" || ans === "no" || ans === "") {
          skipped += 1;
          break;
        }
        if (ans === "q" || ans === "quit" || ans === "exit") {
          console.log("\nQuitting.");
          rl.close();
          process.exit(0);
        }
        console.log("  (unrecognized — type p, d, s, or q)");
      }
    }
  } finally {
    rl.close();
  }

  console.log(`\n=== Summary ===`);
  console.log(`Published: ${published}`);
  console.log(`Deleted:   ${deleted}`);
  console.log(`Skipped:   ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
