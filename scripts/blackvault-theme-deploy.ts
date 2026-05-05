// One-shot deployment of the Black Vault Apparel storefront.
//
// Run with:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-theme-deploy.ts
//
// Does:
//   1. Generates a wide hero image via gpt-image-1 (or reuses a cached one).
//   2. Uploads hero + logo to the Black Vault Shopify store's Files.
//   3. Customizes the published Horizon theme: dark luxury color scheme,
//      Cormorant Garamond headings, restyled homepage template.
//   4. Leaves config/settings_data.json with a `logo` reference that the user
//      can confirm in Customize (the image_picker reference format is finicky;
//      uploading via the API gives a CDN URL that the customizer accepts when
//      pasted, but cleanest is one click in admin).

import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const LOGO_PATH = path.join(BRAND_DIR, "BV Transpo.png");
const HERO_CACHE_PATH = path.join(BRAND_DIR, "hero-final.png");
const HERO_FALLBACK_PATH = path.join(BRAND_DIR, "hero.png");

const HERO_PROMPT = [
  "Editorial fashion product photograph for a premium dark-aesthetic apparel brand.",
  "Centerpiece: a single matte black heavyweight premium cotton t-shirt, neatly folded once, resting at a slight angle on a polished dark walnut wood surface.",
  "The shirt's chest area displays a MONOGRAM combining the letters B and V, printed in tonal warm cream-silver foil. The monogram is a SINGLE INTERLOCKED LETTERFORM, NOT two separate letters: a classical tall serif capital B with a narrow serif capital V LAYERED ON TOP of and OVERLAPPING the B — the V's two diagonal strokes pass through the middle of the B, and the V's pointed apex extends DOWNWARD BELOW the baseline of the B. The B and V are visually fused into one ligature mark. Tall, slim, classical, elegant — like a Cormorant Garamond ligature. Tone-on-tone with the dark fabric, catching the light subtly.",
  "Lighting: soft warm directional key light from upper-left at roughly 45 degrees, gentle fill from below to keep shadow detail; visible cotton weave texture on the fabric; subtle cream highlights along fold edges.",
  "Mood is dark and luxurious but READABLE — NOT crushed black. The shirt and the BV monogram must both be clearly visible against the surface. Overall image around 60–70% dark tones, not 95%. Think Tom Ford eyewear campaign exposure.",
  "Wide cinematic 3:2 composition with intentional negative space on the right side of the frame.",
  "Style references: Saint Laurent menswear lookbook, John Varvatos fall campaign, Brunello Cucinelli editorial.",
  "No model, no other props, no other text or graphics, no extra logos beyond the BV interlocked monogram on the shirt itself."
].join(" ");

async function ensureHeroImage(): Promise<Buffer> {
  // Prefer the text-baked final hero produced by blackvault-hero-text.ts.
  if (fs.existsSync(HERO_CACHE_PATH)) {
    console.log(`[hero] reusing baked hero at ${HERO_CACHE_PATH}`);
    return fs.readFileSync(HERO_CACHE_PATH);
  }
  if (fs.existsSync(HERO_FALLBACK_PATH)) {
    console.log(`[hero] reusing AI hero (no baked text) at ${HERO_FALLBACK_PATH}`);
    return fs.readFileSync(HERO_FALLBACK_PATH);
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  console.log("[hero] generating with gpt-image-1 (1536x1024)…");
  const openai = new OpenAI({ apiKey });
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt: HERO_PROMPT.slice(0, 4000),
    n: 1,
    size: "1536x1024"
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data");
  const buffer = Buffer.from(b64, "base64");
  fs.writeFileSync(HERO_CACHE_PATH, buffer);
  console.log(`[hero] saved to ${HERO_CACHE_PATH} (${buffer.length} bytes)`);
  return buffer;
}

// --- Shopify helpers (this script needs them inline so it can run standalone) ---

async function shopifyRest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit) {
  const response = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": creds.token,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Shopify ${init.method ?? "GET"} ${endpoint} failed (${response.status}): ${raw}`);
  }
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

async function shopifyGraphQL<T>(creds: ShopifyCredentials, query: string, variables: Record<string, unknown>) {
  const response = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  const raw = await response.text();
  const parsed: { data?: T; errors?: unknown } = raw ? JSON.parse(raw) : {};
  if (!response.ok || (parsed.errors && Array.isArray(parsed.errors) && parsed.errors.length > 0)) {
    throw new Error(`Shopify GraphQL failed (${response.status}): ${raw}`);
  }
  return parsed.data as T;
}

async function uploadToShopifyFiles(
  creds: ShopifyCredentials,
  filename: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ url: string; id: string }> {
  // Stage upload
  const stagedQuery = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }`;
  const staged = await shopifyGraphQL<{
    stagedUploadsCreate: {
      stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>;
      userErrors: Array<{ message: string }>;
    };
  }>(creds, stagedQuery, {
    input: [{ filename, mimeType, httpMethod: "POST", resource: "FILE" }]
  });
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("stagedUploadsCreate returned no target");

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) throw new Error(`Staged upload POST failed (${upload.status})`);

  // Register the file
  const fileQuery = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { __typename ... on MediaImage { id image { url } } ... on GenericFile { id url fileStatus } }
        userErrors { message }
      }
    }`;
  const isImage = mimeType.startsWith("image/");
  const fileData = await shopifyGraphQL<{
    fileCreate: {
      files: Array<{ __typename: string; id?: string; url?: string; image?: { url?: string }; fileStatus?: string }>;
      userErrors: Array<{ message: string }>;
    };
  }>(creds, fileQuery, {
    files: [
      {
        originalSource: target.resourceUrl,
        contentType: isImage ? "IMAGE" : "FILE",
        filename
      }
    ]
  });
  const file = fileData.fileCreate.files[0];
  if (!file) throw new Error("fileCreate returned no file");
  const fileId = file.id ?? "";

  // Image files need a brief poll — image.url is null until processing finishes.
  let url = file.url ?? file.image?.url ?? "";
  if (!url && fileId) {
    const node = `
      query node($id: ID!) {
        node(id: $id) {
          ... on MediaImage { id image { url } }
          ... on GenericFile { id url fileStatus }
        }
      }`;
    for (let i = 0; i < 20 && !url; i += 1) {
      await new Promise((r) => setTimeout(r, 750 + i * 250));
      try {
        const polled = await shopifyGraphQL<{ node: { url?: string; image?: { url?: string } } | null }>(creds, node, { id: fileId });
        url = polled.node?.url ?? polled.node?.image?.url ?? "";
      } catch {
        // ignore — keep polling
      }
    }
  }
  if (!url) throw new Error(`Shopify never returned a URL for ${filename}`);
  return { url, id: fileId };
}

// --- Theme customization ----------------------------------------------------

type ThemeAsset = { asset?: { key: string; value?: string; attachment?: string } };

async function getPublishedThemeId(creds: ShopifyCredentials): Promise<number> {
  const data = await shopifyRest<{ themes: Array<{ id: number; role: string; name: string }> }>(
    creds,
    "/themes.json",
    { method: "GET" }
  );
  const main = data.themes.find((t) => t.role === "main");
  if (!main) throw new Error("No published (main) theme found");
  console.log(`[theme] published theme: ${main.name} (id=${main.id})`);
  return main.id;
}

async function getAsset(creds: ShopifyCredentials, themeId: number, key: string): Promise<string> {
  const data = await shopifyRest<ThemeAsset>(
    creds,
    `/themes/${themeId}/assets.json?asset%5Bkey%5D=${encodeURIComponent(key)}`,
    { method: "GET" }
  );
  return data.asset?.value ?? "";
}

async function putAssetValue(creds: ShopifyCredentials, themeId: number, key: string, value: string) {
  await shopifyRest(creds, `/themes/${themeId}/assets.json`, {
    method: "PUT",
    body: JSON.stringify({ asset: { key, value } })
  });
  console.log(`[theme] PUT ${key} (${value.length} bytes)`);
}

// Dark luxury palette — warm-black background with light tan/gold text.
// Reference vibe: Tom Ford menswear, Brunello Cucinelli, Saint Laurent gold-tone.
// Applied to scheme-1 (the inherited default for sections that don't pin one).
const DARK_LUXURY_SCHEME = {
  background: "#0F0E0C", // warm near-black (slightly lifted off pure black)
  foreground_heading: "#D4B896", // warm light tan-gold for headings
  foreground: "#B89B6E", // deeper gold-tan for body copy
  primary: "#D4B896",
  primary_hover: "#E8CFA6",
  border: "#2A2520", // warm dark for dividers
  shadow: "#000000",
  primary_button_background: "#D4B896",
  primary_button_text: "#0F0E0C",
  primary_button_border: "#D4B896",
  primary_button_hover_background: "#E8CFA6",
  primary_button_hover_text: "#0F0E0C",
  primary_button_hover_border: "#E8CFA6",
  secondary_button_background: "rgba(0,0,0,0)",
  secondary_button_text: "#D4B896",
  secondary_button_border: "#D4B896",
  secondary_button_hover_background: "#1F1B16",
  secondary_button_hover_text: "#E8CFA6",
  secondary_button_hover_border: "#E8CFA6",
  input_background: "rgba(212,184,150,0.04)",
  input_text_color: "#D4B896",
  input_border_color: "#2A2520",
  input_hover_background: "rgba(212,184,150,0.08)",
  variant_background_color: "#0F0E0C",
  variant_text_color: "#D4B896",
  variant_border_color: "#2A2520",
  variant_hover_background_color: "#1F1B16",
  variant_hover_text_color: "#E8CFA6",
  variant_hover_border_color: "#3A3328",
  selected_variant_background_color: "#D4B896",
  selected_variant_text_color: "#0F0E0C",
  selected_variant_border_color: "#D4B896",
  selected_variant_hover_background_color: "#E8CFA6",
  selected_variant_hover_text_color: "#0F0E0C",
  selected_variant_hover_border_color: "#E8CFA6"
};

function customizeSettingsData(current: Record<string, unknown>, _logoUrl: string | null) {
  const out = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
  const cur = (out.current ?? {}) as Record<string, unknown>;

  // Push h1 size up for editorial feel; tighten letter-spacing on display sizes.
  // (Skipping font_picker overrides — Shopify font handles are version-specific
  // and rejecting on validate; Inter throughout reads clean-luxury and the
  // user can swap to Cormorant in Customize → Theme settings → Typography.)
  cur.type_size_h1 = "72";
  cur.type_size_h2 = "56";
  cur.type_letter_spacing_h1 = "heading-tight";
  cur.type_letter_spacing_h2 = "heading-tight";

  // Apply the dark scheme to scheme-1 (the inherited default everywhere a
  // section doesn't pin its own scheme).
  const schemes = (cur.color_schemes ?? {}) as Record<string, { settings?: Record<string, string> }>;
  if (schemes["scheme-1"]) {
    schemes["scheme-1"].settings = { ...DARK_LUXURY_SCHEME };
  }

  // Logo isn't set here — image_picker rejects raw CDN URLs. The image is
  // already in Files; the user picks it in Customize → Theme settings → Logo.

  out.current = cur;
  return out;
}

function buildHomepageTemplate(heroUrl: string): Record<string, unknown> {
  // Minimal premium homepage:
  //   1. Hero — full-width, dark, hero image as background, brand wordmark overlay
  //   2. Brand statement — short paragraph, centered, generous padding
  //   3. Featured collection — placeholder; the store has no products yet
  //   4. About teaser — short "what we make" section
  // Section IDs are arbitrary but must be unique within this template.
  return {
    sections: {
      hero_main: {
        type: "hero",
        blocks: {
          // Eyebrow + headline are baked into the hero image directly (see
          // scripts/blackvault-hero-text.ts). Only the CTA is a live block so
          // it remains clickable.
          shop_cta: {
            type: "button",
            name: "t:names.button",
            settings: {
              label: "Shop the collection",
              link: "shopify://collections/all",
              open_in_new_tab: false,
              style_class: "button-primary",
              width: "fit-content",
              custom_width: 100,
              width_mobile: "fit-content",
              custom_width_mobile: 100
            },
            blocks: {}
          }
        },
        block_order: ["shop_cta"],
        name: "t:names.hero",
        settings: {
          media_type_1: "image",
          // image_1 omitted — image_picker rejects raw CDN URLs at validation.
          // The hero image is uploaded to Files (blackvault-hero.png); the user
          // picks it in Customize → Hero section → Media.
          media_type_2: "image",
          stack_media_on_mobile: false,
          custom_mobile_media: false,
          media_type_1_mobile: "image",
          media_type_2_mobile: "image",
          open_in_new_tab: false,
          content_direction: "column",
          vertical_on_mobile: true,
          horizontal_alignment: "center",
          vertical_alignment: "center",
          align_baseline: true,
          horizontal_alignment_flex_direction_column: "center",
          vertical_alignment_flex_direction_column: "flex-end",
          gap: 20,
          section_width: "full-width",
          section_height: "large",
          section_height_custom: 100,
          color_scheme: "scheme-1",
          // No darkening overlay — the hero image is already dark; an opaque
          // black overlay was hiding the image entirely.
          toggle_overlay: false,
          overlay_color: "#0F0E0C",
          overlay_style: "solid",
          gradient_direction: "to bottom",
          blurred_reflection: false,
          reflection_opacity: 0,
          "padding-block-start": 0,
          "padding-block-end": 80,
          // Asymmetric inline padding pushes the centered column-stack into the
          // right zone (matches the baked text on the hero image).
          "padding-inline-start": 800,
          "padding-inline-end": 96
        }
      },
      brand_statement: {
        type: "section",
        blocks: {
          heading: {
            type: "text",
            name: "t:names.heading",
            settings: {
              text: "<p>Built to be kept.</p>",
              type_preset: "h2",
              alignment: "center",
              max_width: "narrow",
              color: "#D4B896"
            },
            blocks: {}
          },
          body: {
            type: "text",
            name: "t:names.text",
            settings: {
              text: "<p>Heavyweight cotton. Considered cuts. Restrained design. Black Vault is built on a simple idea — that the pieces you reach for first should be the ones made to last longest.</p>",
              type_preset: "paragraph",
              alignment: "center",
              max_width: "narrow",
              color: "#B89B6E"
            },
            blocks: {}
          }
        },
        block_order: ["heading", "body"],
        name: "t:names.section",
        settings: {
          content_direction: "column",
          vertical_on_mobile: true,
          horizontal_alignment: "center",
          vertical_alignment: "center",
          horizontal_alignment_flex_direction_column: "center",
          vertical_alignment_flex_direction_column: "center",
          gap: 24,
          section_width: "page-width",
          color_scheme: "scheme-1",
          "padding-block-start": 100,
          "padding-block-end": 100
        }
      },
      featured_collection: {
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
                  text: "<p>The Collection</p>",
                  type_preset: "h2",
                  alignment: "center",
                  color: "#D4B896"
                },
                blocks: {}
              }
            },
            block_order: ["heading"]
          }
        },
        block_order: [],
        name: "t:names.featured_collection",
        settings: {
          collection: "all",
          products_to_show: 8,
          columns_desktop: 4,
          columns_mobile: "2",
          section_width: "page-width",
          color_scheme: "scheme-1",
          "padding-block-start": 80,
          "padding-block-end": 100
        }
      },
      about: {
        type: "section",
        blocks: {
          eyebrow: {
            type: "text",
            name: "t:names.heading",
            settings: {
              text: "<p>The Vault</p>",
              type_preset: "h6",
              alignment: "center",
              max_width: "narrow",
              letter_spacing: "0.2em",
              case: "uppercase",
              color: "#8A7548"
            },
            blocks: {}
          },
          body: {
            type: "text",
            name: "t:names.text",
            settings: {
              text: "<p>Every piece in the vault earns its place — selected for material, construction, and the kind of quiet confidence that doesn't go out of style. Made for the wardrobe you actually wear.</p>",
              type_preset: "paragraph",
              alignment: "center",
              max_width: "narrow",
              color: "#B89B6E"
            },
            blocks: {}
          }
        },
        block_order: ["eyebrow", "body"],
        name: "t:names.section",
        settings: {
          content_direction: "column",
          vertical_on_mobile: true,
          horizontal_alignment: "center",
          vertical_alignment: "center",
          horizontal_alignment_flex_direction_column: "center",
          vertical_alignment_flex_direction_column: "center",
          gap: 16,
          section_width: "page-width",
          color_scheme: "scheme-1",
          "padding-block-start": 100,
          "padding-block-end": 100
        }
      }
    },
    order: ["hero_main", "brand_statement", "featured_collection", "about"]
  };
}

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] brand=${creds.brandSlug} store=${creds.storeDomain}`);

  if (!fs.existsSync(LOGO_PATH)) {
    throw new Error(`Logo not found at ${LOGO_PATH}`);
  }

  const themeId = await getPublishedThemeId(creds);

  // 1. Generate (or reuse) hero image
  const heroBuffer = await ensureHeroImage();

  // 2. Upload assets to Shopify Files
  console.log("[upload] hero…");
  const hero = await uploadToShopifyFiles(creds, "blackvault-hero.png", "image/png", heroBuffer);
  console.log(`[upload] hero → ${hero.url}`);

  console.log("[upload] logo…");
  const logoBuffer = fs.readFileSync(LOGO_PATH);
  const logo = await uploadToShopifyFiles(creds, "blackvault-logo.png", "image/png", logoBuffer);
  console.log(`[upload] logo → ${logo.url}`);

  // 3. Patch settings_data.json
  console.log("[settings] reading current settings_data.json…");
  const currentSettings = JSON.parse(await getAsset(creds, themeId, "config/settings_data.json"));
  const newSettings = customizeSettingsData(currentSettings, logo.url);
  fs.writeFileSync(".openclaw/theme-recon/settings_data.new.json", JSON.stringify(newSettings, null, 2));
  await putAssetValue(creds, themeId, "config/settings_data.json", JSON.stringify(newSettings, null, 2));

  // 4. Replace homepage template
  console.log("[template] writing templates/index.json…");
  const homepage = buildHomepageTemplate(hero.url);
  fs.writeFileSync(".openclaw/theme-recon/index.new.json", JSON.stringify(homepage, null, 2));
  await putAssetValue(creds, themeId, "templates/index.json", JSON.stringify(homepage, null, 2));

  console.log("\n✓ Done.");
  console.log(`Visit your store: https://${creds.storeDomain}`);
  console.log(`Customize: https://${creds.storeDomain}/admin/themes/${themeId}/editor`);
  console.log("\nIf the logo isn't showing in the header, open Customize → Theme settings → Logo and pick blackvault-logo.png from your Files.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
