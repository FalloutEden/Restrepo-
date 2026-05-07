import { NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { verifyShopifyHmac } from "@/lib/printful-orders";
import { listConfiguredShopifyCredentials } from "@/lib/shopify-credentials";
import { attachProductToOnlineStore } from "@/lib/shopify-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shopify products/update webhook.
//
// Use case: when the merchant flips a product from draft → active in the
// Shopify admin, this fires. We auto-attach the product to the Online Store
// sales channel so it becomes customer-visible. Without this, an active
// product can still be missing the Online Store publication flag (especially
// on stores whose custom app lacks `write_publications` scope) and stay
// invisible to customers.
//
// The handler is idempotent — if the product is already on Online Store,
// attachProductToOnlineStore is a no-op. Idle traffic (every product update
// fires this) is cheap.
//
// Setup:
//   node --env-file=.env.local --import tsx scripts/register-products-update-webhook.ts \
//     https://restrepo.vercel.app/api/webhooks/shopify/products-update <brand>

const LOG_DIR = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
  ? "/tmp/openclaw"
  : path.join(process.cwd(), ".openclaw");
const LOG_PATH = path.join(LOG_DIR, "products-update.jsonl");

async function logEvent(entry: Record<string, unknown>) {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_PATH, JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n", "utf8");
  } catch (e) {
    console.warn(`[products-update] log failed: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

type ShopifyProductUpdatePayload = {
  id: number;
  title: string;
  handle?: string;
  status?: "active" | "draft" | "archived";
  published_at?: string | null;
  // Shopify's Webhook X-Shopify-Shop-Domain header tells us which store fired,
  // so we can match it to a brand.
};

function brandFromShopDomain(shopDomain: string | null): string | null {
  if (!shopDomain) return null;
  const all = listConfiguredShopifyCredentials();
  const match = all.find((c) => c.storeDomain === shopDomain);
  return match?.brandSlug ?? null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyHmac(rawBody, hmacHeader)) {
    return NextResponse.json({ error: "invalid hmac" }, { status: 401 });
  }

  let payload: ShopifyProductUpdatePayload;
  try {
    payload = JSON.parse(rawBody) as ShopifyProductUpdatePayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const productId = payload.id;
  if (!productId) {
    return NextResponse.json({ error: "missing product id" }, { status: 400 });
  }

  // Only attach when status is active. Drafts stay drafts; archived stays archived.
  if (payload.status !== "active") {
    return NextResponse.json({
      ok: true,
      productId,
      status: payload.status,
      action: "skipped",
      reason: `status=${payload.status} — only attach on active`
    });
  }

  // If already published_at is set, the product is already on Online Store.
  // Skip the API call.
  if (payload.published_at) {
    return NextResponse.json({
      ok: true,
      productId,
      status: payload.status,
      action: "skipped",
      reason: "already on Online Store (published_at set)"
    });
  }

  // Match the firing store to a brand so we use the right token.
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const brand = brandFromShopDomain(shopDomain);
  if (!brand) {
    await logEvent({
      kind: "unknown_shop",
      productId,
      shopDomain,
      title: payload.title
    });
    return NextResponse.json(
      { error: `Unknown shop domain: ${shopDomain}` },
      { status: 400 }
    );
  }

  try {
    const result = await attachProductToOnlineStore(productId, brand);
    await logEvent({
      kind: "attached",
      productId,
      brand,
      title: payload.title,
      via: result.via
    });
    return NextResponse.json({
      ok: true,
      productId,
      brand,
      action: "attached",
      via: result.via
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    await logEvent({
      kind: "attach_failed",
      productId,
      brand,
      title: payload.title,
      error: message
    });
    // Return 200 even on failure — Shopify retries 5xx; we don't want to
    // queue retries forever for a known-misconfigured store. The log captures
    // the failure for the merchant to address.
    return NextResponse.json({
      ok: false,
      productId,
      brand,
      action: "attach_failed",
      error: message
    });
  }
}
