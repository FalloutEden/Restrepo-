import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import sharp from "sharp";
import {
  searchAndDetailCjProducts,
  findCjCategoryIds,
  getCjProductDetail,
  cleanCjDescription,
  type CjProductDetail
} from "@/lib/cj-service";
import { generateProductImage } from "@/lib/image-generation";
import { resolveBrand, type Brand } from "@/lib/brands";
import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";
import { resolvePrintfulCredentials } from "@/lib/printful-credentials";
import { rewriteProductDescription } from "@/lib/copywriting";
import { attachProductToOnlineStore } from "@/lib/shopify-service";
import type { TenantContext } from "@/lib/tenant-context";

export type FulfillmentType = "printful" | "zendrop" | "digital";

export type MaterializedProduct = {
  opportunityId: string;
  title: string;
  description: string;
  productType: string;
  fulfillmentType: FulfillmentType;
  status: "created" | "failed";
  shopifyProductId?: number;
  shopifyProductHandle?: string;
  shopifyProductUrl?: string;
  shopifyFileUrl?: string;
  shopifyImageUrl?: string;
  printfulSyncProductId?: number;
  printfulVariantId?: number;
  zendropProductId?: string;
  zendropProductUrl?: string;
  zendropImages?: string[];
  zendropPrice?: number;
  zendropCurrency?: string;
  localArtifactPath?: string;
  imagePrompt?: string;
  error?: string;
  /** Non-fatal advisories surfaced to the merchant (e.g. low-DPI print file). */
  warnings?: string[];
};

export type MaterializationInput = {
  runtimeId: string;
  title: string;
  description: string;
  productType: string;
  fulfillmentType: FulfillmentType;
  niche?: string;
  keywords?: string[];
  imagePrompt?: string;
  buildSummary?: string;
  // Optional: pin a specific CJ product id (or other supplier id) instead of
  // letting the dropship path re-search the catalog. Without this, the path
  // searches by niche → category → first-usable-result, which means calling
  // materializeProduct N times in a row would return the same product N times.
  sourceProductId?: string;
  // Brand slug from lib/brands.ts ("locklayer" | "black-vault-apparel"). Drives
  // copywriting voice and (eventually) which Shopify storefront receives the
  // listing. Defaults to "locklayer" when unset.
  brand?: string;
  // Merchant-supplied print-ready artwork (transparent PNG) for the Printful
  // auto-build path. When set, this image is used as the print file instead of
  // AI-generating one — tenants always supply their own art (no gpt-image-1 for
  // catalog), and we run a DPI/size check on it and warn if it's too low-res.
  printFileUrl?: string;
};

type ShopifyProductResponse = {
  product?: {
    id: number;
    handle?: string;
    admin_graphql_api_id?: string;
    variants?: Array<{
      id: number;
      title?: string;
      option1?: string;
      option2?: string;
      option3?: string;
      sku?: string;
    }>;
  };
};

type PrintfulVariantSpec = {
  variantId: number;
  size: string;
  color: string;
};

type ShopifyProductImageResponse = {
  image?: {
    id: number;
    src?: string;
  };
};

const MATERIALIZED_OUTPUT_DIR = path.join(process.cwd(), ".openclaw", "materialized-products");

// Brand → Shopify storefront routing. Apparel (Printful) ships under Black Vault
// Apparel; everything else (CJ-dropshipped tech, digital downloads) ships under
// LockLayer Security.
function defaultBrandForFulfillment(fulfillment: FulfillmentType): string {
  return fulfillment === "printful" ? "black-vault-apparel" : "locklayer";
}

function normalizeMaterializationKey(value: string) {
  return value.toLowerCase().replace(/[\s-]+/g, "_").trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderDescriptionHtml(description: string) {
  return escapeHtml(description).replace(/\r?\n/g, "<br />");
}

// Resolve the Printful blank for auto-build. Founder: env (token/store/variant).
// Tenant: token + storeId from the encrypted vault, plus their chosen default
// blank variant id (printfulDefaultVariantId). Returns null when anything is
// missing so the caller can degrade gracefully instead of throwing.
function loadPrintfulConfig(tenantCtx?: TenantContext): { token: string; storeId: string; variantId: number } | null {
  try {
    const creds = resolvePrintfulCredentials(tenantCtx);
    let variantId = creds.defaultVariantId;
    if (variantId == null) {
      // Tenant default blank (founder falls back to env via the credential resolver).
      const raw = tenantCtx?.getSecret("printfulDefaultVariantId");
      if (raw && Number.isFinite(Number(raw))) variantId = Number(raw);
    }
    if (variantId == null || !Number.isFinite(variantId) || variantId <= 0) return null;
    return { token: creds.token, storeId: creds.storeId, variantId };
  } catch {
    return null;
  }
}

function getDefaultRetailPrice(tenantCtx?: TenantContext): string {
  const tenantPrice = tenantCtx && !tenantCtx.isFounder ? tenantCtx.getSecret("printfulRetailPrice") : null;
  const raw =
    tenantPrice?.trim() ||
    process.env.PRINTFUL_RETAIL_PRICE?.trim() ||
    process.env.DEFAULT_RETAIL_PRICE?.trim() ||
    "34.99";
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(2) : "34.99";
}

// Download a merchant-supplied print file and check it's high enough resolution
// for crisp DTG. Returns the buffer + non-fatal warnings (we warn, never block).
async function fetchPrintFileBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not download print file (${r.status}) from ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function checkPrintFileQuality(buffer: Buffer): Promise<string[]> {
  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const longEdge = Math.max(w, h);
    const warnings: string[] = [];
    // ~150 DPI across a standard ~12in front print ≈ 1800px on the long edge.
    if (longEdge < 1800) {
      warnings.push(
        `Print file is ${w}×${h}px — below the ~1800px (≈150 DPI for a 12in print) recommended for crisp DTG output. It will still upload, but may look soft on the garment. Re-upload at higher resolution for best quality.`
      );
    }
    if (meta.format !== "png") {
      warnings.push(
        `Print file is ${meta.format ?? "unknown"} format — a transparent PNG is strongly recommended so the garment color shows through the design.`
      );
    } else if (!meta.hasAlpha) {
      warnings.push(
        "Print file has no transparency — the design's background will print as a solid block on the garment. Use a PNG with a transparent background."
      );
    }
    return warnings;
  } catch {
    return ["Could not read the print file to verify its resolution — make sure it's a valid PNG."];
  }
}

// Convert upstream design direction (often phrased as "premium product photo of a t-shirt
// with X graphic...") into a print-artwork-only prompt. Printful prints whatever PNG we
// hand it onto a real shirt — so the PNG must be the *design alone*, not a photo of a
// finished product.
function buildPrintArtworkPrompt(input: MaterializationInput): string {
  const direction = input.imagePrompt?.trim();
  const themeLine = direction
    ? `Theme and style direction: ${direction}`
    : `Theme: ${input.title}. ${input.description}`;
  return [
    `Print-on-demand apparel artwork. Bold, high-contrast graphic design intended to be printed directly onto a t-shirt or hoodie.`,
    themeLine,
    `Output requirements: flat 2D artwork only — the design itself, centered on a fully transparent background. Do NOT depict a t-shirt, hoodie, garment, mockup, hanger, mannequin, or any product photography. No shadows, no studio lighting, no fabric texture, no folds. The image must be ready to drop straight onto a blank shirt as a print file.`,
    `Composition: design fills roughly the central 70% of the canvas, with clear empty (transparent) margins. Crisp clean lines, suitable for screen printing or DTG. Limited color palette unless the theme requires otherwise. No watermarks, no signatures, no extra text outside what the design itself calls for.`
  ].join(" ");
}

function resolveFulfillmentType(input: MaterializationInput): FulfillmentType {
  const normalizedFulfillment = normalizeMaterializationKey(input.fulfillmentType);
  const normalizedProductType = normalizeMaterializationKey(input.productType);

  if (normalizedFulfillment === "printful" || normalizedProductType === "print_on_demand" || normalizedProductType === "printful") {
    return "printful";
  }

  if (normalizedFulfillment === "zendrop" || normalizedProductType === "dropshipping" || normalizedProductType === "zendrop") {
    return "zendrop";
  }

  return "digital";
}

async function shopifyRest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit) {
  const response = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": creds.token,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  const rawBody = await response.text();
  const data = rawBody ? (JSON.parse(rawBody) as T) : ({} as T);

  if (!response.ok) {
    throw new Error(`Shopify request failed (${response.status}): ${rawBody}`);
  }

  return data;
}

async function shopifyGraphQL<T>(creds: ShopifyCredentials, query: string, variables: Record<string, unknown>) {
  const response = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": creds.token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      variables
    })
  });

  const rawBody = await response.text();
  const parsed: { data?: T; errors?: unknown } = rawBody ? JSON.parse(rawBody) : {};

  // Shopify can return errors as an array, a single object, or a string. Normalize all shapes.
  const errors = parsed.errors;
  const errorMessages: string[] = Array.isArray(errors)
    ? errors.map((e) => (typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : JSON.stringify(e)))
    : errors && typeof errors === "object"
      ? [("message" in (errors as Record<string, unknown>) ? String((errors as { message: unknown }).message) : JSON.stringify(errors))]
      : typeof errors === "string"
        ? [errors]
        : [];

  if (!response.ok || errorMessages.length > 0) {
    const message = errorMessages.length > 0 ? errorMessages.join(" | ") : rawBody;
    throw new Error(`Shopify GraphQL request failed (${response.status}): ${message}`);
  }

  return parsed.data as T;
}

async function createShopifyDraftProduct(
  creds: ShopifyCredentials,
  input: MaterializationInput,
  bodyHtml: string,
  options: {
    retailPrice?: string;
    extraTags?: string[];
    sizes?: string[]; // e.g. ["S","M","L","XL","2XL"] — produces a Size option with one variant per size
  } = {}
) {
  const retailPrice = options.retailPrice ?? getDefaultRetailPrice();
  const tags = [
    "agent-materialized",
    `fulfillment:${input.fulfillmentType}`,
    `brand:${creds.brandSlug}`,
    ...(options.extraTags ?? [])
  ];

  const sizes = options.sizes && options.sizes.length > 0 ? options.sizes : null;
  const productPayload: Record<string, unknown> = {
    title: input.title,
    body_html: bodyHtml,
    vendor: creds.brandName,
    product_type: input.productType,
    status: "draft",
    tags
  };
  if (sizes) {
    productPayload.options = [{ name: "Size", values: sizes }];
    productPayload.variants = sizes.map((size) => ({
      option1: size,
      price: retailPrice,
      sku: `${slugify(input.title)}-${size}`.toUpperCase()
    }));
  } else {
    productPayload.variants = [{ price: retailPrice }];
  }

  const payload = await shopifyRest<ShopifyProductResponse>(creds, "/products.json", {
    method: "POST",
    body: JSON.stringify({ product: productPayload })
  });

  if (!payload.product?.id) {
    throw new Error(`Shopify did not return a product id for "${input.title}".`);
  }

  // Pre-attach to Online Store publication while still a draft. With the
  // write_publications scope, drafts can be attached via GraphQL — meaning
  // flipping the draft to active later (via admin or our publish path)
  // lands it on the storefront with no extra step.
  try {
    await attachProductToOnlineStore(payload.product.id, creds.brandSlug);
  } catch (e) {
    console.warn(`[materialize] attachProductToOnlineStore failed for ${payload.product.id}: ${e instanceof Error ? e.message : e}`);
  }

  return payload.product;
}

async function attachShopifyProductImage(creds: ShopifyCredentials, productId: number, title: string, imageBase64: string) {
  const payload = await shopifyRest<ShopifyProductImageResponse>(creds, `/products/${productId}/images.json`, {
    method: "POST",
    body: JSON.stringify({
      image: {
        attachment: imageBase64,
        filename: `${slugify(title)}.png`,
        alt: title
      }
    })
  });

  return payload.image ?? null;
}

async function attachShopifyProductImageFromUrl(creds: ShopifyCredentials, productId: number, title: string, imageUrl: string) {
  const payload = await shopifyRest<ShopifyProductImageResponse>(creds, `/products/${productId}/images.json`, {
    method: "POST",
    body: JSON.stringify({
      image: {
        src: imageUrl,
        alt: title
      }
    })
  });

  return payload.image ?? null;
}

async function uploadBufferToShopifyFiles(creds: ShopifyCredentials, filename: string, mimeType: string, buffer: Buffer) {
  const stagedUploadsCreate = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const stagedData = await shopifyGraphQL<{
    stagedUploadsCreate: {
      stagedTargets: Array<{
        url: string;
        resourceUrl: string;
        parameters: Array<{ name: string; value: string }>;
      }>;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(creds, stagedUploadsCreate, {
    input: [
      {
        filename,
        mimeType,
        httpMethod: "POST",
        resource: "FILE"
      }
    ]
  });

  const target = stagedData.stagedUploadsCreate.stagedTargets[0];
  const userError = stagedData.stagedUploadsCreate.userErrors[0];

  if (userError) {
    throw new Error(`Shopify staged upload failed: ${userError.message}`);
  }

  if (!target) {
    throw new Error("Shopify did not return a staged upload target.");
  }

  const formData = new FormData();
  target.parameters.forEach((parameter) => {
    formData.append(parameter.name, parameter.value);
  });
  formData.append("file", new Blob([buffer], { type: mimeType }), filename);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: formData
  });

  if (!uploadResponse.ok) {
    throw new Error(`Shopify staged file upload failed (${uploadResponse.status}).`);
  }

  const fileCreate = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          __typename
          ... on GenericFile {
            id
            url
            fileStatus
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const fileData = await shopifyGraphQL<{
    fileCreate: {
      files: Array<{
        __typename: string;
        id?: string;
        url?: string;
        fileStatus?: string;
      }>;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(creds, fileCreate, {
    files: [
      {
        originalSource: target.resourceUrl,
        contentType: "FILE",
        filename
      }
    ]
  });

  const fileError = fileData.fileCreate.userErrors[0];
  if (fileError) {
    throw new Error(`Shopify file creation failed: ${fileError.message}`);
  }

  const file = fileData.fileCreate.files[0];
  if (!file?.id) {
    throw new Error("Shopify fileCreate did not return a file id.");
  }

  // Shopify file processing is asynchronous: fileCreate returns immediately with
  // fileStatus=UPLOADED and url=null. The url only becomes available after the
  // file moves to READY state. Poll the file node briefly to pick up the URL.
  if (file.url) {
    return file;
  }

  const fileQuery = `
    query fileNode($id: ID!) {
      node(id: $id) {
        ... on GenericFile { id url fileStatus }
        ... on MediaImage { id image { url } }
      }
    }
  `;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500 + attempt * 250));
    try {
      const polled = await shopifyGraphQL<{ node: { id?: string; url?: string; image?: { url?: string }; fileStatus?: string } | null }>(creds, fileQuery, { id: file.id });
      const url = polled.node?.url ?? polled.node?.image?.url;
      if (url) {
        return { ...file, url };
      }
    } catch {
      // ignore and retry
    }
  }

  // Fall back to id-only — the caller will see no URL but the file exists in Shopify.
  return { ...file, url: file.url ?? "" };
}

// --- Printful catalog lookups ---------------------------------------------
// Used to expand a single base variant (e.g. "Bella+Canvas 3001 Black M") into
// the full sibling size run for the same product/color, and to discover the
// catalog product ID we need for the mockup generator.

type PrintfulCatalogVariant = {
  id: number;
  product_id: number;
  size: string;
  color: string;
  in_stock?: boolean;
  availability_status?: string;
};

async function fetchPrintfulVariantInfo(token: string, variantId: number): Promise<PrintfulCatalogVariant | null> {
  const response = await fetch(`https://api.printful.com/products/variant/${variantId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    console.warn(`[materialize] Printful variant lookup failed (${response.status}) for variantId=${variantId}`);
    return null;
  }
  const data = (await response.json()) as { result?: { variant?: PrintfulCatalogVariant } };
  return data.result?.variant ?? null;
}

async function fetchPrintfulProductCatalog(token: string, productId: number): Promise<PrintfulCatalogVariant[]> {
  const response = await fetch(`https://api.printful.com/products/${productId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    console.warn(`[materialize] Printful product catalog lookup failed (${response.status}) for productId=${productId}`);
    return [];
  }
  const data = (await response.json()) as { result?: { variants?: PrintfulCatalogVariant[] } };
  return data.result?.variants ?? [];
}

const TARGET_SIZE_RUN = ["S", "M", "L", "XL", "2XL"];

// Given a base variant id, find sibling variants for the same product+color across the target size run.
// Returns the base variant alone if catalog lookup fails.
async function expandPrintfulSizeVariants(token: string, baseVariantId: number): Promise<{
  productId: number | null;
  variants: PrintfulVariantSpec[];
}> {
  const base = await fetchPrintfulVariantInfo(token, baseVariantId);
  if (!base) {
    return { productId: null, variants: [{ variantId: baseVariantId, size: "M", color: "Default" }] };
  }
  const all = await fetchPrintfulProductCatalog(token, base.product_id);
  const sameColor = all.filter((v) =>
    v.color === base.color &&
    TARGET_SIZE_RUN.includes(v.size)
  );
  if (sameColor.length === 0) {
    return {
      productId: base.product_id,
      variants: [{ variantId: base.id, size: base.size, color: base.color }]
    };
  }
  // Order variants according to TARGET_SIZE_RUN so Shopify shows S → 2XL.
  sameColor.sort((a, b) => TARGET_SIZE_RUN.indexOf(a.size) - TARGET_SIZE_RUN.indexOf(b.size));
  return {
    productId: base.product_id,
    variants: sameColor.map((v) => ({ variantId: v.id, size: v.size, color: v.color }))
  };
}

// --- Printful mockup generator --------------------------------------------
// Submit a print file + variant ids, poll for completion, return mockup image URLs.
// Used to replace the raw AI artwork on the Shopify listing with real product photos.

// Look up the front-placement printfile dimensions for a product. Printful needs
// these as area_width / area_height when submitting a mockup task.
async function fetchPrintfulFrontPrintfile(
  token: string,
  storeId: string,
  productId: number
): Promise<{ width: number; height: number } | null> {
  const response = await fetch(`https://api.printful.com/mockup-generator/printfiles/${productId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-PF-Store-Id": storeId
    }
  });
  if (!response.ok) {
    console.warn(`[materialize] Printfile lookup failed (${response.status}) for productId=${productId}`);
    return null;
  }
  const data = (await response.json()) as {
    result?: {
      printfiles?: Array<{ printfile_id: number; width: number; height: number }>;
      variant_printfiles?: Array<{ variant_id: number; placements: Record<string, number> }>;
    };
  };
  const variantPrintfile = data.result?.variant_printfiles?.[0];
  const frontPrintfileId = variantPrintfile?.placements?.front;
  if (!frontPrintfileId) {
    return null;
  }
  const printfile = data.result?.printfiles?.find((p) => p.printfile_id === frontPrintfileId);
  if (!printfile) {
    return null;
  }
  return { width: printfile.width, height: printfile.height };
}

async function createPrintfulMockupTask(
  token: string,
  storeId: string,
  productId: number,
  variantIds: number[],
  printFileUrl: string
): Promise<string | null> {
  // Look up print area dimensions so we can submit a properly-positioned design.
  // Falls back to standard 1800x2400 (12"x16" at 150 DPI) if lookup fails.
  const printfile = await fetchPrintfulFrontPrintfile(token, storeId, productId);
  const areaWidth = printfile?.width ?? 1800;
  const areaHeight = printfile?.height ?? 2400;
  // Center a square design that fills the width, with ~10% top margin so it sits near the chest.
  const designSize = areaWidth;
  const topOffset = Math.round(areaHeight * 0.1);

  const response = await fetch(`https://api.printful.com/mockup-generator/create-task/${productId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-PF-Store-Id": storeId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      variant_ids: variantIds,
      format: "jpg",
      files: [
        {
          placement: "front",
          image_url: printFileUrl,
          position: {
            area_width: areaWidth,
            area_height: areaHeight,
            width: designSize,
            height: designSize,
            top: topOffset,
            left: 0
          }
        }
      ]
    })
  });
  const rawBody = await response.text();
  if (!response.ok) {
    console.warn(`[materialize] Mockup task creation failed (${response.status}): ${rawBody}`);
    return null;
  }
  const data = rawBody ? (JSON.parse(rawBody) as { result?: { task_key?: string } }) : {};
  return data.result?.task_key ?? null;
}

async function pollPrintfulMockupTask(
  token: string,
  storeId: string,
  taskKey: string,
  options: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<string[]> {
  const maxAttempts = options.maxAttempts ?? 30;
  const intervalMs = options.intervalMs ?? 3000;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const response = await fetch(`https://api.printful.com/mockup-generator/task?task_key=${taskKey}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-PF-Store-Id": storeId
      }
    });
    if (!response.ok) {
      continue;
    }
    const data = (await response.json()) as {
      result?: {
        status?: string;
        mockups?: Array<{ mockup_url?: string }>;
        error?: string;
      };
    };
    const status = data.result?.status;
    if (status === "completed") {
      const urls = (data.result?.mockups ?? [])
        .map((m) => m.mockup_url)
        .filter((u): u is string => typeof u === "string" && u.length > 0);
      // De-duplicate (some mockups repeat across variants of the same color).
      return Array.from(new Set(urls));
    }
    if (status === "failed") {
      console.warn(`[materialize] Mockup task ${taskKey} failed: ${data.result?.error ?? "unknown"}`);
      return [];
    }
  }
  console.warn(`[materialize] Mockup task ${taskKey} timed out after ${maxAttempts * intervalMs}ms`);
  return [];
}

async function createPrintfulSyncProduct(
  input: MaterializationInput,
  printFileUrl: string,
  variantSpecs: PrintfulVariantSpec[],
  shopifyVariantIds: number[],
  tenantCtx?: TenantContext
) {
  const printful = loadPrintfulConfig(tenantCtx);
  if (!printful) {
    return null;
  }
  const retailPrice = getDefaultRetailPrice(tenantCtx);

  // Pair each Printful variant with its Shopify counterpart (same index = same size).
  // shopifyVariantIds may be empty if Shopify draft creation hadn't yet wired multi-variant.
  // In that case, fall back to a single variant tagged with runtimeId.
  const syncVariants = variantSpecs.map((spec, idx) => {
    const shopifyVariantId = shopifyVariantIds[idx];
    return {
      external_id: shopifyVariantId ? String(shopifyVariantId) : `${input.runtimeId}_${spec.size}`,
      variant_id: spec.variantId,
      retail_price: retailPrice,
      files: [
        {
          type: "default",
          url: printFileUrl
        }
      ]
    };
  });

  const response = await fetch("https://api.printful.com/store/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${printful.token}`,
      "X-PF-Store-Id": printful.storeId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sync_product: {
        external_id: input.runtimeId,
        name: input.title,
        thumbnail: printFileUrl
      },
      sync_variants: syncVariants
    })
  });

  const rawBody = await response.text();
  const payload = rawBody ? (JSON.parse(rawBody) as { result?: { id?: number } }) : {};

  if (!response.ok || !payload.result?.id) {
    // Printful failed — log and continue. We still want the Shopify draft live.
    console.warn(`[materialize] Printful sync product creation failed (${response.status}): ${rawBody}`);
    return null;
  }

  return {
    syncProductId: payload.result.id,
    variantId: variantSpecs[0]?.variantId ?? printful.variantId,
    syncedSizeCount: syncVariants.length
  };
}


async function createPdfBuffer(title: string, description: string) {
  const pdf = new jsPDF({
    unit: "pt",
    format: "letter"
  });

  pdf.setFontSize(18);
  pdf.text(title, 40, 50);
  pdf.setFontSize(11);
  const lines = pdf.splitTextToSize(description, 520);
  pdf.text(lines, 40, 90);

  return Buffer.from(pdf.output("arraybuffer"));
}

async function createSpreadsheetBuffer(title: string, description: string) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Product");
  worksheet.getCell("A1").value = title;
  worksheet.getCell("A2").value = "Description";
  worksheet.getCell("B2").value = description;
  worksheet.getCell("A4").value = "Section";
  worksheet.getCell("B4").value = "Notes";
  worksheet.getCell("A5").value = "Overview";
  worksheet.getCell("B5").value = "Customize this workbook with formulas, tabs, and buyer-facing instructions.";
  worksheet.columns = [{ width: 24 }, { width: 88 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Best-effort local copy for debugging/inspection. The Shopify Files upload is
// the real delivery, so a failure here (e.g. read-only FS on Vercel) must not
// break materialization — return null and carry on.
async function writeLocalArtifact(filename: string, buffer: Buffer): Promise<string | null> {
  try {
    await mkdir(MATERIALIZED_OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(MATERIALIZED_OUTPUT_DIR, filename);
    await writeFile(outputPath, buffer);
    return outputPath;
  } catch {
    return null;
  }
}

async function materializeDigitalProduct(input: MaterializationInput, tenantCtx?: TenantContext): Promise<MaterializedProduct> {
  const creds = resolveShopifyCredentials(input.brand, tenantCtx);
  const slug = slugify(input.title || input.runtimeId);
  const isSpreadsheet = /spreadsheet|workbook|excel|tracker|dashboard/i.test(input.productType);
  const filename = `${slug}.${isSpreadsheet ? "xlsx" : "pdf"}`;
  const mimeType = isSpreadsheet
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "application/pdf";
  const buffer = isSpreadsheet
    ? await createSpreadsheetBuffer(input.title, input.description)
    : await createPdfBuffer(input.title, input.description);
  const localArtifactPath = await writeLocalArtifact(filename, buffer);
  const file = await uploadBufferToShopifyFiles(creds, filename, mimeType, buffer);
  const bodyHtml = [
    renderDescriptionHtml(input.description),
    `<br /><br /><strong>Digital delivery file:</strong> <a href="${file.url}">${filename}</a>`
  ].join("");
  const product = await createShopifyDraftProduct(creds, input, bodyHtml);

  return {
    opportunityId: input.runtimeId,
    title: input.title,
    description: input.description,
    productType: input.productType,
    fulfillmentType: "digital",
    status: "created",
    localArtifactPath: localArtifactPath ?? undefined,
    shopifyFileUrl: file.url,
    shopifyProductId: product.id,
    shopifyProductHandle: product.handle,
    shopifyProductUrl: `https://${creds.storeDomain}/admin/products/${product.id}`
  };
}

async function materializePrintfulProduct(input: MaterializationInput, tenantCtx?: TenantContext): Promise<MaterializedProduct> {
  const creds = resolveShopifyCredentials(input.brand, tenantCtx);
  const printfulConfig = loadPrintfulConfig(tenantCtx);
  const printfulConfigured = !!printfulConfig;
  const imagePrompt = buildPrintArtworkPrompt(input);
  const isTenant = !!tenantCtx && !tenantCtx.isFounder;
  const warnings: string[] = [];

  // Acquire the print artwork. Two flows (the operator picks with the merchant):
  // AUTO with a merchant-supplied print-ready PNG (the tenant path — never
  // AI-generated, to avoid gpt-image-1 catalog slop), or the founder/BV path
  // which may AI-generate. A tenant with no uploaded image is told to upload one
  // (or use the mirror flow) instead of getting AI slop.
  let artworkBuffer: Buffer;
  let artworkBase64: string;
  if (input.printFileUrl) {
    artworkBuffer = await fetchPrintFileBuffer(input.printFileUrl);
    artworkBase64 = artworkBuffer.toString("base64");
    warnings.push(...(await checkPrintFileQuality(artworkBuffer)));
  } else if (isTenant) {
    return {
      opportunityId: input.runtimeId,
      title: input.title,
      description: input.description,
      productType: input.productType,
      fulfillmentType: "printful",
      status: "failed",
      imagePrompt,
      error:
        "Auto-build needs a print-ready image. Upload your design as a transparent PNG (≥1800px on the long edge) and pass its URL as printFileUrl — or use the mirror flow to import a product you've already designed in Printful."
    };
  } else {
    const generated = await generateProductImage(imagePrompt, { transparent: true }, tenantCtx);
    artworkBuffer = generated.buffer;
    artworkBase64 = generated.imageBase64;
  }

  const variantInfo = printfulConfig
    ? await expandPrintfulSizeVariants(printfulConfig.token, printfulConfig.variantId)
    : { productId: null as number | null, variants: [] as PrintfulVariantSpec[] };

  // Upload the print artwork to Shopify Files. We hand the resulting CDN URL
  // to Printful (both for mockup generation and as the print file on the sync product).
  const printFile = await uploadBufferToShopifyFiles(
    creds,
    `${slugify(input.title)}-print.png`,
    "image/png",
    artworkBuffer
  );
  const printFileUrl = printFile.url;
  const sizes = variantInfo.variants.map((v) => v.size);

  // Kick off mockup generation in parallel with Shopify draft creation. The mockup task
  // itself may run 30–60s; we'll await it before attaching images.
  const mockupPromise: Promise<string[]> =
    printfulConfig && printFileUrl && variantInfo.productId && variantInfo.variants.length > 0
      ? (async () => {
          const taskKey = await createPrintfulMockupTask(
            printfulConfig.token,
            printfulConfig.storeId,
            variantInfo.productId as number,
            variantInfo.variants.map((v) => v.variantId),
            printFileUrl
          );
          if (!taskKey) return [];
          return pollPrintfulMockupTask(printfulConfig.token, printfulConfig.storeId, taskKey);
        })()
      : Promise.resolve<string[]>([]);

  const placeholderTags: string[] = [];
  if (!printfulConfigured) placeholderTags.push("needs-printful-binding");
  if (!printFileUrl) placeholderTags.push("needs-print-file-url");

  const shopifyProduct = await createShopifyDraftProduct(
    creds,
    input,
    renderDescriptionHtml(input.description),
    {
      extraTags: placeholderTags,
      sizes: sizes.length > 0 ? sizes : undefined
    }
  );

  // Wait for mockups to finish (started in parallel with the Shopify draft).
  const mockupUrls = await mockupPromise;

  // Attach images to the Shopify product. Prefer real mockups; fall back to raw
  // artwork only if mockup generation failed — that way the listing always has an image.
  let primaryImageUrl: string | undefined;
  if (mockupUrls.length > 0) {
    for (const url of mockupUrls.slice(0, 5)) {
      try {
        const img = await attachShopifyProductImageFromUrl(creds, shopifyProduct.id, input.title, url);
        if (!primaryImageUrl) primaryImageUrl = img?.src ?? url;
      } catch (error) {
        console.warn(`[materialize] Failed to attach mockup for "${input.title}": ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  if (!primaryImageUrl && artworkBase64) {
    const img = await attachShopifyProductImage(creds, shopifyProduct.id, input.title, artworkBase64);
    primaryImageUrl = img?.src;
  }

  // Map each Shopify size variant to the Printful variant of the same size, in order.
  const shopifyVariantIds = (shopifyProduct.variants ?? []).map((v) => v.id);

  let printfulSyncProductId: number | undefined;
  let printfulVariantId: number | undefined;
  let syncedSizeCount = 0;
  if (printfulConfigured && printFileUrl && variantInfo.variants.length > 0) {
    try {
      const printfulProduct = await createPrintfulSyncProduct(
        input,
        printFileUrl,
        variantInfo.variants,
        shopifyVariantIds,
        tenantCtx
      );
      if (printfulProduct) {
        printfulSyncProductId = printfulProduct.syncProductId;
        printfulVariantId = printfulProduct.variantId;
        syncedSizeCount = printfulProduct.syncedSizeCount;
        await shopifyRest(creds, `/products/${shopifyProduct.id}.json`, {
          method: "PUT",
          body: JSON.stringify({
            product: {
              id: shopifyProduct.id,
              body_html: [
                renderDescriptionHtml(input.description),
                `<br /><br /><strong>Printful sync product:</strong> ${printfulProduct.syncProductId} (${syncedSizeCount} sizes)`
              ].join("")
            }
          })
        });
      }
    } catch (error) {
      console.warn(`[materialize] Printful sync skipped for "${input.title}": ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return {
    opportunityId: input.runtimeId,
    title: input.title,
    description: input.description,
    productType: input.productType,
    fulfillmentType: "printful",
    status: "created",
    imagePrompt,
    shopifyProductId: shopifyProduct.id,
    shopifyProductHandle: shopifyProduct.handle,
    shopifyProductUrl: `https://${creds.storeDomain}/admin/products/${shopifyProduct.id}`,
    shopifyImageUrl: primaryImageUrl ?? printFileUrl ?? undefined,
    printfulSyncProductId,
    printfulVariantId,
    warnings: warnings.length ? warnings : undefined
  };
}

// Map LockLayer-relevant niches to CJ category IDs. Free-text search on CJ is too
// noisy to use directly (matches each word independently), so we route the niche
// to a CJ category and let agents pick from category contents instead.
const CJ_LOCKLAYER_CATEGORY_KEYWORDS = /smart|security|surveillance|camera|lock|sensor|alarm|doorbell|spy|monitor|hidden/i;

async function pickCjCategoryForNiche(niche: string, tenantCtx?: TenantContext): Promise<string | null> {
  const matches = await findCjCategoryIds(CJ_LOCKLAYER_CATEGORY_KEYWORDS, tenantCtx);
  if (matches.length === 0) return null;
  // Prefer the explicit Security & Protection category (Computer & Office subtree)
  // — it's the most on-brand for LockLayer. Fall back to Smart Electronics for IoT.
  const security = matches.find((m) => /Security & Protection/i.test(m.path));
  if (security) return security.id;
  const smart = matches.find((m) => /Smart Electronics/i.test(m.path));
  if (smart) return smart.id;
  return matches[0].id;
}

// Markup factor applied to the CJ source price when setting the Shopify retail
// price. 3.5× covers shipping, ad spend, and target margin for impulse-buy IoT.
const DROPSHIP_MARKUP = Number(process.env.DROPSHIP_MARKUP ?? "3.5");

function computeRetailPriceFromCost(costMin: number, costMax: number, tenantCtx?: TenantContext): string {
  const cost = Number.isFinite(costMax) && costMax > 0 ? costMax : costMin;
  if (!Number.isFinite(cost) || cost <= 0) return getDefaultRetailPrice(tenantCtx);
  const retail = cost * DROPSHIP_MARKUP;
  // Round to .99 for psych pricing.
  const dollars = Math.max(Math.floor(retail), 1);
  return `${dollars}.99`;
}

async function materializeDropshipProduct(input: MaterializationInput, tenantCtx?: TenantContext): Promise<MaterializedProduct> {
  const creds = resolveShopifyCredentials(input.brand, tenantCtx);
  let sourced: CjProductDetail | undefined;

  if (input.sourceProductId) {
    // Caller pinned a specific CJ pid (e.g. push-cj-listings.ts pre-picks 5).
    // Fetch detail directly — no search/category lookup needed.
    const detail = await getCjProductDetail(input.sourceProductId, tenantCtx);
    if (!detail) {
      throw new Error(`CJ product ${input.sourceProductId} not found or has no detail.`);
    }
    sourced = detail;
  } else {
    // Fall back: search by niche → category → first usable. This path is what
    // the autonomous agent runtime hits; it produces ONE product per call so
    // the caller is responsible for varying niche to get variety.
    const niche = input.niche || input.title || "smart home security";
    const categoryId = await pickCjCategoryForNiche(niche, tenantCtx);
    if (!categoryId) {
      throw new Error(`No CJ category matched the niche "${niche}".`);
    }
    const candidates = await searchAndDetailCjProducts({
      categoryId,
      pageSize: 10,
      detailLimit: 5
    }, tenantCtx);
    sourced = candidates.find(
      (c) => c.images.length > 0 && (c.priceMin > 0 || c.variants.some((v) => v.variantSellPrice > 0))
    );
    if (!sourced) {
      throw new Error(`CJ category ${categoryId} returned no usable products with image and price.`);
    }
  }

  const retailPrice = computeRetailPriceFromCost(sourced.priceMin, sourced.priceMax, tenantCtx);
  const brand: Brand = resolveBrand(input.brand);

  // Strip CJ's raw HTML / supplier-CDN <img> tags before anything else touches
  // the description. Cleaned text is what goes to the AI rewriter (and is the
  // fallback if the rewriter fails).
  const cleanedRawDescription =
    cleanCjDescription(input.description) || cleanCjDescription(sourced.description) || sourced.title;

  // Hand the cleaned spec sheet to Claude to rewrite as on-brand customer copy.
  // Fall back to the raw bullets if the rewriter fails — broken supplier copy
  // beats no listing.
  let bodyHtml: string;
  let aiTitle: string | undefined;
  try {
    const rewritten = await rewriteProductDescription({
      brand,
      rawTitle: sourced.title,
      rawDescription: cleanedRawDescription,
      category: sourced.categoryName
    });
    bodyHtml = rewritten.bodyHtml;
    aiTitle = rewritten.promotionalTitle;
  } catch (error) {
    console.warn(
      `[materialize] Description rewrite failed for "${sourced.title}": ${error instanceof Error ? error.message : error}; falling back to clean bullets.`
    );
    const cleanedSourced: CjProductDetail = { ...sourced, description: cleanedRawDescription };
    bodyHtml = renderDropshipBodyHtml(cleanedRawDescription, cleanedSourced);
  }

  // Prefer the AI's customer-friendly title over CJ's comma-soup title, but
  // only if it's reasonable (non-empty, under 120 chars).
  const finalTitle = aiTitle && aiTitle.length > 0 && aiTitle.length < 120 ? aiTitle : sourced.title;
  const sourcedInput: MaterializationInput = {
    ...input,
    title: finalTitle,
    productType: sourced.categoryName || input.productType
  };

  const shopifyProduct = await createShopifyDraftProduct(creds, sourcedInput, bodyHtml, {
    retailPrice,
    extraTags: ["cj-sourced", `cj-pid:${sourced.pid}`]
  });

  // Attach up to 5 images from CJ's gallery to the Shopify listing.
  let primaryImageUrl: string | undefined;
  for (const url of sourced.images.slice(0, 5)) {
    try {
      const img = await attachShopifyProductImageFromUrl(creds, shopifyProduct.id, sourced.title, url);
      if (!primaryImageUrl) primaryImageUrl = img?.src ?? url;
    } catch (error) {
      console.warn(`[materialize] Failed to attach CJ image for "${sourced.title}": ${error instanceof Error ? error.message : error}`);
    }
  }

  return {
    opportunityId: input.runtimeId,
    title: finalTitle,
    description: input.description,
    productType: sourcedInput.productType,
    fulfillmentType: "zendrop",
    status: "created",
    shopifyProductId: shopifyProduct.id,
    shopifyProductHandle: shopifyProduct.handle,
    shopifyProductUrl: `https://${creds.storeDomain}/admin/products/${shopifyProduct.id}`,
    shopifyImageUrl: primaryImageUrl ?? sourced.images[0],
    zendropProductId: sourced.pid,
    zendropProductUrl: sourced.productUrl,
    zendropImages: sourced.images,
    zendropPrice: sourced.priceMax || sourced.priceMin,
    zendropCurrency: sourced.currency
  };
}

// Customer-facing body_html. NEVER include supplier name, supplier URL, or
// source cost — those leak to anyone viewing the storefront and let buyers
// bypass you. Source traceability lives in the `cj-pid:<pid>` tag instead.
function renderDropshipBodyHtml(description: string, sourced: CjProductDetail) {
  return renderDescriptionHtml(description || sourced.description || sourced.title);
}

export async function materializeProduct(input: MaterializationInput, tenantCtx?: TenantContext): Promise<MaterializedProduct> {
  const resolvedFulfillmentType = resolveFulfillmentType(input);
  const normalizedInput: MaterializationInput = {
    ...input,
    fulfillmentType: resolvedFulfillmentType,
    brand: input.brand ?? defaultBrandForFulfillment(resolvedFulfillmentType)
  };

  try {
    if (resolvedFulfillmentType === "printful") {
      return await materializePrintfulProduct(normalizedInput, tenantCtx);
    }

    if (resolvedFulfillmentType === "zendrop") {
      return await materializeDropshipProduct(normalizedInput, tenantCtx);
    }

    return await materializeDigitalProduct(normalizedInput, tenantCtx);
  } catch (error) {
    return {
      opportunityId: input.runtimeId,
      title: input.title,
      description: input.description,
      productType: input.productType,
      fulfillmentType: resolvedFulfillmentType,
      status: "failed",
      imagePrompt: input.imagePrompt,
      error: error instanceof Error ? error.message : "Unknown materialization error."
    };
  }
}
