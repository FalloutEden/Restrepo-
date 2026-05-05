import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// CJ Dropshipping integration — REST API at developers.cjdropshipping.com.
//
// Auth model (a quirk worth knowing):
//   - You set CJ_API_KEY in env to the credential CJ shows you in their developer
//     portal. Despite being named "API key", CJ accepts it in the `password`
//     field of POST /authentication/getAccessToken alongside your account email.
//   - That call mints a 15-day JWT-style access token. We cache it on disk and
//     refresh automatically (1 day before expiry, or on a 401 from any call).

const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const TOKEN_CACHE_DIR = path.join(process.cwd(), ".openclaw");
const TOKEN_CACHE_PATH = path.join(TOKEN_CACHE_DIR, "cj-token.json");

// CJ enforces a hard 1 request/second limit per account. Gating ALL outbound
// calls through a serial queue with ≥1200ms spacing keeps us under the cap
// without burning retries on 429s. Calls are serialised across the whole
// process — if you ever need parallel CJ traffic, raise the cap on their side
// first, don't loosen this.
const CJ_MIN_GAP_MS = 1200;
let cjQueueTail: Promise<void> = Promise.resolve();
let cjLastCallStart = 0;

function cjRateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const previous = cjQueueTail;
  let release!: () => void;
  cjQueueTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  return (async () => {
    try {
      await previous;
      const elapsed = Date.now() - cjLastCallStart;
      if (elapsed < CJ_MIN_GAP_MS) {
        await new Promise((resolve) => setTimeout(resolve, CJ_MIN_GAP_MS - elapsed));
      }
      cjLastCallStart = Date.now();
      return await fn();
    } finally {
      release();
    }
  })();
}

type CachedToken = {
  accessToken: string;
  expiresAt: string; // ISO
};

export type CjProduct = {
  pid: string;
  title: string;
  images: string[];
  priceMin: number;
  priceMax: number;
  currency: "USD";
  categoryName?: string;
  productUrl?: string;
  variantCount?: number;
};

export type CjProductDetail = CjProduct & {
  description?: string;
  variants: CjVariant[];
};

export type CjVariant = {
  vid: string;
  sku: string;
  variantName: string;
  variantImage?: string;
  variantSellPrice: number;
  variantWeight?: number;
};

function loadCjCredentials(): { email: string; apiKey: string } {
  const email = process.env.CJ_EMAIL?.trim();
  const apiKey = (process.env.CJ_API_KEY || process.env.CJ_ACCESS_TOKEN)?.trim();
  if (!email) throw new Error("Missing CJ_EMAIL in server environment.");
  if (!apiKey) throw new Error("Missing CJ_API_KEY (or legacy CJ_ACCESS_TOKEN) in server environment.");
  return { email, apiKey };
}

async function readCachedToken(): Promise<CachedToken | null> {
  try {
    const raw = await readFile(TOKEN_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as CachedToken;
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedToken(token: CachedToken): Promise<void> {
  await mkdir(TOKEN_CACHE_DIR, { recursive: true });
  await writeFile(TOKEN_CACHE_PATH, JSON.stringify(token, null, 2), "utf8");
}

function isTokenFresh(token: CachedToken): boolean {
  const now = Date.now();
  const expiry = Date.parse(token.expiresAt);
  if (!Number.isFinite(expiry)) return false;
  // Refresh if within 1 day of expiry to avoid mid-request expiry.
  return expiry - now > 24 * 60 * 60 * 1000;
}

async function mintAccessToken(): Promise<CachedToken> {
  const { email, apiKey } = loadCjCredentials();
  const response = await cjRateLimited(() =>
    fetch(`${CJ_BASE}/authentication/getAccessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password: apiKey })
    })
  );
  const body = (await response.json()) as {
    code?: number;
    result?: boolean;
    message?: string;
    data?: { accessToken?: string; accessTokenExpiryDate?: string };
  };
  if (!response.ok || !body.result || !body.data?.accessToken) {
    throw new Error(`CJ auth failed (${response.status}): ${body.message ?? "no message"}`);
  }
  // CJ returns expiry in their server's timezone (China, "+08:00") — Date.parse handles offsets.
  const cached: CachedToken = {
    accessToken: body.data.accessToken,
    expiresAt: body.data.accessTokenExpiryDate ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  };
  await writeCachedToken(cached);
  return cached;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const cached = await readCachedToken();
    if (cached && isTokenFresh(cached)) return cached.accessToken;
  }
  const fresh = await mintAccessToken();
  return fresh.accessToken;
}

// Wrap a CJ API call with auto-retry on 401: refresh token once and re-attempt.
async function cjFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("CJ-Access-Token", token);
  headers.set("Accept", "application/json");
  let response = await cjRateLimited(() => fetch(input, { ...init, headers }));
  if (response.status === 401) {
    const fresh = await getAccessToken(true);
    headers.set("CJ-Access-Token", fresh);
    response = await cjRateLimited(() => fetch(input, { ...init, headers }));
  }
  return response;
}

function pickPriceRange(record: { sellPrice?: string; productSellPrice?: string }): { min: number; max: number } {
  // CJ returns prices like "12.19 -- 12.69" or "6.33" — parse both.
  const raw = record.sellPrice ?? record.productSellPrice ?? "";
  const matches = String(raw).match(/[\d.]+/g);
  if (!matches || matches.length === 0) return { min: 0, max: 0 };
  const nums = matches.map((s) => Number(s)).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function normalizeListItem(record: Record<string, unknown>): CjProduct | null {
  const pid = String(record.pid ?? record.productId ?? record.productSku ?? "").trim();
  const title = String(record.productNameEn ?? record.productName ?? "").trim();
  const image = String(record.productImage ?? "").trim();
  if (!pid || !title || !image) return null;
  const { min, max } = pickPriceRange(record as { sellPrice?: string; productSellPrice?: string });
  return {
    pid,
    title,
    images: [image],
    priceMin: min,
    priceMax: max,
    currency: "USD",
    categoryName: typeof record.categoryName === "string" ? record.categoryName : undefined,
    productUrl: pid ? `https://www.cjdropshipping.com/product/detail.html?pid=${pid}` : undefined,
    variantCount: typeof record.variantCount === "number" ? record.variantCount : undefined
  };
}

export type CjSearchQuery = {
  productNameEn?: string;
  categoryId?: string;
  pageNum?: number;
  pageSize?: number;
};

// Search the CJ catalog. Pass productNameEn for free-text or categoryId for
// category browsing — categoryId returns much more relevant results than
// free-text (CJ's free-text search matches each word independently).
export async function searchCjProducts(query: CjSearchQuery): Promise<CjProduct[]> {
  const params = new URLSearchParams();
  params.set("pageNum", String(query.pageNum ?? 1));
  params.set("pageSize", String(Math.min(query.pageSize ?? 20, 50)));
  if (query.productNameEn) params.set("productNameEn", query.productNameEn);
  if (query.categoryId) params.set("categoryId", query.categoryId);

  const response = await cjFetch(`${CJ_BASE}/product/list?${params.toString()}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CJ product/list failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const json = (await response.json()) as { data?: { list?: Array<Record<string, unknown>> } };
  return (json.data?.list ?? [])
    .map(normalizeListItem)
    .filter((p): p is CjProduct => p !== null);
}

// Pull full detail for a product (variants, full images, description).
export async function getCjProductDetail(pid: string): Promise<CjProductDetail | null> {
  const response = await cjFetch(`${CJ_BASE}/product/query?pid=${encodeURIComponent(pid)}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CJ product/query failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const json = (await response.json()) as {
    data?: Record<string, unknown> & {
      variants?: Array<Record<string, unknown>>;
      productImageSet?: string[];
      productImage?: string;
      productNameEn?: string;
      description?: string;
    };
  };
  const data = json.data;
  if (!data) return null;

  const images = Array.isArray(data.productImageSet) && data.productImageSet.length > 0
    ? data.productImageSet
    : data.productImage
      ? [String(data.productImage)]
      : [];

  const variants: CjVariant[] = (data.variants ?? []).map((v) => ({
    vid: String(v.vid ?? v.variantId ?? ""),
    sku: String(v.variantSku ?? v.sku ?? ""),
    variantName: String(v.variantNameEn ?? v.variantName ?? ""),
    variantImage: typeof v.variantImage === "string" ? v.variantImage : undefined,
    variantSellPrice: Number(v.variantSellPrice ?? 0),
    variantWeight: typeof v.variantWeight === "number" ? v.variantWeight : undefined
  }));

  const { min, max } = pickPriceRange(data as { sellPrice?: string; productSellPrice?: string });
  return {
    pid,
    title: String(data.productNameEn ?? ""),
    images: images.filter((img): img is string => typeof img === "string" && img.length > 0),
    priceMin: min || (variants[0]?.variantSellPrice ?? 0),
    priceMax: max || (variants[variants.length - 1]?.variantSellPrice ?? 0),
    currency: "USD",
    categoryName: typeof data.categoryName === "string" ? data.categoryName : undefined,
    productUrl: `https://www.cjdropshipping.com/product/detail.html?pid=${pid}`,
    description: typeof data.description === "string" ? data.description : undefined,
    variantCount: variants.length,
    variants
  };
}

// CJ product descriptions arrive as raw HTML — feature bullets wrapped in
// <p><em>...</em></p> with inline <img src="cf.cjdropshipping.com/...">. We
// must strip the markup before storing in Shopify body_html or the supplier
// CDN URL leaks into the listing AND the inline images break if CJ rotates.
// This converts the HTML to clean newline-separated text. Plain text input
// passes through untouched.
export function cleanCjDescription(html: string | undefined | null): string {
  if (!html) return "";
  if (!/<\/?[a-z][\s\S]*>/i.test(html)) return html.trim();
  let text = html.replace(/<img\b[^>]*>/gi, ""); // drop image tags entirely
  text = text.replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, ""); // strip any remaining tags
  // Strip any unterminated tag at the end (happens when caller slices HTML
  // mid-tag) and any unterminated entity reference.
  text = text.replace(/<\w[^>]*$/g, "").replace(/&[a-z#0-9]*$/i, "");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

// Convenience: search then immediately fetch full detail for the top N hits.
// Useful for the materialization pipeline which wants variants + image gallery.
// Calls are serialised through the 1 QPS rate limiter — N=5 takes ~6s minimum.
export async function searchAndDetailCjProducts(query: CjSearchQuery & { detailLimit?: number }): Promise<CjProductDetail[]> {
  const list = await searchCjProducts(query);
  const topN = list.slice(0, query.detailLimit ?? 5);
  const results: CjProductDetail[] = [];
  for (const p of topN) {
    const detail = await getCjProductDetail(p.pid);
    if (detail) results.push(detail);
  }
  return results;
}

export type CjCategoryLeaf = { categoryId: string; categoryName: string };
export type CjCategorySecond = {
  categorySecondId: string;
  categorySecondName: string;
  categoryList?: CjCategoryLeaf[];
};
export type CjCategoryFirst = {
  categoryFirstId: string;
  categoryFirstName: string;
  categoryFirstList?: CjCategorySecond[];
};

// Pull CJ's full category tree. Used by the agents to translate a niche like
// "home security IoT" into one or more categoryIds that searchCjProducts can
// hit for relevant results (free-text search is too noisy).
export async function getCjCategories(): Promise<CjCategoryFirst[]> {
  const response = await cjFetch(`${CJ_BASE}/product/getCategory`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CJ getCategory failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const json = (await response.json()) as { data?: CjCategoryFirst[] };
  return json.data ?? [];
}

// Find category IDs whose name matches any of the provided keywords. Searches
// across all three category levels (first / second / leaf) and returns the
// most-specific match per keyword group.
export async function findCjCategoryIds(keywords: RegExp): Promise<Array<{ id: string; path: string }>> {
  const tree = await getCjCategories();
  const matches: Array<{ id: string; path: string }> = [];
  for (const top of tree) {
    for (const sub of top.categoryFirstList ?? []) {
      if (keywords.test(sub.categorySecondName)) {
        matches.push({
          id: sub.categorySecondId,
          path: `${top.categoryFirstName} > ${sub.categorySecondName}`
        });
      }
      for (const leaf of sub.categoryList ?? []) {
        if (keywords.test(leaf.categoryName)) {
          matches.push({
            id: leaf.categoryId,
            path: `${top.categoryFirstName} > ${sub.categorySecondName} > ${leaf.categoryName}`
          });
        }
      }
    }
  }
  return matches;
}
