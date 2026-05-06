// Apply a faded BV alloverme pattern as an overlay on top of the existing
// liquid-black storefront background. This makes the storefront look
// branded throughout — every page, every section, every product card —
// without competing with product images (the pattern lives BEHIND them via
// a fixed-position pseudo-element with low opacity).
//
// Implementation: a separate CSS asset (bv-pattern-overlay.css) that adds
// `body::after` pseudo with the alloverme tiled at ~12% opacity. Layered
// independently of the existing bv-liquid-bg.css so it's reversible and
// doesn't touch the prior styling.
//
// Idempotent — re-running just updates the asset and leaves theme.liquid
// alone if the link is already injected.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-apply-pattern-overlay.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const ALL_PATTERN_PATH = path.join(BRAND_DIR, "BV Alloverme.png");

async function rest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit): Promise<T> {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    ...init,
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Shopify ${init.method ?? "GET"} ${endpoint} (${r.status}): ${text}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function gql<T>(creds: ShopifyCredentials, query: string, variables: Record<string, unknown>) {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  const text = await r.text();
  const parsed: { data?: T; errors?: unknown } = text ? JSON.parse(text) : {};
  if (!r.ok || (Array.isArray(parsed.errors) && parsed.errors.length > 0)) {
    throw new Error(`Shopify GraphQL (${r.status}): ${text}`);
  }
  return parsed.data as T;
}

async function uploadFile(creds: ShopifyCredentials, filePath: string, label: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const filename = `bv-${label}-${Date.now()}.png`;
  const staged = await gql<{
    stagedUploadsCreate: {
      stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>;
    };
  }>(creds, `mutation($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { message }
    }
  }`, { input: [{ filename, mimeType: "image/png", httpMethod: "POST", resource: "FILE" }] });
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("No staged target");
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buffer], { type: "image/png" }), filename);
  const u = await fetch(target.url, { method: "POST", body: form });
  if (!u.ok) throw new Error(`Staged upload failed ${u.status}`);
  const fc = await gql<{ fileCreate: { files: Array<{ id?: string; image?: { url?: string }; url?: string }> } }>(
    creds,
    `mutation($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { ... on MediaImage { id image { url } } ... on GenericFile { id url } }
        userErrors { message }
      }
    }`,
    { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", filename }] }
  );
  const file = fc.fileCreate.files[0];
  if (!file?.id) throw new Error("No file id");
  let url = file.url ?? file.image?.url ?? "";
  for (let i = 0; i < 25 && !url; i += 1) {
    await new Promise((r) => setTimeout(r, 750 + i * 250));
    const polled = await gql<{ node: { url?: string; image?: { url?: string } } | null }>(
      creds,
      `query($id: ID!) { node(id: $id) { ... on MediaImage { id image { url } } ... on GenericFile { id url } } }`,
      { id: file.id }
    );
    url = polled.node?.url ?? polled.node?.image?.url ?? "";
  }
  if (!url) throw new Error("Never got URL");
  return url;
}

async function getPublishedThemeId(creds: ShopifyCredentials): Promise<number> {
  const data = await rest<{ themes: Array<{ id: number; role: string }> }>(creds, "/themes.json", { method: "GET" });
  const main = data.themes.find((t) => t.role === "main");
  if (!main) throw new Error("No main theme");
  return main.id;
}

async function getAsset(creds: ShopifyCredentials, themeId: number, key: string): Promise<string | null> {
  try {
    const r = await rest<{ asset: { value: string } }>(
      creds,
      `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
      { method: "GET" }
    );
    return r.asset?.value ?? null;
  } catch (e) {
    if (e instanceof Error && /404/.test(e.message)) return null;
    throw e;
  }
}

async function putAsset(creds: ShopifyCredentials, themeId: number, key: string, value: string) {
  await rest(creds, `/themes/${themeId}/assets.json`, {
    method: "PUT",
    body: JSON.stringify({ asset: { key, value } })
  });
}

function buildPatternCss(imageUrl: string): string {
  return `/* BV alloverme pattern overlay — applied via two paths for robustness.
   1) html::before — sits behind the body's own background-image (liquid-bg)
   2) body::after — sits over the body bg but under page content
   At ~32% opacity the gold pattern reads as branding without overpowering. */

/* Single layer (was two — the second was reading as too prominent). Smaller
   tile so each BV motif sits in the texture rather than dominating it. */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  background-image: url("${imageUrl}");
  background-size: 160px auto;
  background-repeat: repeat;
  background-position: center center;
  background-attachment: fixed;
  opacity: 0.10;
  pointer-events: none;
  z-index: 0;
  mix-blend-mode: screen;
  transform: translateZ(0);
}

@media (max-width: 768px) {
  body::after {
    background-attachment: scroll;
    background-size: 110px auto;
    opacity: 0.08;
  }
}

/* Make sure direct page content sits above the body::after layer. */
body > * {
  position: relative;
  z-index: 1;
}
`;
}

const LINK_TAG = `  <link rel="stylesheet" href="{{ 'bv-pattern-overlay.css' | asset_url }}">`;
const MARKER = "{% comment %} BV pattern overlay injection {% endcomment %}";

function injectLink(themeLiquid: string): string {
  if (themeLiquid.includes(MARKER)) return themeLiquid;
  const headClose = themeLiquid.indexOf("</head>");
  if (headClose === -1) throw new Error("theme.liquid has no </head>");
  return themeLiquid.slice(0, headClose) + `${MARKER}\n${LINK_TAG}\n` + themeLiquid.slice(headClose);
}

async function main() {
  if (!fs.existsSync(ALL_PATTERN_PATH)) throw new Error(`Missing ${ALL_PATTERN_PATH}`);
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] brand=${BRAND} store=${creds.storeDomain}`);

  console.log(`[upload] uploading alloverme pattern to Shopify Files…`);
  const cdnUrl = await uploadFile(creds, ALL_PATTERN_PATH, "alloverme-overlay");
  console.log(`[upload] url=${cdnUrl}`);

  const themeId = await getPublishedThemeId(creds);
  console.log(`[theme] working on theme ${themeId}`);

  const css = buildPatternCss(cdnUrl);
  await putAsset(creds, themeId, "assets/bv-pattern-overlay.css", css);
  console.log(`[theme] wrote assets/bv-pattern-overlay.css`);

  const themeLiquid = await getAsset(creds, themeId, "layout/theme.liquid");
  if (!themeLiquid) throw new Error("Could not fetch layout/theme.liquid");
  const updated = injectLink(themeLiquid);
  if (updated !== themeLiquid) {
    await putAsset(creds, themeId, "layout/theme.liquid", updated);
    console.log(`[theme] injected stylesheet link into theme.liquid`);
  } else {
    console.log(`[theme] link already present, no change`);
  }

  console.log(`\n✓ BV pattern overlay applied.`);
  console.log(`  Storefront: https://${creds.storeDomain}`);
  console.log(`  Hard-reload (Ctrl+Shift+R) to clear cache.`);
  console.log(`\nTo dial the pattern visibility:`);
  console.log(`  - Edit assets/bv-pattern-overlay.css → opacity (0.14 currently; lower = subtler)`);
  console.log(`  - Edit background-size (320px currently; smaller = denser tiling)`);
  console.log(`To remove entirely:`);
  console.log(`  - Delete assets/bv-pattern-overlay.css from theme`);
  console.log(`  - Or remove the <link> + comment line from layout/theme.liquid`);
}

main().catch((e) => { console.error(e); process.exit(1); });
