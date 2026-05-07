// Substitute {{*_URL}} placeholders in BV email + popup templates with real
// Shopify CDN + product URLs. Reads the asset manifest at
// .openclaw/brand/asset-cdn-urls.json + queries each linked product for its
// handle and primary image URL. Writes a parallel `_filled` directory so
// originals stay templated for re-runs.
//
// ESP-supplied placeholders (CART_RECOVERY_URL, UNSUBSCRIBE_URL, KEEP_ME_URL)
// are left untouched — Klaviyo / Shopify Email fill them at send-time.
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-substitute-email-urls.ts

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";

import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const STORE_PUBLIC = "https://blackvaultapparel.com";
const BRAND = "black-vault-apparel";
const MANIFEST_PATH = path.join(process.cwd(), ".openclaw", "brand", "asset-cdn-urls.json");
const TEMPLATES_DIR = path.join(process.cwd(), ".openclaw", "marketing", "emails");
const OUT_DIR = path.join(process.cwd(), ".openclaw", "marketing", "emails_filled");

// Map template placeholders → product title regex. We prefer the BASE
// (black/default) variant over "in White" colorways for hero email imagery,
// so the regex requires the title to NOT contain "in white" / "white" suffix.
const PRODUCT_PLACEHOLDERS: Array<{ titleMatch: RegExp; placeholders: string[] }> = [
  { titleMatch: /^the\s+heavyweight\s+hoodie\s*$/i, placeholders: ["HOODIE_URL", "HOODIE_HERO_URL", "HOODIE_THUMB_URL"] },
  { titleMatch: /^the\s+crewneck\s*$/i, placeholders: ["CREWNECK_URL", "CREWNECK_THUMB_URL"] },
  { titleMatch: /^the\s+long\s+sleeve\s*$/i, placeholders: ["LONGSLEEVE_URL", "LONGSLEEVE_THUMB_URL"] },
  { titleMatch: /^the\s+vault\s+tee\s*$/i, placeholders: ["VAULT_TEE_URL", "VAULT_TEE_THUMB_URL"] },
  { titleMatch: /^the\s+monogram\s+tee\s*$/i, placeholders: ["MONOGRAM_TEE_URL", "MONOGRAM_TEE_THUMB_URL"] },
  { titleMatch: /^the\s+snapback\s*$/i, placeholders: ["SNAPBACK_URL", "SNAPBACK_THUMB_URL"] }
];

const STATIC_PLACEHOLDERS: Record<string, string> = {
  // filled below from manifest
};

async function loadManifest(): Promise<Record<string, { url: string }>> {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw) as Record<string, { url: string }>;
  } catch {
    return {};
  }
}

async function fetchProducts() {
  const c = resolveShopifyCredentials(BRAND);
  const r = await fetch(
    `https://${c.storeDomain}/admin/api/${c.apiVersion}/products.json?limit=250&fields=id,title,handle,image,status`,
    { headers: { "X-Shopify-Access-Token": c.token } }
  );
  if (!r.ok) throw new Error(`Shopify products fetch ${r.status}`);
  const j = (await r.json()) as { products: Array<{ id: number; title: string; handle: string; status: string; image?: { src: string } }> };
  return j.products.filter((p) => p.status === "active");
}

function buildSubstitutionMap(
  manifest: Record<string, { url: string }>,
  products: Array<{ title: string; handle: string; image?: { src: string } }>
): Record<string, string> {
  const map: Record<string, string> = {};

  // Static assets
  if (manifest.bv_logo_gold) map.BV_LOGO_URL = manifest.bv_logo_gold.url;
  if (manifest.hero_final) map.HERO_IMAGE_URL = manifest.hero_final.url;
  if (manifest.bv_mock_bg) map.BV_BG_URL = manifest.bv_mock_bg.url;
  if (manifest.bv_wordmark) map.BV_WORDMARK_URL = manifest.bv_wordmark.url;

  // Collection page
  map.COLLECTION_URL = `${STORE_PUBLIC}/collections/all`;

  // Per-product URLs and image thumbs
  for (const p of products) {
    for (const rule of PRODUCT_PLACEHOLDERS) {
      if (rule.titleMatch.test(p.title)) {
        for (const ph of rule.placeholders) {
          if (ph.endsWith("_THUMB_URL") || ph.endsWith("_HERO_URL")) {
            if (p.image?.src) map[ph] = p.image.src;
          } else {
            map[ph] = `${STORE_PUBLIC}/products/${p.handle}`;
          }
        }
      }
    }
  }

  return map;
}

function applySubstitutions(content: string, map: Record<string, string>): { out: string; missing: string[] } {
  let out = content;
  const missing: string[] = [];
  // Find all {{KEY}} placeholders in the content
  const found = new Set<string>();
  for (const match of content.matchAll(/\{\{([A-Z_]+)\}\}/g)) {
    found.add(match[1]);
  }
  for (const key of found) {
    const value = map[key];
    if (value) {
      out = out.replaceAll(`{{${key}}}`, value);
    } else {
      missing.push(key);
    }
  }
  return { out, missing };
}

async function main() {
  const manifest = await loadManifest();
  const products = await fetchProducts();
  const map = buildSubstitutionMap(manifest, products);

  console.log(`[subst] ${Object.keys(map).length} substitutions available:`);
  for (const [k, v] of Object.entries(map)) {
    console.log(`   ${k.padEnd(28)} → ${v.slice(0, 80)}`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const files = (await readdir(TEMPLATES_DIR)).filter((f) => f.endsWith(".md"));
  const allMissing = new Set<string>();
  for (const f of files) {
    const src = await readFile(path.join(TEMPLATES_DIR, f), "utf8");
    const { out, missing } = applySubstitutions(src, map);
    await writeFile(path.join(OUT_DIR, f), out, "utf8");
    if (missing.length > 0) {
      console.log(`[subst] ${f}: ${missing.length} unfilled placeholders (left as-is): ${missing.join(", ")}`);
      missing.forEach((m) => allMissing.add(m));
    } else {
      console.log(`[subst] ${f}: fully filled`);
    }
  }

  console.log(`\n[subst] wrote ${files.length} filled templates to ${OUT_DIR}`);
  if (allMissing.size > 0) {
    console.log(`[subst] placeholders still unfilled across all files (ESP-managed or new — leave them alone in templates):`);
    for (const m of allMissing) console.log(`   ${m}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
