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

export type ShopifyCleanupItem = ShopifyDraftSummary & {
  status: "draft" | "active" | "archived";
  publishedOnOnlineStore: boolean;
  // Reason this product showed up in the cleanup queue
  reason: "draft" | "active-not-published" | "active-published";
};

async function listCleanupForBrand(
  creds: ShopifyCredentials,
  options: { includePublished: boolean; limit: number }
): Promise<ShopifyCleanupItem[]> {
  // Uses REST products.json which only requires `read_products`. The product
  // object's `published_at` (non-null) corresponds to membership in the
  // Online Store publication. Avoids the GraphQL `publications` query, which
  // requires the `read_publications` access scope most installs don't grant.
  type RestProduct = {
    id: number;
    title: string;
    handle: string;
    product_type?: string;
    status: "active" | "draft" | "archived";
    tags?: string;
    image?: { src?: string };
    created_at: string;
    published_at: string | null;
  };

  const items: ShopifyCleanupItem[] = [];
  let pageInfo = "";
  for (let page = 0; page < 20; page += 1) {
    const endpoint = pageInfo
      ? `/products.json?limit=250&page_info=${encodeURIComponent(pageInfo)}`
      : `/products.json?limit=250&fields=id,title,handle,product_type,status,tags,image,created_at,published_at`;
    const data = await shopifyRest<{ products: RestProduct[] }>(creds, endpoint, { method: "GET" });

    for (const p of data.products) {
      const published = p.published_at != null;
      const reason: ShopifyCleanupItem["reason"] =
        p.status === "draft"
          ? "draft"
          : published
            ? "active-published"
            : "active-not-published";
      if (!options.includePublished && reason === "active-published") continue;

      items.push({
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
        storeDomain: creds.storeDomain,
        status: p.status,
        publishedOnOnlineStore: published,
        reason
      });
      if (items.length >= options.limit) return items;
    }
    if (data.products.length < 250) break;
    // REST pagination via Link header — simplified by stopping when fewer
    // than the page size is returned. Sufficient for stores under ~5000
    // products.
    break;
  }
  return items;
}

export async function listShopifyCleanupQueue(options: {
  brand?: string;
  includePublished?: boolean;
  limit?: number;
} = {}): Promise<ShopifyCleanupItem[]> {
  const credsList = options.brand
    ? [resolveShopifyCredentials(options.brand)]
    : listConfiguredShopifyCredentials();
  const limit = options.limit ?? 250;
  const perBrand = await Promise.all(
    credsList.map((creds) =>
      listCleanupForBrand(creds, { includePublished: options.includePublished ?? false, limit }).catch(
        (error) => {
          console.error(`Failed cleanup queue for brand ${creds.brandSlug}:`, error);
          return [] as ShopifyCleanupItem[];
        }
      )
    )
  );
  return perBrand
    .flat()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
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

// Cache the Online Store publication id per store domain. Resolving it costs
// one GraphQL call; the value is stable for the life of the app.
const onlineStorePublicationIdCache = new Map<string, string>();

async function getOnlineStorePublicationId(creds: ShopifyCredentials): Promise<string | null> {
  const cached = onlineStorePublicationIdCache.get(creds.storeDomain);
  if (cached) return cached;

  const data = await shopifyGraphQL<{
    publications: { edges: Array<{ node: { id: string; name: string } }> };
  }>(
    creds,
    `query { publications(first: 25) { edges { node { id name } } } }`,
    {}
  );
  const target = data.publications.edges
    .map((e) => e.node)
    .find((n) => n.name === "Online Store");
  if (!target) return null;
  onlineStorePublicationIdCache.set(creds.storeDomain, target.id);
  return target.id;
}

// Attach a product to the Online Store sales channel.
//
// Tries the modern `publishablePublish` GraphQL mutation first (requires the
// `write_publications` access scope). Falls back to the legacy REST
// `published: true` field for installs that don't have the scope. Both reach
// the same end state — product is in the Online Store publication — but
// GraphQL also works on draft products (REST `published: true` on a draft
// is silently ignored on some store configurations).
//
// Idempotent on both paths.
export async function attachProductToOnlineStore(
  productId: number,
  brand?: string
): Promise<{ onlineStoreAttached: boolean; publicationId: string | null; via: "graphql" | "rest" }> {
  const creds = resolveShopifyCredentials(brand);

  // Try GraphQL first
  try {
    const publicationId = await getOnlineStorePublicationId(creds);
    if (publicationId) {
      const result = await shopifyGraphQL<{
        publishablePublish: {
          publishable: { __typename: string } | null;
          userErrors: Array<{ field?: string[]; message: string }>;
        };
      }>(
        creds,
        `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            publishable { __typename }
            userErrors { field message }
          }
        }`,
        {
          id: `gid://shopify/Product/${productId}`,
          input: [{ publicationId }]
        }
      );
      const err = result.publishablePublish.userErrors[0];
      if (err) throw new Error(`Online Store attach failed: ${err.message}`);
      return {
        onlineStoreAttached: Boolean(result.publishablePublish.publishable),
        publicationId,
        via: "graphql"
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Common access-denied indicators when the install lacks write_publications
    if (!/access\s*denied|unauthorized|missing.*scope|not.*authorized/i.test(msg)) {
      // Real error, surface it
      throw e;
    }
    // Fall through to REST
  }

  // REST fallback — works without write_publications, but only on active
  // products (draft pre-attach is a no-op on some stores)
  await shopifyRest(creds, `/products/${productId}.json`, {
    method: "PUT",
    body: JSON.stringify({ product: { id: productId, published: true } })
  });
  return { onlineStoreAttached: true, publicationId: null, via: "rest" };
}

// Publish a product: set status=active AND ensure it's on the Online Store.
export async function publishShopifyProduct(productId: number, brand?: string) {
  const creds = resolveShopifyCredentials(brand);
  await shopifyRest(creds, `/products/${productId}.json`, {
    method: "PUT",
    body: JSON.stringify({ product: { id: productId, status: "active", published: true } })
  });
  // Best-effort GraphQL attach — covers stores where REST `published:true`
  // doesn't take effect. Errors swallowed since REST already did the job.
  try {
    await attachProductToOnlineStore(productId, brand);
  } catch {}
  return {
    id: productId,
    status: "active" as const,
    brand: creds.brandSlug,
    onlineStorePublished: true
  };
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

  // Image-typed files come back as MediaImage; non-image files as GenericFile.
  // We accept both. Detection by mimeType decides the contentType we ask for.
  const isImage = mimeType.startsWith("image/");
  const fileCreate = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          __typename
          ... on MediaImage { id image { url } }
          ... on GenericFile { id url }
        }
        userErrors { field message }
      }
    }
  `;

  const fileData = await shopifyGraphQL<{
    fileCreate: {
      files: Array<{
        __typename: string;
        id?: string;
        url?: string;
        image?: { url?: string };
      }>;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(creds, fileCreate, {
    files: [
      {
        originalSource: target.resourceUrl,
        contentType: isImage ? "IMAGE" : "FILE",
        filename
      }
    ]
  });

  const fileError = fileData.fileCreate.userErrors[0];
  if (fileError) throw new Error(`Shopify file creation failed: ${fileError.message}`);
  const created = fileData.fileCreate.files[0];
  if (!created?.id) throw new Error("Shopify fileCreate did not return a file id.");

  // URL is asynchronously populated for images. Poll the node by id until the
  // URL is ready (takes ~2-5s typically for product image uploads).
  let url = created.url ?? created.image?.url ?? "";
  for (let i = 0; i < 25 && !url; i += 1) {
    await new Promise((r) => setTimeout(r, 750 + i * 250));
    try {
      const polled = await shopifyGraphQL<{
        node: { id: string; url?: string; image?: { url?: string } } | null;
      }>(
        creds,
        `query($id: ID!) {
          node(id: $id) {
            ... on MediaImage { id image { url } }
            ... on GenericFile { id url }
          }
        }`,
        { id: created.id }
      );
      url = polled.node?.url ?? polled.node?.image?.url ?? "";
    } catch {}
  }
  if (!url) throw new Error("Shopify never returned a URL for the uploaded file.");
  return { __typename: created.__typename, id: created.id, url };
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

    // Pre-attach the new draft to the Online Store publication. With the
    // write_publications scope this works via GraphQL on drafts directly,
    // so flipping the draft to active later (via Shopify admin or our publish
    // path) lands it on the storefront with no extra channel step. Failure
    // is non-fatal — products without the scope just need explicit publish.
    try {
      await attachProductToOnlineStore(payload.product.id, brand);
    } catch (e) {
      console.warn(`[shopify] attachProductToOnlineStore failed for ${payload.product.id}: ${e instanceof Error ? e.message : e}`);
    }

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
