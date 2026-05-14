import "server-only";

import sharp from "sharp";
import {
  attachProductToOnlineStore,
  uploadBufferToShopifyFiles
} from "@/lib/shopify-service";
import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";
import { makeBackgroundTransparent } from "@/lib/image-transparency";
import { aiBackgroundReplace, cutoutComposite, sharpFlatWhiteCutout, type SubjectHint } from "@/lib/bg-composite";
import type { TenantContext } from "@/lib/tenant-context";

// Derive a SubjectHint (gender, garmentType) from a product title so we can
// guide gpt-image-1 to render the right model + silhouette. Without this we
// got a male model on the women's "Cropped Tee" SKUs.
function hintFromTitle(title: string): SubjectHint {
  const t = title.toLowerCase();
  // Hat-style products → no model, product-only render is safer
  if (/\b(hat|cap|beanie|snapback)\b/.test(t)) {
    return { gender: "none", garmentType: t.includes("beanie") ? "beanie" : t.includes("snapback") ? "snapback hat" : "cap" };
  }
  // Sock product → no model
  if (/\bsock(s)?\b/.test(t)) return { gender: "none", garmentType: "athletic crew sock" };
  // Women's-line cues
  if (/\b(women|cropped|womens|woman)\b/.test(t)) {
    return { gender: "female", garmentType: t.includes("cropped") ? "cropped tee with relaxed cropped silhouette" : undefined };
  }
  // Men's default
  if (/\b(men|mens|man)\b/.test(t)) return { gender: "male" };
  // Garment-only hints (no gender override) for AOP / unisex
  if (/\baop\b/.test(t)) return { gender: "as-shown" };
  return { gender: "male" }; // default for BV men's-line essentials
}

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

export async function attachAllToOnlineStore(
  brand: string,
  tenantCtx?: TenantContext
): Promise<AttachAllResult> {
  const creds = resolveShopifyCredentials(brand, tenantCtx);
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
      await attachProductToOnlineStore(p.id, creds.brandSlug, tenantCtx);
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

// ── Bulk: composite primary images onto the BV mock background ──────────────

export type BgCompositeMode = "ai" | "cutout" | "sharp" | "editorial";

export type BgCompositeResult = {
  brand: string;
  total: number;
  processed: number;
  skipped: number;
  failed: Array<{ id: number; title: string; message: string }>;
  perItem: Array<{ id: number; title: string; status: "ok" | "skipped" | "failed"; mode?: BgCompositeMode; reason?: string }>;
};

const BG_DONE_TAG = "bv-bg-composited";

export async function compositeBrandImagesOnBvBg(
  brand: string,
  options: {
    mode?: BgCompositeMode;
    productId?: number;
    force?: boolean;
    dryRun?: boolean;
    /** If true (default), keep the original image as a backup at position 2. Set false to delete it after the new BG composite is attached. */
    keepOriginal?: boolean;
  } = {}
): Promise<BgCompositeResult> {
  const creds = resolveShopifyCredentials(brand);
  const mode: BgCompositeMode = options.mode ?? "ai";
  type ShopifyImage = { id: number; src: string; position: number };
  type ShopifyProduct = { id: number; title: string; tags: string; status: string; images: ShopifyImage[] };

  let products: ShopifyProduct[];
  if (options.productId) {
    const data = await shopifyRest<{ product: ShopifyProduct }>(
      creds,
      `/products/${options.productId}.json?fields=id,title,tags,status,images`,
      { method: "GET" }
    );
    products = [data.product];
  } else {
    const data = await shopifyRest<{ products: ShopifyProduct[] }>(
      creds,
      "/products.json?limit=250&fields=id,title,tags,status,images",
      { method: "GET" }
    );
    // Only active products by default — drafts are reviewed separately
    products = data.products.filter((p) => p.status === "active");
  }

  const result: BgCompositeResult = {
    brand: creds.brandSlug,
    total: products.length,
    processed: 0,
    skipped: 0,
    failed: [],
    perItem: []
  };

  for (const product of products) {
    const tagList = (product.tags ?? "").split(",").map((t) => t.trim());
    const alreadyDone = tagList.includes(BG_DONE_TAG);
    if (alreadyDone && !options.force) {
      result.skipped += 1;
      result.perItem.push({ id: product.id, title: product.title, status: "skipped", reason: "already composited (tag present)" });
      continue;
    }
    // Source-image selection: use the FIRST image that isn't a previous
    // bv-on-bg composite. This is critical when re-running — re-runs would
    // otherwise feed the previous composite back into the AI/sharp pipeline,
    // producing double-wordmark stacks and degraded results. Falls back to
    // any primary image if no Printful original exists.
    const sortedImages = [...product.images].sort((a, b) => a.position - b.position);
    const printfulSource = sortedImages.find((img) => !/bv-\d+-on-bg/.test(img.src));
    const primary = printfulSource ?? sortedImages[0];
    if (!primary) {
      result.skipped += 1;
      result.perItem.push({ id: product.id, title: product.title, status: "skipped", reason: "no primary image" });
      continue;
    }
    // Track the visible primary so we replace position 1 below.
    const visiblePrimary = sortedImages[0];
    if (options.dryRun) {
      result.perItem.push({ id: product.id, title: product.title, status: "ok", mode, reason: "dry-run" });
      continue;
    }
    try {
      const r = await fetch(primary.src);
      if (!r.ok) throw new Error(`fetch primary image ${r.status}`);
      const sourceBuffer = Buffer.from(await r.arrayBuffer());

      // AOP (all-over-print) products MUST use cutout mode — editorial mode
      // AI re-render destroys the all-over pattern, leaving a plain garment
      // with just a chest mark. Detect via title or tag and force cutout.
      const isAop =
        /\baop\b/i.test(product.title) ||
        tagList.some((t) => /^(all-over-print|aop)$/i.test(t));
      const effectiveMode: BgCompositeMode = isAop && mode === "editorial" ? "cutout" : mode;

      let composited: Buffer;
      if (effectiveMode === "ai") {
        composited = await aiBackgroundReplace(sourceBuffer);
      } else if (effectiveMode === "cutout") {
        composited = await cutoutComposite(sourceBuffer, {});
      } else if (effectiveMode === "editorial") {
        // AI re-renders the subject as an editorial fashion shot on a
        // transparent BG (with gender + garment hints from the product title),
        // then sharp-composites onto the real BV mock BG. The wordmark in the
        // upper-left of the BG file stays pixel-perfect because we never ask
        // the AI to draw the BG.
        const hint = hintFromTitle(product.title);
        composited = await cutoutComposite(sourceBuffer, { editorial: true, hint });
      } else {
        const cut = await sharpFlatWhiteCutout(sourceBuffer);
        composited = await cutoutComposite(cut, { alreadyTransparent: true });
      }

      const filename = `bv-${product.id}-on-bg.png`;
      const file = await uploadBufferToShopifyFiles(filename, "image/png", composited, brand);
      if (!file?.url) throw new Error("Shopify Files did not return a URL");
      // Before adding the new composite, prune any stale bv-on-bg composites
      // from previous runs so we don't end up with positions 1-4 all being
      // composited duplicates.
      const staleComposites = sortedImages.filter((img) => /bv-\d+-on-bg/.test(img.src));
      for (const stale of staleComposites) {
        try {
          await shopifyRest(creds, `/products/${product.id}/images/${stale.id}.json`, { method: "DELETE" });
        } catch {
          // ignore failed deletes — we'd rather have stale than no image
        }
      }

      // Add new image at position 1 — Shopify auto-shifts the prior images
      await shopifyRest(creds, `/products/${product.id}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: file.url, alt: product.title, position: 1 } })
      });
      // Optionally also delete the visible primary if the merchant wants no
      // backup at all. By default we keep the Printful original as backup.
      const keepOriginal = options.keepOriginal !== false;
      if (!keepOriginal && visiblePrimary && visiblePrimary.id !== primary.id) {
        try {
          await shopifyRest(creds, `/products/${product.id}/images/${visiblePrimary.id}.json`, { method: "DELETE" });
        } catch {}
      }
      // Tag the product so re-runs skip it
      const newTags = Array.from(new Set([...tagList, BG_DONE_TAG])).filter(Boolean).join(", ");
      await shopifyRest(creds, `/products/${product.id}.json`, {
        method: "PUT",
        body: JSON.stringify({ product: { id: product.id, tags: newTags } })
      });
      result.processed += 1;
      result.perItem.push({ id: product.id, title: product.title, status: "ok", mode });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.failed.push({ id: product.id, title: product.title, message });
      result.perItem.push({ id: product.id, title: product.title, status: "failed", mode, reason: message });
    }
    // Slow down to respect Shopify Admin REST rate limits + give gpt-image-1 breathing room
    await new Promise((r) => setTimeout(r, 1500));
  }
  return result;
}
