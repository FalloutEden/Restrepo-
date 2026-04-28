import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { searchZendropProducts, type ZendropProduct } from "@/lib/zendrop-service";
import { generateProductImage } from "@/lib/image-generation";

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
};

type ShopifyProductResponse = {
  product?: {
    id: number;
    handle?: string;
    admin_graphql_api_id?: string;
  };
};

type ShopifyProductImageResponse = {
  image?: {
    id: number;
    src?: string;
  };
};

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN?.trim() || "lock-layer.myshopify.com";
const SHOPIFY_ADMIN_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2024-04";
const MATERIALIZED_OUTPUT_DIR = path.join(process.cwd(), ".openclaw", "materialized-products");

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

function ensureShopifyToken() {
  const token = process.env.SHOPIFY_API_KEY?.trim();

  if (!token) {
    throw new Error("Missing SHOPIFY_API_KEY in server environment.");
  }

  return token;
}

function ensurePrintfulConfig() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  const variantId = Number(process.env.PRINTFUL_DEFAULT_VARIANT_ID?.trim() || "");

  if (!token) {
    throw new Error("Missing PRINTFUL_API_KEY in server environment.");
  }

  if (!storeId) {
    throw new Error("Missing PRINTFUL_STORE_ID in server environment.");
  }

  if (!Number.isFinite(variantId)) {
    throw new Error("Missing PRINTFUL_DEFAULT_VARIANT_ID in server environment.");
  }

  return {
    token,
    storeId,
    variantId
  };
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

async function shopifyRest<T>(endpoint: string, init: RequestInit) {
  const token = ensureShopifyToken();
  const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}${endpoint}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": token,
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

async function shopifyGraphQL<T>(query: string, variables: Record<string, unknown>) {
  const token = ensureShopifyToken();
  const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
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

async function createShopifyDraftProduct(input: MaterializationInput, bodyHtml: string) {
  const payload = await shopifyRest<ShopifyProductResponse>("/products.json", {
    method: "POST",
    body: JSON.stringify({
      product: {
        title: input.title,
        body_html: bodyHtml,
        vendor: "LockLayer Security",
        product_type: input.productType,
        status: "draft",
        tags: [`agent-materialized`, `fulfillment:${input.fulfillmentType}`]
      }
    })
  });

  if (!payload.product?.id) {
    throw new Error(`Shopify did not return a product id for "${input.title}".`);
  }

  return payload.product;
}

async function uploadImageToShopifyFiles(title: string, imageBuffer: Buffer) {
  const filename = `${slugify(title)}.png`;
  return uploadBufferToShopifyFiles(filename, "image/png", imageBuffer);
}

async function attachShopifyProductImage(productId: number, title: string, imageBase64: string) {
  const payload = await shopifyRest<ShopifyProductImageResponse>(`/products/${productId}/images.json`, {
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

async function attachShopifyProductImageFromUrl(productId: number, title: string, imageUrl: string) {
  const payload = await shopifyRest<ShopifyProductImageResponse>(`/products/${productId}/images.json`, {
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

async function uploadBufferToShopifyFiles(filename: string, mimeType: string, buffer: Buffer) {
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
  }>(stagedUploadsCreate, {
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
  }>(fileCreate, {
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
  if (!file?.url) {
    throw new Error("Shopify fileCreate did not return a file URL.");
  }

  return file;
}

async function createPrintfulSyncProduct(input: MaterializationInput, imageUrl: string) {
  const printful = ensurePrintfulConfig();
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
        thumbnail: imageUrl
      },
      sync_variants: [
        {
          external_id: input.runtimeId,
          variant_id: printful.variantId,
          retail_price: process.env.PRINTFUL_RETAIL_PRICE?.trim() || "29.99",
          files: [
            {
              type: "default",
              url: imageUrl
            }
          ]
        }
      ]
    })
  });

  const rawBody = await response.text();
  const payload = rawBody ? (JSON.parse(rawBody) as { result?: { id?: number } }) : {};

  if (!response.ok || !payload.result?.id) {
    throw new Error(`Printful sync product creation failed (${response.status}): ${rawBody}`);
  }

  return {
    syncProductId: payload.result.id,
    variantId: printful.variantId
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

async function writeLocalArtifact(filename: string, buffer: Buffer) {
  await mkdir(MATERIALIZED_OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(MATERIALIZED_OUTPUT_DIR, filename);
  await writeFile(outputPath, buffer);
  return outputPath;
}

async function materializeDigitalProduct(input: MaterializationInput): Promise<MaterializedProduct> {
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
  const file = await uploadBufferToShopifyFiles(filename, mimeType, buffer);
  const bodyHtml = [
    renderDescriptionHtml(input.description),
    `<br /><br /><strong>Digital delivery file:</strong> <a href="${file.url}">${filename}</a>`
  ].join("");
  const product = await createShopifyDraftProduct(input, bodyHtml);

  return {
    opportunityId: input.runtimeId,
    title: input.title,
    description: input.description,
    productType: input.productType,
    fulfillmentType: "digital",
    status: "created",
    localArtifactPath,
    shopifyFileUrl: file.url,
    shopifyProductId: product.id,
    shopifyProductHandle: product.handle,
    shopifyProductUrl: `https://${SHOPIFY_STORE_DOMAIN}/admin/products/${product.id}`
  };
}

async function materializePrintfulProduct(input: MaterializationInput): Promise<MaterializedProduct> {
  const imagePrompt =
    input.imagePrompt?.trim() ||
    `Create a premium ecommerce product image for ${input.title}. ${input.description}`;
  const generatedImage = await generateProductImage(imagePrompt);
  const placeholderImageUrl = `https://placehold.co/1024x1024/1a1a2e/ffffff?text=${encodeURIComponent(input.title.slice(0, 30))}`;
  const imageUrl = generatedImage.buffer.length > 0
    ? (await uploadImageToShopifyFiles(input.title, generatedImage.buffer)).url ?? placeholderImageUrl
    : placeholderImageUrl;
  const printfulProduct = await createPrintfulSyncProduct(input, imageUrl);
  const bodyHtml = [
    renderDescriptionHtml(input.description),
    `<br /><br /><strong>Printful sync product:</strong> ${printfulProduct.syncProductId}`
  ].join("");
  const shopifyProduct = await createShopifyDraftProduct(input, bodyHtml);
  const shopifyImage = generatedImage.imageBase64
    ? await attachShopifyProductImage(shopifyProduct.id, input.title, generatedImage.imageBase64)
    : await attachShopifyProductImageFromUrl(shopifyProduct.id, input.title, imageUrl);

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
    shopifyProductUrl: `https://${SHOPIFY_STORE_DOMAIN}/admin/products/${shopifyProduct.id}`,
    shopifyImageUrl: shopifyImage?.src ?? imageUrl,
    printfulSyncProductId: printfulProduct.syncProductId,
    printfulVariantId: printfulProduct.variantId
  };
}

async function materializeZendropProduct(input: MaterializationInput): Promise<MaterializedProduct> {
  const keywords = Array.from(
    new Set(
      [input.title, input.productType, input.buildSummary, ...(input.keywords ?? [])]
        .flatMap((value) => value?.split(/[,\n]/g) ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).slice(0, 8);
  const [sourcedProduct] = await searchZendropProducts({
    niche: input.niche || input.title,
    keywords,
    limit: 5
  });

  if (!sourcedProduct) {
    throw new Error("Zendrop search returned no usable products with title, image, and price.");
  }

  const sourcedInput: MaterializationInput = {
    ...input,
    title: sourcedProduct.title,
    productType: sourcedProduct.productType || input.productType
  };
  const bodyHtml = renderZendropBodyHtml(input.description, sourcedProduct);
  const shopifyProduct = await createShopifyDraftProduct(sourcedInput, bodyHtml);
  const shopifyImage = sourcedProduct.images[0]
    ? await attachShopifyProductImageFromUrl(shopifyProduct.id, sourcedProduct.title, sourcedProduct.images[0])
    : null;

  return {
    opportunityId: input.runtimeId,
    title: sourcedProduct.title,
    description: input.description,
    productType: sourcedInput.productType,
    fulfillmentType: "zendrop",
    status: "created",
    shopifyProductId: shopifyProduct.id,
    shopifyProductHandle: shopifyProduct.handle,
    shopifyProductUrl: `https://${SHOPIFY_STORE_DOMAIN}/admin/products/${shopifyProduct.id}`,
    shopifyImageUrl: shopifyImage?.src ?? sourcedProduct.images[0],
    zendropProductId: sourcedProduct.id,
    zendropProductUrl: sourcedProduct.productUrl,
    zendropImages: sourcedProduct.images,
    zendropPrice: sourcedProduct.price,
    zendropCurrency: sourcedProduct.currency
  };
}

function renderZendropBodyHtml(description: string, sourcedProduct: ZendropProduct) {
  const priceLabel = Number.isFinite(sourcedProduct.price)
    ? `${sourcedProduct.currency} ${sourcedProduct.price.toFixed(2)}`
    : sourcedProduct.currency;

  return [
    renderDescriptionHtml(description),
    "<br /><br /><strong>Zendrop source product:</strong>",
    `<br />${escapeHtml(sourcedProduct.title)}`,
    `<br />Source price: ${escapeHtml(priceLabel)}`,
    sourcedProduct.productUrl
      ? `<br /><a href="${escapeHtml(sourcedProduct.productUrl)}">View sourced product</a>`
      : ""
  ].join("");
}

export async function materializeProduct(input: MaterializationInput): Promise<MaterializedProduct> {
  const resolvedFulfillmentType = resolveFulfillmentType(input);
  const normalizedInput: MaterializationInput = {
    ...input,
    fulfillmentType: resolvedFulfillmentType
  };

  try {
    if (resolvedFulfillmentType === "printful") {
      return await materializePrintfulProduct(normalizedInput);
    }

    if (resolvedFulfillmentType === "zendrop") {
      return await materializeZendropProduct(normalizedInput);
    }

    return await materializeDigitalProduct(normalizedInput);
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
