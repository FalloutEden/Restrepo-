// Revert every BV active product's primary image back to its original
// Printful mockup. The bulk-composite runs created `bv-{id}-on-bg` images
// at position 1 (and sometimes positions 2-4 from successive runs); the
// real Printful original sits at position 5+. This script:
//
//   1. Finds the first non-bv-on-bg image on each product (the Printful original)
//   2. Re-attaches a copy of that image at position 1
//   3. Deletes every bv-on-bg image
//   4. Removes the `bv-bg-composited` tag so re-runs work correctly
//
// Idempotent: products with no bv-on-bg images are skipped.
//
// Run dry-run first:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-revert-to-printful.ts --dry
//
// Run live:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-revert-to-printful.ts --confirm

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";

async function rest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": creds.token,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Shopify ${init.method ?? "GET"} ${endpoint} (${r.status}): ${text}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

type ShopifyImage = { id: number; src: string; position: number };
type ShopifyProduct = { id: number; title: string; tags: string; status: string; images: ShopifyImage[] };

function isComposite(src: string): boolean {
  return /bv-\d+-on-bg/.test(src);
}

async function main() {
  const dry = process.argv.includes("--dry") || !process.argv.includes("--confirm");
  if (dry) {
    console.log("[revert] DRY RUN — pass --confirm to execute. No changes will be made.\n");
  } else {
    console.log("[revert] LIVE — reverting product primary images to Printful originals.\n");
  }

  const creds = resolveShopifyCredentials(BRAND);
  const list = await rest<{ products: ShopifyProduct[] }>(
    creds,
    "/products.json?limit=250&fields=id,title,tags,status,images"
  );
  const products = list.products.filter((p) => p.status === "active");
  console.log(`[revert] ${products.length} active BV products`);

  let reverted = 0;
  let skipped = 0;
  let failed = 0;

  // Find all bv-on-bg composites across all products — these include both
  // the position-1 primary (when the bulk-composite still has it as primary)
  // AND any secondary gallery images (positions 2-9) from prior runs.
  let totalToDelete = 0;
  for (const product of products) {
    const composites = product.images.filter((img) => isComposite(img.src));
    const printfulOriginal = product.images.find((img) => !isComposite(img.src));
    totalToDelete += composites.length;

    if (composites.length === 0) {
      skipped += 1;
      continue;
    }

    const isPrimaryComposite = composites.some((img) => img.position === Math.min(...product.images.map((i) => i.position)));
    if (isPrimaryComposite && !printfulOriginal) {
      failed += 1;
      console.log(`  ✗ ${product.id}  ${product.title}  (primary is composite, NO Printful original — needs manual fix)`);
      continue;
    }

    console.log(`  → ${product.id}  ${product.title}  (${composites.length} composite(s) in gallery)`);
    if (dry) continue;

    try {
      // If the primary is a composite, re-attach the Printful original at
      // position 1 first, so deleting the composite doesn't leave a gap.
      if (isPrimaryComposite && printfulOriginal) {
        await rest(creds, `/products/${product.id}/images.json`, {
          method: "POST",
          body: JSON.stringify({
            image: { src: printfulOriginal.src, alt: product.title, position: 1 }
          })
        });
      }

      // Delete every bv-on-bg composite (both primary if applicable AND gallery secondaries)
      for (const comp of composites) {
        try {
          await rest(creds, `/products/${product.id}/images/${comp.id}.json`, { method: "DELETE" });
        } catch (e) {
          console.log(`    warn: failed to delete ${comp.id}: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }

      // Remove the bv-bg-composited tag so future re-runs aren't skipped
      const tagList = (product.tags ?? "").split(",").map((t) => t.trim()).filter((t) => t && t !== "bv-bg-composited");
      await rest(creds, `/products/${product.id}.json`, {
        method: "PUT",
        body: JSON.stringify({ product: { id: product.id, tags: tagList.join(", ") } })
      });

      reverted += 1;
      // Brief pause to respect Shopify Admin REST rate limits
      await new Promise((r) => setTimeout(r, 600));
    } catch (e) {
      failed += 1;
      console.log(`  ✗ ${product.id}  failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  console.log(`\n[revert] total composite images that ${dry ? "would be" : "were"} deleted: ${totalToDelete}`);

  console.log(`\n[revert] reverted: ${reverted}  skipped: ${skipped}  failed: ${failed}`);
  if (dry) {
    console.log("[revert] re-run with --confirm to execute.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
