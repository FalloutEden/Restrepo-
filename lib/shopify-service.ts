import "server-only";

import type { BuiltProduct, CreatedProduct } from "@/lib/autonomous-products";

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

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN?.trim() || "lock-layer.myshopify.com";
const SHOPIFY_ADMIN_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2024-04";

function ensureShopifyToken() {
  const token = process.env.SHOPIFY_API_KEY?.trim();

  if (!token) {
    throw new Error("Missing SHOPIFY_API_KEY in server environment.");
  }

  return token;
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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
  const parsed = rawBody ? (JSON.parse(rawBody) as { data?: T; errors?: Array<{ message: string }> }) : {};

  if (!response.ok || parsed.errors?.length) {
    const message = parsed.errors?.map((entry) => entry.message).join(" | ") || rawBody;
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
};

export async function listShopifyDrafts(limit = 50): Promise<ShopifyDraftSummary[]> {
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
      adminUrl: `https://${SHOPIFY_STORE_DOMAIN}/admin/products/${p.id}`,
      storeUrl: p.handle ? `https://${SHOPIFY_STORE_DOMAIN}/products/${p.handle}` : undefined
    }))
    .filter((p) => p.tags.includes("autonomous-product"));
}

export async function publishShopifyProduct(productId: number) {
  await shopifyRest(`/products/${productId}.json`, {
    method: "PUT",
    body: JSON.stringify({ product: { id: productId, status: "active" } })
  });
  return { id: productId, status: "active" as const };
}

export async function deleteShopifyProduct(productId: number) {
  await shopifyRest(`/products/${productId}.json`, { method: "DELETE" });
  return { id: productId, deleted: true };
}

export async function uploadBufferToShopifyFiles(filename: string, mimeType: string, buffer: Buffer) {
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

export async function createShopifyDraftProduct(product: BuiltProduct): Promise<CreatedProduct> {
  try {
    const payload = await shopifyRest<ShopifyProductResponse>("/products.json", {
      method: "POST",
      body: JSON.stringify({
        product: {
          title: product.title,
          body_html: buildBodyHtml(product),
          vendor: "LockLayer Security",
          product_type: product.productType,
          status: "draft",
          tags: [
            "autonomous-product",
            `source:${product.source}`,
            `niche:${slugify(product.niche)}`
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
      product.images[0] ? await attachShopifyProductImageFromUrl(payload.product.id, product.title, product.images[0]) : null;

    return {
      ...product,
      status: "created",
      shopifyProductId: payload.product.id,
      shopifyProductHandle: payload.product.handle,
      shopifyProductUrl: `https://${SHOPIFY_STORE_DOMAIN}/admin/products/${payload.product.id}`,
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
