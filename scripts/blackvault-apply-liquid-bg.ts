// Apply a liquid-black image as the storefront background, replacing the
// flat warm-black (#0F0E0C) currently set in scheme-1.
//
// Workflow:
//   1. Use .openclaw/brand/BV Liquid Background.png if it exists. Otherwise
//      generate one via gpt-image-1 (~$0.04) using a prompt tuned to match
//      the user's reference (premium liquid silk, deep black with subtle
//      lighter highlights, no logos, no text, fluid organic curves).
//   2. Upload the image to Shopify Files for a stable CDN URL.
//   3. PUT a new asset assets/bv-liquid-bg.css that targets body + the
//      Horizon theme root with a fixed background-image. Section content
//      keeps its existing solid color so text stays readable; the texture
//      shows through margins/padding and on the body around full-bleed
//      sections that opt in.
//   4. Inject a <link rel="stylesheet"> into layout/theme.liquid (idempotent
//      — only adds the line if not already present).
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-apply-liquid-bg.ts

import fs from "node:fs";
import path from "node:path";
import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";
import { openai, IMAGE_MODEL } from "@/lib/openai";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const LIQUID_BG_PATH = path.join(BRAND_DIR, "BV Liquid Background.png");

const LIQUID_PROMPT = [
  "Premium luxury background texture: liquid black silk, deep matte-to-glossy black with subtle silver-grey highlights tracing fluid organic curves and folds.",
  "High-end editorial photography style, soft directional light from upper-left causing gentle reflective sheen on the curved surfaces.",
  "Deep blacks with controlled highlights — Tom Ford runway / Saint Laurent campaign aesthetic.",
  "Composition: full-frame seamless texture suitable as a webpage background, no horizon line, no objects, no logos, no text, no models.",
  "Mood: dark, refined, quietly luxurious, sophisticated. Wide cinematic 3:2 framing with motion-frozen liquid forms.",
  "Resolution: highly detailed, cinematic, magazine-quality."
].join(" ");

// ── Shopify helpers (inlined so this script is standalone) ────────────────

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

async function shopifyGraphQL<T>(creds: ShopifyCredentials, query: string, variables: Record<string, unknown>): Promise<T> {
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

async function uploadToShopifyFiles(creds: ShopifyCredentials, filename: string, buffer: Buffer): Promise<string> {
  const staged = await shopifyGraphQL<{
    stagedUploadsCreate: {
      stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>;
    };
  }>(creds, `mutation($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
    }
  }`, { input: [{ filename, mimeType: "image/png", httpMethod: "POST", resource: "FILE" }] });
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buffer], { type: "image/png" }), filename);
  await fetch(target.url, { method: "POST", body: form });

  const fc = await shopifyGraphQL<{
    fileCreate: { files: Array<{ id?: string; image?: { url?: string }; url?: string }> };
  }>(creds, `mutation($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files { ... on MediaImage { id image { url } } ... on GenericFile { id url } }
    }
  }`, { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", filename }] });
  const file = fc.fileCreate.files[0];
  if (!file?.id) throw new Error("fileCreate returned no file id");

  let url = file.url ?? file.image?.url ?? "";
  for (let i = 0; i < 20 && !url; i += 1) {
    await new Promise((r) => setTimeout(r, 800 + i * 200));
    const polled = await shopifyGraphQL<{ node: { url?: string; image?: { url?: string } } | null }>(creds,
      `query($id: ID!) { node(id: $id) { ... on MediaImage { id image { url } } ... on GenericFile { id url } } }`,
      { id: file.id }).catch(() => ({ node: null }));
    url = polled.node?.url ?? polled.node?.image?.url ?? "";
  }
  if (!url) throw new Error("Shopify never returned a URL for the liquid background image");
  return url;
}

async function getPublishedThemeId(creds: ShopifyCredentials): Promise<number> {
  const data = await shopifyRest<{ themes: Array<{ id: number; role: string; name: string }> }>(
    creds,
    "/themes.json",
    { method: "GET" }
  );
  const main = data.themes.find((t) => t.role === "main");
  if (!main) throw new Error("No published theme");
  return main.id;
}

async function getThemeAsset(creds: ShopifyCredentials, themeId: number, key: string): Promise<string> {
  const data = await shopifyRest<{ asset?: { value?: string } }>(
    creds,
    `/themes/${themeId}/assets.json?asset%5Bkey%5D=${encodeURIComponent(key)}`,
    { method: "GET" }
  );
  return data.asset?.value ?? "";
}

async function putThemeAsset(creds: ShopifyCredentials, themeId: number, key: string, value: string): Promise<void> {
  await shopifyRest(creds, `/themes/${themeId}/assets.json`, {
    method: "PUT",
    body: JSON.stringify({ asset: { key, value } })
  });
  console.log(`[theme] PUT ${key} (${value.length} bytes)`);
}

// ── Image generation fallback ─────────────────────────────────────────────

async function ensureLiquidImage(): Promise<Buffer> {
  if (fs.existsSync(LIQUID_BG_PATH)) {
    console.log(`[bg] using existing image at ${LIQUID_BG_PATH}`);
    return fs.readFileSync(LIQUID_BG_PATH);
  }
  console.log(`[bg] no existing image; generating one via gpt-image-1 (~$0.04)`);
  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt: LIQUID_PROMPT.slice(0, 4000),
    n: 1,
    size: "1536x1024"
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  const buffer = Buffer.from(b64, "base64");
  fs.mkdirSync(BRAND_DIR, { recursive: true });
  fs.writeFileSync(LIQUID_BG_PATH, buffer);
  console.log(`[bg] saved to ${LIQUID_BG_PATH}`);
  return buffer;
}

// ── CSS + theme.liquid templates ──────────────────────────────────────────

function buildLiquidBgCss(imageUrl: string): string {
  return `/* BV Liquid Black background — applied 2026-05-04 by scripts/blackvault-apply-liquid-bg.ts. */
:root, html, body {
  background-color: #0F0E0C;
}
body {
  background-image: url("${imageUrl}");
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
  background-attachment: fixed;
  background-color: #0F0E0C;
}
/* iOS Safari handles fixed backgrounds poorly; fall back to scroll on mobile. */
@media (max-width: 768px) {
  body {
    background-attachment: scroll;
  }
}
/* Make the theme root transparent so the body texture shows through, but keep
   warm-black on solid-color sections so foreground text stays readable. */
.theme--root, [data-theme-root] {
  background-color: transparent;
}
`;
}

const LIQUID_BG_LINK_TAG = `  <link rel="stylesheet" href="{{ 'bv-liquid-bg.css' | asset_url }}">`;
const INJECT_MARKER = "{% comment %} BV liquid background injection {% endcomment %}";

function injectLinkIntoThemeLiquid(themeLiquid: string): string {
  if (themeLiquid.includes(INJECT_MARKER)) {
    console.log(`[theme] theme.liquid already contains the BV liquid background link — leaving as-is`);
    return themeLiquid;
  }
  const headClose = themeLiquid.indexOf("</head>");
  if (headClose === -1) {
    throw new Error("theme.liquid has no </head> tag");
  }
  const before = themeLiquid.slice(0, headClose);
  const after = themeLiquid.slice(headClose);
  return `${before}${INJECT_MARKER}\n${LIQUID_BG_LINK_TAG}\n${after}`;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] brand=${BRAND} store=${creds.storeDomain}`);

  const buffer = await ensureLiquidImage();
  console.log(`[bg] image size: ${buffer.length} bytes`);

  console.log(`[bg] uploading to Shopify Files...`);
  const cdnUrl = await uploadToShopifyFiles(creds, `bv-liquid-background-${Date.now()}.png`, buffer);
  console.log(`[bg] uploaded: ${cdnUrl}`);

  const themeId = await getPublishedThemeId(creds);
  console.log(`[theme] working on theme ${themeId}`);

  const css = buildLiquidBgCss(cdnUrl);
  await putThemeAsset(creds, themeId, "assets/bv-liquid-bg.css", css);

  const themeLiquid = await getThemeAsset(creds, themeId, "layout/theme.liquid");
  if (!themeLiquid) throw new Error("Could not fetch layout/theme.liquid");

  const updated = injectLinkIntoThemeLiquid(themeLiquid);
  if (updated !== themeLiquid) {
    await putThemeAsset(creds, themeId, "layout/theme.liquid", updated);
  }

  console.log(`\n✓ Liquid black background applied to ${creds.storeDomain}`);
  console.log(`  CSS file: assets/bv-liquid-bg.css`);
  console.log(`  Background image: ${cdnUrl}`);
  console.log(`\nPreview at https://${creds.storeDomain.replace(".myshopify.com", "")}.myshopify.com/?preview_theme_id=${themeId}`);
  console.log(`(Storefront may need a hard reload to clear cache — Ctrl+Shift+R / Cmd+Shift+R)`);
  console.log(`\nTo swap in a different image, save it to .openclaw/brand/BV Liquid Background.png and re-run this script.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
