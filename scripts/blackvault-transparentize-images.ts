// Walk every Black Vault product's primary image, fetch it, soften the white
// background to transparent, upload the transparent version to Shopify Files,
// and replace the product's image with the transparent one. Removes the
// "white square against the liquid-black theme" effect the merchant flagged.
//
// Idempotent: each product image gets re-processed regardless of prior state.
// Skipped if the existing primary image already has significant transparency
// (avoids re-processing already-processed images on re-runs).
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-transparentize-images.ts
//
// Optional flags:
//   --brand=black-vault-apparel   defaults to BV
//   --dry-run                     report what would change, no writes
//   --product=<id>                only one product
//   --edge-only                   preserve interior white (slower; safer for printed designs)

import sharp from "sharp";
import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";
import { uploadBufferToShopifyFiles } from "@/lib/shopify-service";
import { makeBackgroundTransparent } from "@/lib/image-transparency";

type Args = {
  brand: string;
  dryRun: boolean;
  productId?: number;
  edgeOnly: boolean;
};

function parseArgs(): Args {
  const out: Args = { brand: "black-vault-apparel", dryRun: false, edgeOnly: false };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--brand=")) out.brand = a.slice(8);
    else if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--product=")) out.productId = Number(a.slice(10));
    else if (a === "--edge-only") out.edgeOnly = true;
  }
  return out;
}

async function shopifyRest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit): Promise<T> {
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
type ShopifyProduct = {
  id: number;
  title: string;
  tags: string;
  images: ShopifyImage[];
};

async function alreadyTransparent(buffer: Buffer): Promise<boolean> {
  const meta = await sharp(buffer).metadata();
  if (!meta.hasAlpha) return false;
  const stats = await sharp(buffer).stats();
  // alpha channel is usually the 4th — a min of 0 and mean below ~250 means
  // there's meaningful transparency, not just a fully-opaque image with an
  // alpha channel attached.
  const alpha = stats.channels[3];
  return alpha != null && alpha.min === 0 && alpha.mean < 250;
}

async function main() {
  const args = parseArgs();
  const creds = resolveShopifyCredentials(args.brand);
  console.log(`[transparentize] brand=${args.brand} store=${creds.storeDomain} dryRun=${args.dryRun} edgeOnly=${args.edgeOnly}`);

  let products: ShopifyProduct[];
  if (args.productId) {
    const data = await shopifyRest<{ product: ShopifyProduct }>(creds, `/products/${args.productId}.json?fields=id,title,tags,images`, { method: "GET" });
    products = [data.product];
  } else {
    const data = await shopifyRest<{ products: ShopifyProduct[] }>(
      creds,
      "/products.json?limit=250&fields=id,title,tags,images",
      { method: "GET" }
    );
    products = data.products.filter((p) =>
      (p.tags ?? "").split(",").some((t) => t.trim() === `brand:${args.brand}`)
    );
  }
  console.log(`[transparentize] ${products.length} product(s) to process`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of products) {
    const primary = product.images.sort((a, b) => a.position - b.position)[0];
    if (!primary) {
      console.log(`  - ${product.title}: no images, skip`);
      skipped += 1;
      continue;
    }

    try {
      const r = await fetch(primary.src);
      if (!r.ok) throw new Error(`fetch image ${r.status}`);
      const original = Buffer.from(await r.arrayBuffer());

      if (await alreadyTransparent(original)) {
        console.log(`  = ${product.title}: already transparent, skip`);
        skipped += 1;
        continue;
      }

      const transparent = await makeBackgroundTransparent(original, { edgeOnly: args.edgeOnly });

      if (args.dryRun) {
        console.log(`  ✓ ${product.title}: would replace ${primary.src} (${original.length} → ${transparent.length} bytes)`);
        processed += 1;
        continue;
      }

      const filename = `bv-${product.id}-transparent.png`;
      const file = await uploadBufferToShopifyFiles(filename, "image/png", transparent, args.brand);
      if (!file?.url) throw new Error("Shopify Files did not return a URL");

      // Add the transparent one as a new image, then delete the original.
      await shopifyRest(creds, `/products/${product.id}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: file.url, alt: product.title, position: 1 } })
      });
      await shopifyRest(creds, `/products/${product.id}/images/${primary.id}.json`, { method: "DELETE" });

      console.log(`  ✓ ${product.title}: replaced ${primary.id} with ${file.url}`);
      processed += 1;
    } catch (e) {
      console.warn(`  ✗ ${product.title}: ${e instanceof Error ? e.message : e}`);
      errors += 1;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Errors:    ${errors}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
