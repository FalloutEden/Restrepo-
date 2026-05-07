// One-shot polish of the customer-facing BV storefront.
//
// Does:
//   1. Patch `templates/password.json` — replace "Opening soon" with "Welcome to the Vault"
//      in BV voice. Email signup remains so we capture leads while the store is gated.
//   2. Patch `templates/index.json` (homepage) — verify the hero CTA + featured-collection
//      section are present; tighten copy if needed.
//
// Read-only diagnostic:
//   ... scripts/bv-storefront-polish.ts --dry
//
// Live:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-storefront-polish.ts

import fs from "node:fs";
import path from "node:path";

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

async function getThemeId(creds: ShopifyCredentials): Promise<number> {
  const themes = await rest<{ themes: Array<{ id: number; role: string; name: string }> }>(
    creds,
    "/themes.json"
  );
  const main = themes.themes.find((t) => t.role === "main");
  if (!main) throw new Error("No main theme");
  console.log(`[theme] ${main.name} (id=${main.id})`);
  return main.id;
}

async function getAsset(creds: ShopifyCredentials, themeId: number, key: string): Promise<string> {
  const r = await rest<{ asset: { value: string } }>(
    creds,
    `/themes/${themeId}/assets.json?asset%5Bkey%5D=${encodeURIComponent(key)}`
  );
  return r.asset.value;
}

async function putAsset(creds: ShopifyCredentials, themeId: number, key: string, value: string) {
  await rest(creds, `/themes/${themeId}/assets.json`, {
    method: "PUT",
    body: JSON.stringify({ asset: { key, value } })
  });
  console.log(`[theme] PUT ${key} (${value.length} bytes)`);
}

function patchPasswordTemplate(json: string): string {
  const t = JSON.parse(json) as {
    sections: { main?: { blocks?: Record<string, { settings?: Record<string, unknown> }> } };
  };
  const blocks = t.sections.main?.blocks;
  if (!blocks) return json;

  // Replace any block whose `text` setting contains "Opening soon" with the BV welcome copy.
  // Replace any subhead text as well.
  for (const [key, block] of Object.entries(blocks)) {
    const settings = block.settings;
    if (!settings) continue;
    const txt = settings.text;
    if (typeof txt !== "string") continue;
    if (/opening soon/i.test(txt)) {
      settings.text = "<h1>Welcome to the Vault.</h1>";
      console.log(`[patch] block "${key}" text → "Welcome to the Vault."`);
    } else if (/sign up.*newsletter|first to know|we'?re launching/i.test(txt)) {
      settings.text = "<p>Heavyweight cotton. Embroidered Old Gold. Built to be Kept. Drop your email — we open the doors soon.</p>";
      console.log(`[patch] block "${key}" subhead text → BV brand voice`);
    }
  }
  return JSON.stringify(t, null, 2);
}

function patchHomepageTemplate(json: string): { value: string; changed: boolean } {
  type BlockShape = { type?: string; settings?: Record<string, unknown>; blocks?: Record<string, BlockShape>; block_order?: string[]; static?: boolean; name?: string };
  type SectionShape = {
    type: string;
    blocks?: Record<string, BlockShape>;
    block_order?: unknown[];
    settings?: Record<string, unknown>;
  };
  const t = JSON.parse(json) as {
    sections: Record<string, SectionShape>;
    order?: string[];
  };
  let changed = false;

  // 0. Insert a transitioning product carousel between the hero and the brand
  // statement so the homepage has product imagery scrolling near the top.
  // Uses Horizon's existing product-list section in carousel layout — no new
  // images required (each product's primary is already the BV-mock-BG composite).
  if (!t.sections.hero_carousel) {
    t.sections.hero_carousel = {
      type: "product-list",
      blocks: {
        "static-header": {
          type: "_product-list-content",
          name: "t:names.header",
          static: true,
          settings: {
            content_direction: "column",
            vertical_on_mobile: false,
            horizontal_alignment: "center",
            vertical_alignment: "center",
            align_baseline: true,
            horizontal_alignment_flex_direction_column: "center",
            vertical_alignment_flex_direction_column: "center",
            gap: 16
          },
          blocks: {
            heading: {
              type: "text",
              name: "t:names.heading",
              settings: {
                text: "<p>Featured pieces</p>",
                type_preset: "h3",
                alignment: "center",
                color: "#D4B896"
              },
              blocks: {}
            }
          },
          block_order: ["heading"]
        }
      } as Record<string, BlockShape>,
      block_order: [],
      settings: {
        collection: "all",
        layout_type: "carousel",
        carousel_on_mobile: true,
        max_products: 8,
        columns: 4,
        mobile_columns: "2",
        section_width: "page-width",
        color_scheme: "scheme-1",
        "padding-block-start": 60,
        "padding-block-end": 60
      } as Record<string, unknown>
    } as SectionShape;
    changed = true;
    console.log(`[patch] inserted hero_carousel section (product-list, carousel layout)`);
  }

  // Make sure the new section appears in the correct order — right after hero_main.
  if (t.order && Array.isArray(t.order)) {
    const idx = t.order.indexOf("hero_carousel");
    const heroIdx = t.order.indexOf("hero_main");
    if (idx === -1 && heroIdx >= 0) {
      t.order.splice(heroIdx + 1, 0, "hero_carousel");
      changed = true;
      console.log(`[patch] order: hero_carousel placed after hero_main`);
    }
  }

  // 1. Hero — ensure CTA label says "Shop the Collection", is wired to
  // /collections/all, AND has actual button styling (Horizon's button block
  // accepts "button" | "button-secondary" | "link" — anything else falls
  // back to an unstyled link, which is what was happening before).
  const hero = t.sections.hero_main;
  if (hero) {
    const cta = hero.blocks?.shop_cta;
    if (cta?.settings) {
      if (cta.settings.label !== "Shop the Collection") {
        cta.settings.label = "Shop the Collection";
        changed = true;
        console.log(`[patch] hero CTA label → "Shop the Collection"`);
      }
      if (cta.settings.link !== "shopify://collections/all") {
        cta.settings.link = "shopify://collections/all";
        changed = true;
        console.log(`[patch] hero CTA link → /collections/all`);
      }
      if (cta.settings.style_class !== "button") {
        cta.settings.style_class = "button";
        changed = true;
        console.log(`[patch] hero CTA style_class → "button" (was "${cta.settings.style_class}" — invalid)`);
      }
    }
  }

  // 2. Brand statement — ensure the headline is "Welcome to the Vault" not "Built to be kept"
  // (heading), and keep the body about construction.
  const brand = t.sections.brand_statement;
  if (brand) {
    const heading = brand.blocks?.heading;
    if (heading?.settings && typeof heading.settings.text === "string") {
      if (!/welcome to the vault/i.test(heading.settings.text)) {
        heading.settings.text = "<p>Welcome to the Vault.</p>";
        changed = true;
        console.log(`[patch] brand_statement heading → "Welcome to the Vault."`);
      }
    }
    const body = brand.blocks?.body;
    if (body?.settings && typeof body.settings.text === "string") {
      const want = "<p>Heavyweight cotton. Considered cuts. Old Gold thread, embroidered not printed. Black Vault is built on a simple idea — that the pieces you reach for first should be the ones made to last longest.</p>";
      if (body.settings.text !== want) {
        body.settings.text = want;
        changed = true;
        console.log(`[patch] brand_statement body → updated copy`);
      }
    }
  }

  // 3. Featured collection — ensure it pulls from "all" and shows 8 products.
  // Horizon's product-list section uses `max_products` (not `products_to_show`)
  // and `columns` (not `columns_desktop`). max_products max is 16; default is 4.
  const fc = t.sections.featured_collection;
  if (fc?.settings) {
    if (fc.settings.collection !== "all") {
      fc.settings.collection = "all";
      changed = true;
      console.log(`[patch] featured_collection.collection → "all"`);
    }
    if ((fc.settings.max_products as number | undefined) !== 8) {
      fc.settings.max_products = 8;
      changed = true;
      console.log(`[patch] featured_collection.max_products → 8`);
    }
    if ((fc.settings.columns as number | undefined) !== 4) {
      fc.settings.columns = 4;
      changed = true;
      console.log(`[patch] featured_collection.columns → 4`);
    }
    // Drop the legacy/wrong keys so they don't confuse customizers
    if ("products_to_show" in fc.settings) {
      delete fc.settings.products_to_show;
      changed = true;
    }
    if ("columns_desktop" in fc.settings) {
      delete fc.settings.columns_desktop;
      changed = true;
    }
    // Update the static heading from "The Collection" → "Featured pieces"
    const staticHeader = (fc.blocks as Record<string, { blocks?: Record<string, { settings?: Record<string, unknown> }> }> | undefined)?.["static-header"];
    const fcHeading = staticHeader?.blocks?.heading;
    if (fcHeading?.settings && typeof fcHeading.settings.text === "string" && !/featured/i.test(fcHeading.settings.text)) {
      fcHeading.settings.text = "<p>The Collection</p>";
      changed = true;
    }
  }

  return { value: JSON.stringify(t, null, 2), changed };
}

async function main() {
  const dry = process.argv.includes("--dry");
  const creds = resolveShopifyCredentials(BRAND);
  const themeId = await getThemeId(creds);

  // Backup dir
  const reconDir = path.join(process.cwd(), ".openclaw", "theme-recon");
  fs.mkdirSync(reconDir, { recursive: true });

  // 1. Password page
  console.log(`\n[1/2] templates/password.json`);
  const pw = await getAsset(creds, themeId, "templates/password.json");
  fs.writeFileSync(path.join(reconDir, "password.before.json"), pw);
  const newPw = patchPasswordTemplate(pw);
  fs.writeFileSync(path.join(reconDir, "password.after.json"), newPw);
  if (newPw !== pw && !dry) {
    await putAsset(creds, themeId, "templates/password.json", newPw);
  } else if (dry) {
    console.log(`[dry] password template would change ${newPw === pw ? "(no diff)" : "(diff staged at .openclaw/theme-recon/password.after.json)"}`);
  } else {
    console.log(`[skip] password template unchanged`);
  }

  // 2. Homepage
  console.log(`\n[2/2] templates/index.json`);
  const idx = await getAsset(creds, themeId, "templates/index.json");
  fs.writeFileSync(path.join(reconDir, "index.before.json"), idx);
  const { value: newIdx, changed } = patchHomepageTemplate(idx);
  fs.writeFileSync(path.join(reconDir, "index.after.json"), newIdx);
  if (changed && !dry) {
    await putAsset(creds, themeId, "templates/index.json", newIdx);
  } else if (dry) {
    console.log(`[dry] homepage would change ${changed ? "(diff staged)" : "(no diff)"}`);
  } else {
    console.log(`[skip] homepage already aligned`);
  }

  console.log(`\n[summary] Backups + diffs saved to ${reconDir}`);
  console.log(`[next] To make the store reachable to customers:`);
  console.log(`       Open https://${creds.storeDomain}/admin/online_store/preferences`);
  console.log(`       UNCHECK "Restrict access to visitors with the password" → Save.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
