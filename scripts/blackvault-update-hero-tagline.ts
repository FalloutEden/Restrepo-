// Update the BV hero "brand_statement" heading from "Built to be kept." to a
// more luxury-coded line. Edits the active theme's templates/index.json
// in place — Shopify keeps theme assets versioned, so this is reversible
// from Shopify admin → Online Store → Themes → Actions → Edit code.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-update-hero-tagline.ts [--text "Custom line"]

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const DEFAULT_NEW_TEXT = "Reserved for those who notice.";

async function rest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit): Promise<T> {
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

async function main() {
  const newText = process.argv.slice(2).find((a) => a.startsWith("--text="))?.slice(7) ?? DEFAULT_NEW_TEXT;
  const creds = resolveShopifyCredentials(BRAND);

  // Find main theme
  const themesResp = await rest<{ themes: Array<{ id: number; role: string; name: string }> }>(
    creds,
    "/themes.json",
    { method: "GET" }
  );
  const main = themesResp.themes.find((t) => t.role === "main");
  if (!main) throw new Error("No main theme found");
  console.log(`[init] theme: ${main.name} (${main.id})`);

  // Fetch templates/index.json
  const assetResp = await rest<{ asset: { key: string; value: string } }>(
    creds,
    `/themes/${main.id}/assets.json?asset[key]=templates/index.json`,
    { method: "GET" }
  );
  const original = assetResp.asset.value;

  // Find the brand_statement section's heading text. We do a structured
  // replacement: parse JSON, navigate to the heading, swap text, re-stringify.
  // Avoids any string-replace risk if the literal "Built to be kept." appears
  // elsewhere in the doc.
  const parsed = JSON.parse(original) as Record<string, unknown>;
  const sections = parsed.sections as Record<string, { blocks?: Record<string, { settings?: { text?: string } }> }>;
  const brandStatement = sections.brand_statement;
  if (!brandStatement?.blocks?.heading?.settings) {
    throw new Error("brand_statement.blocks.heading not found in template");
  }
  const oldText = brandStatement.blocks.heading.settings.text;
  console.log(`[init] current: ${oldText}`);
  brandStatement.blocks.heading.settings.text = `<p>${newText}<\/p>`;
  console.log(`[init] new:     <p>${newText}</p>`);

  // Push back
  await rest(creds, `/themes/${main.id}/assets.json`, {
    method: "PUT",
    body: JSON.stringify({
      asset: {
        key: "templates/index.json",
        value: JSON.stringify(parsed, null, 2)
      }
    })
  });
  console.log(`\n✓ Hero tagline updated to: "${newText}"`);
  console.log(`  Theme assets are versioned by Shopify — to revert, restore from Online Store → Themes → Actions → Edit code → templates/index.json history.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
