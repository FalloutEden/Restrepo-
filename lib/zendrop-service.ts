export type ZendropSearchQuery = {
  niche: string;
  keywords: string[];
  limit?: number;
};

export type ZendropProduct = {
  id: string;
  title: string;
  images: string[];
  price: number;
  currency: string;
  productUrl?: string;
  productType?: string;
};

type ZendropConfig = {
  apiKey: string;
  apiSecret?: string;
  baseUrl: string;
  searchPath: string;
  method: "GET" | "POST";
};

function ensureZendropConfig(): ZendropConfig {
  const apiKey = process.env.ZENDROP_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing ZENDROP_API_KEY in server environment.");
  }

  return {
    apiKey,
    apiSecret: process.env.ZENDROP_API_SECRET?.trim() || undefined,
    baseUrl: process.env.ZENDROP_API_BASE_URL?.trim() || "https://api.zendrop.com",
    searchPath: process.env.ZENDROP_PRODUCT_SEARCH_PATH?.trim() || "/products/search",
    method: process.env.ZENDROP_SEARCH_METHOD?.trim().toUpperCase() === "GET" ? "GET" : "POST"
  };
}

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function toRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function pickNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.replace(/[^0-9.-]+/g, "");
      if (!normalized) {
        continue;
      }

      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function normalizeImageList(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => {
      if (typeof entry === "string" && entry.trim()) {
        return [entry.trim()];
      }

      const record = toRecord(entry);
      if (!record) {
        return [];
      }

      return [pickString(record, ["url", "src", "image", "image_url", "imageUrl"])].filter(Boolean);
    })
    .filter(Boolean);
}

function extractCandidates(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = toRecord(payload);
  if (!record) {
    return [];
  }

  const directCollection = ["products", "results", "items", "data"].find((key) => Array.isArray(record[key]));
  if (directCollection) {
    return record[directCollection] as unknown[];
  }

  const nestedCollections = ["result", "response", "payload"]
    .map((key) => record[key])
    .map((value) => toRecord(value))
    .filter(Boolean) as Array<Record<string, unknown>>;

  for (const nested of nestedCollections) {
    const nestedCollection = ["products", "results", "items", "data"].find((key) => Array.isArray(nested[key]));
    if (nestedCollection) {
      return nested[nestedCollection] as unknown[];
    }
  }

  return [];
}

function normalizeZendropProduct(candidate: unknown): ZendropProduct | null {
  const record = toRecord(candidate);
  if (!record) {
    return null;
  }

  const title = pickString(record, ["title", "name", "product_title", "productTitle"]);
  const id =
    pickString(record, ["id", "product_id", "productId", "sku"]) ||
    pickString(record, ["product_url", "productUrl", "url", "link"]);
  const images = uniq(
    [
      ...normalizeImageList(record.images),
      ...normalizeImageList(record.image_urls),
      ...normalizeImageList(record.imageUrls),
      ...normalizeImageList(record.gallery),
      ...normalizeImageList(record.media),
      ...normalizeImageList(record.variants)
    ].filter(Boolean)
  );
  const price = pickNumber(record, ["price", "cost", "product_price", "productPrice", "sale_price", "salePrice"]);
  const currency = pickString(record, ["currency", "currency_code", "currencyCode"]) || "USD";
  const productUrl =
    pickString(record, ["product_url", "productUrl", "url", "link"]) ||
    (id && !id.startsWith("http") ? `https://app.zendrop.com/product/${id}` : undefined);
  const productType = pickString(record, ["product_type", "productType", "category", "category_name", "categoryName"]);

  if (!title || !id || !Number.isFinite(price) || images.length === 0) {
    return null;
  }

  return {
    id,
    title,
    images,
    price: price as number,
    currency,
    productUrl,
    productType: productType || undefined
  };
}

function buildSearchTerms(query: ZendropSearchQuery) {
  return uniq([query.niche, ...query.keywords]).slice(0, 8);
}

function buildZendropHeaders(config: ZendropConfig) {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "X-API-Key": config.apiKey,
    ...(config.apiSecret ? { "X-API-Secret": config.apiSecret } : {})
  };
}

export async function searchZendropProducts(query: ZendropSearchQuery): Promise<ZendropProduct[]> {
  const config = ensureZendropConfig();
  const searchTerms = buildSearchTerms(query);

  if (searchTerms.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(query.limit ?? 5, 10));
  const searchPhrase = searchTerms.join(" ");
  const endpoint = new URL(config.searchPath, config.baseUrl);
  const headers = buildZendropHeaders(config);

  let response: Response;
  if (config.method === "GET") {
    endpoint.searchParams.set("query", searchPhrase);
    endpoint.searchParams.set("niche", query.niche);
    endpoint.searchParams.set("limit", String(limit));
    query.keywords.forEach((keyword) => {
      if (keyword.trim()) {
        endpoint.searchParams.append("keywords", keyword.trim());
      }
    });

    response = await fetch(endpoint, {
      method: "GET",
      headers
    });
  } else {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: searchPhrase,
        niche: query.niche,
        keywords: query.keywords,
        limit
      })
    });
  }

  const rawBody = await response.text();
  const payload = rawBody ? (JSON.parse(rawBody) as unknown) : null;

  if (!response.ok) {
    throw new Error(`Zendrop search failed (${response.status}): ${rawBody}`);
  }

  return extractCandidates(payload)
    .map(normalizeZendropProduct)
    .filter((product): product is ZendropProduct => Boolean(product))
    .slice(0, limit);
}
