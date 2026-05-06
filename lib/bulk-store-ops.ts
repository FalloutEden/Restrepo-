import "server-only";

import sharp from "sharp";
import {
  attachProductToOnlineStore,
  uploadBufferToShopifyFiles
} from "@/lib/shopify-service";
import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";
import { makeBackgroundTransparent } from "@/lib/image-transparency";

// Bulk operations on a brand's Shopify store. Each function is idempotent and
// safe to run repeatedly. Used by both CLI scripts and operator tools.

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

// ── Bulk: attach all products to Online Store ────────────────────────────────

export type AttachAllResult = {
  brand: string;
  total: number;
  attached: number;
  failed: Array<{ id: number; title: string; message: string }>;
};

export async function attachAllToOnlineStore(brand: string): Promise<AttachAllResult> {
  const creds = resolveShopifyCredentials(brand);
  const data = await shopifyRest<{ products: Array<{ id: number; title: string }> }>(
    creds,
    "/products.json?limit=250&fields=id,title",
    { method: "GET" }
  );
  const result: AttachAllResult = {
    brand: creds.brandSlug,
    total: data.products.length,
    attached: 0,
    failed: []
  };
  for (const p of data.products) {
    try {
      await attachProductToOnlineStore(p.id, creds.brandSlug);
      result.attached += 1;
    } catch (e) {
      result.failed.push({ id: p.id, title: p.title, message: e instanceof Error ? e.message : String(e) });
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return result;
}

// ── Bulk: transparentize product primary images ─────────────────────────────

export type TransparentizeResult = {
  brand: string;
  total: number;
  processed: number;
  skipped: number;
  failed: Array<{ id: number; title: string; message: string }>;
};

async function alreadyTransparent(buffer: Buffer): Promise<boolean> {
  const meta = await sharp(buffer).metadata();
  if (!meta.hasAlpha) return false;
  const stats = await sharp(buffer).stats();
  const alpha = stats.channels[3];
  return alpha != null && alpha.min === 0 && alpha.mean < 250;
}

export async function transparentizeBrandImages(
  brand: string,
  options: { edgeOnly?: boolean; productId?: number } = {}
): Promise<TransparentizeResult> {
  const creds = resolveShopifyCredentials(brand);
  type ShopifyImage = { id: number; src: string; position: number };
  type ShopifyProduct = { id: number; title: string; tags: string; images: ShopifyImage[] };

  let products: ShopifyProduct[];
  if (options.productId) {
    const data = await shopifyRest<{ product: ShopifyProduct }>(creds, `/products/${options.productId}.json?fields=id,title,tags,images`, { method: "GET" });
    products = [data.product];
  } else {
    const data = await shopifyRest<{ products: ShopifyProduct[] }>(creds, "/products.json?limit=250&fields=id,title,tags,images", { method: "GET" });
    products = data.products.filter((p) =>
      (p.tags ?? "").split(",").some((t) => t.trim() === `brand:${creds.brandSlug}`)
    );
  }

  const result: TransparentizeResult = {
    brand: creds.brandSlug,
    total: products.length,
    processed: 0,
    skipped: 0,
    failed: []
  };

  for (const product of products) {
    const primary = product.images.sort((a, b) => a.position - b.position)[0];
    if (!primary) { result.skipped += 1; continue; }
    try {
      const r = await fetch(primary.src);
      if (!r.ok) throw new Error(`fetch image ${r.status}`);
      const original = Buffer.from(await r.arrayBuffer());
      if (await alreadyTransparent(original)) {
        result.skipped += 1;
        continue;
      }
      const transparent = await makeBackgroundTransparent(original, { edgeOnly: options.edgeOnly });
      const filename = `bv-${product.id}-transparent.png`;
      const file = await uploadBufferToShopifyFiles(filename, "image/png", transparent, brand);
      if (!file?.url) throw new Error("Shopify Files did not return a URL");
      await shopifyRest(creds, `/products/${product.id}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: file.url, alt: product.title, position: 1 } })
      });
      await shopifyRest(creds, `/products/${product.id}/images/${primary.id}.json`, { method: "DELETE" });
      result.processed += 1;
    } catch (e) {
      result.failed.push({ id: product.id, title: product.title, message: e instanceof Error ? e.message : String(e) });
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return result;
}
