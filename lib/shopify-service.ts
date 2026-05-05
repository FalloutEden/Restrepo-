import "server-only";

import type { BuiltProduct, CreatedProduct } from "@/lib/autonomous-products";
import {
  listConfiguredShopifyCredentials,
  resolveShopifyCredentials,
  type ShopifyCredentials
} from "@/lib/shopify-credentials";
import { resolveBrand } from "@/lib/brands";

type ShopifyProductResponse = {
  product?: {
    id: number;
    handle?: string;
  };
};

type ShopifyProductImageResponse = {
  image?: {
    src?: string;
  };
};

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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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

export type ShopifyDraftSummary = {
  id: number;
  title: string;
  handle?: string;
  productType?: string;
  tags: string[];
  imageUrl?: string;
  createdAt: string;
  adminUrl: string;
  storeUrl?: string;
  brand: string;
  brandName: string;
  storeDomain: string;
};

async function listDraftsForBrand(creds: ShopifyCredentials, limit: number): Promise<ShopifyDraftSummary[]> {
  type Resp = {
    products: Array<{
      id: number;
      title: string;
      handle?: string;
      product_type?: string;
      tags?: string;
      created_at: string;
      image?: { src?: string };
    }>;
  };
  const data = await shopifyRest<Resp>(
    creds,
    `/products.json?status=draft&limit=${Math.max(1, Math.min(250, limit))}&fields=id,title,handle,product_type,tags,created_at,image`,
    { method: "GET" }
  );
  return data.products
    .map((p) => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      productType: p.product_type,
      tags: (p.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
      imageUrl: p.image?.src,
      createdAt: p.created_at,
      adminUrl: `https://${creds.storeDomain}/admin/products/${p.id}`,
      storeUrl: p.handle ? `https://${creds.storeDomain}/products/${p.handle}` : undefined,
      brand: creds.brandSlug,
      brandName: creds.brandName,
      storeDomain: creds.storeDomain
    }))
    .filter((p) => p.tags.includes("autonomous-product") || p.tags.includes("agent-materialized"));
}

export async function listShopifyDrafts(limit = 50, brand?: string): Promise<ShopifyDraftSummary[]> {
  // If a specific brand is requested, only that store. Otherwise aggregate
  // across every brand whose env vars are configured.
  const credsList = brand
    ? [resolveShopifyCredentials(brand)]
    : listConfiguredShopifyCredentials();

  const perBrand = await Promise.all(
    credsList.map((creds) =>
      listDraftsForBrand(creds, limit).catch((error) => {
        console.error(`Failed to list drafts for brand ${creds.brandSlug}:`, error);
        return [] as ShopifyDraftSummary[];
      })
    )
  );

  return perBrand
    .flat()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export async function publishShopifyProduct(productId: number, brand?: string) {
  const creds = resolveShopifyCredentials(brand);
  await shopifyRest(creds, `/products/${productId}.json`, {
    method: "PUT",
    body: JSON.stringify({ product: { id: productId, status: "active" } })
  });
  return { id: productId, status: "active" as const, brand: creds.brandSlug };
}

export async function deleteShopifyProduct(productId: number, brand?: string) {
  const creds = resolveShopifyCredentials(brand);
  await shopifyRest(creds, `/products/${productId}.json`, { method: "DELETE" });
  return { id: productId, deleted: true, brand: creds.brandSlug };
}

export async function uploadBufferToShopifyFiles(
  filename: string,
  mimeType: string,
  buffer: Buffer,
  brand?: string
) {
  const creds = resolveShopifyCredentials(brand);
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
  if (!file?.url) {
    throw new Error("Shopify fileCreate did not return a file URL.");
  }

  return file;
}

async function attachShopifyProductImageFromUrl(
  creds: ShopifyCredentials,
  productId: number,
  title: string,
  imageUrl: string
) {
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

function buildBodyHtml(product: BuiltProduct) {
  const priceLabel = `${product.currency} ${product.price.toFixed(2)}`;

  return [
    renderDescriptionHtml(product.description),
    "<br /><br /><strong>Source:</strong>",
    `<br />${escapeHtml(product.source)}`,
    `<br />Source price: ${escapeHtml(priceLabel)}`,
    product.sourceProductUrl ? `<br /><a href="${escapeHtml(product.sourceProductUrl)}">View source product</a>` : "",
    product.printfulSyncProductId ? `<br />Printful sync product: ${product.printfulSyncProductId}` : ""
  ].join("");
}

export async function createShopifyDraftProduct(product: BuiltProduct, brand?: string): Promise<CreatedProduct> {
  const creds = resolveShopifyCredentials(brand);
  const brandResolved = resolveBrand(creds.brandSlug);
  try {
    const payload = await shopifyRest<ShopifyProductResponse>(creds, "/products.json", {
      method: "POST",
      body: JSON.stringify({
        product: {
          title: product.title,
          body_html: buildBodyHtml(product),
          vendor: brandResolved.name,
          product_type: product.productType,
          status: "draft",
          tags: [
            "autonomous-product",
            `source:${product.source}`,
            `niche:${slugify(product.niche)}`,
            `brand:${creds.brandSlug}`
          ],
          variants: [
            {
              price: product.price.toFixed(2)
            }
          ]
        }
      })
    });

    if (!payload.product?.id) {
      throw new Error(`Shopify did not return a product id for "${product.title}".`);
    }

    const shopifyImage =
      product.images[0] ? await attachShopifyProductImageFromUrl(creds, payload.product.id, product.title, product.images[0]) : null;

    return {
      ...product,
      status: "created",
      shopifyProductId: payload.product.id,
      shopifyProductHandle: payload.product.handle,
      shopifyProductUrl: `https://${creds.storeDomain}/admin/products/${payload.product.id}`,
      shopifyImageUrl: shopifyImage?.src ?? product.images[0]
    };
  } catch (error) {
    return {
      ...product,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown Shopify product creation error."
    };
  }
}
