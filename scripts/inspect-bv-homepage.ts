// Pull the live BV Shopify homepage template (templates/index.json) and the
// related sections so we can find "Welcome" text + verify featured-collection
// section is wired. Read-only diagnostic.
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/inspect-bv-homepage.ts

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

async function shopifyRest<T>(creds: ReturnType<typeof resolveShopifyCredentials>, endpoint: string) {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    headers: {
      "X-Shopify-Access-Token": creds.token,
      "Content-Type": "application/json"
    }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Shopify ${endpoint} (${r.status}): ${text}`);
  return JSON.parse(text) as T;
}

async function main() {
  const creds = resolveShopifyCredentials("black-vault-apparel");
  const themes = await shopifyRest<{ themes: Array<{ id: number; role: string; name: string }> }>(creds, "/themes.json");
  const main = themes.themes.find((t) => t.role === "main");
  if (!main) throw new Error("No main theme");
  console.log(`[theme] ${main.name} (${main.id})`);

  const indexAsset = await shopifyRest<{ asset: { value: string } }>(
    creds,
    `/themes/${main.id}/assets.json?asset%5Bkey%5D=templates%2Findex.json`
  );
  const indexJson = indexAsset.asset.value;
  const outDir = path.join(process.cwd(), ".openclaw", "theme-recon");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.live.json"), indexJson, "utf8");
  console.log(`[fetch] templates/index.json → .openclaw/theme-recon/index.live.json (${indexJson.length} bytes)`);

  // Search for "welcome" anywhere in the JSON
  const welcomeMatches = [...indexJson.matchAll(/welcome[^"]{0,80}/gi)];
  console.log(`[search] "welcome" hits: ${welcomeMatches.length}`);
  for (const m of welcomeMatches.slice(0, 10)) console.log(`   - ${m[0]}`);

  // List sections in the homepage
  const parsed = JSON.parse(indexJson) as { sections: Record<string, { type: string }>; order?: string[] };
  console.log(`[sections] ${Object.keys(parsed.sections).length} on homepage:`);
  for (const id of parsed.order ?? Object.keys(parsed.sections)) {
    const s = parsed.sections[id];
    console.log(`   - ${id} (type: ${s?.type})`);
  }

  // Also pull a few common text-bearing section files in case Welcome lives in them
  const sectionFiles = ["sections/header.json", "sections/footer.json", "config/settings_data.json"];
  for (const file of sectionFiles) {
    try {
      const a = await shopifyRest<{ asset: { value: string } }>(
        creds,
        `/themes/${main.id}/assets.json?asset%5Bkey%5D=${encodeURIComponent(file)}`
      );
      const lower = a.asset.value.toLowerCase();
      const hits = [...lower.matchAll(/welcome[^"]{0,80}/gi)].slice(0, 3);
      if (hits.length > 0) {
        console.log(`[search] ${file}: "welcome" hits ${hits.length}`);
        for (const h of hits) console.log(`   - ${h[0]}`);
      }
    } catch (e) {
      // file may not exist on this theme — ignore
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
