import { NextResponse } from "next/server";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  createPrintfulOrderFromShopify,
  verifyShopifyHmac,
  type ShopifyOrderPayload
} from "@/lib/printful-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// On serverless platforms (Vercel, Lambda) the working directory is read-only.
// Use /tmp in those environments — it's writable per warm container, wipes on
// cold start. Printful's external_id dedup catches duplicates either way.
const LOG_DIR = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
  ? "/tmp/openclaw"
  : path.join(process.cwd(), ".openclaw");
const LOG_PATH = path.join(LOG_DIR, "processed-orders.jsonl");

// Local audit log + fast dedup. Backs up Printful's own external_id dedup.
async function hasProcessedOrder(orderId: number): Promise<boolean> {
  try {
    const contents = await readFile(LOG_PATH, "utf8");
    const needle = `"shopifyOrderId":${orderId}`;
    return contents.includes(needle);
  } catch {
    return false;
  }
}

async function recordProcessedOrder(entry: Record<string, unknown>) {
  // Failure to write the dedup log must never break the webhook — Printful's
  // external_id dedup still works without it, and Shopify retries on any 500.
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_PATH, JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n", "utf8");
  } catch (e) {
    console.warn(`[order-paid] dedup-log write failed (${e instanceof Error ? e.message : "unknown"}); continuing`);
  }
}

// Shopify webhooks: orders/paid topic.
//
// Setup (once per store):
// 1. Set SHOPIFY_WEBHOOK_SECRET in .env.local — this is the shared secret Shopify
//    signs payloads with. You receive it when you register the webhook (via the
//    register-shopify-webhook script or Shopify admin).
// 2. Register the webhook to point at https://<your-host>/api/webhooks/shopify/order-paid.
// 3. Place a test order in Shopify (or replay one from the admin) and watch the log.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyHmac(rawBody, hmacHeader)) {
    // Treat as 401 so Shopify stops retrying on a misconfigured/forged request.
    return NextResponse.json({ error: "invalid hmac" }, { status: 401 });
  }

  let payload: ShopifyOrderPayload;
  try {
    payload = JSON.parse(rawBody) as ShopifyOrderPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const orderId = payload.id;
  if (!orderId) {
    return NextResponse.json({ error: "missing order id" }, { status: 400 });
  }

  // Fast local dedup — saves a Printful round-trip when Shopify retries an
  // already-processed delivery.
  if (await hasProcessedOrder(orderId)) {
    return NextResponse.json({
      ok: true,
      shopifyOrderId: orderId,
      status: "skipped",
      reason: "already processed (local log)"
    });
  }

  try {
    const result = await createPrintfulOrderFromShopify(payload);

    await recordProcessedOrder({
      shopifyOrderId: orderId,
      shopifyOrderName: payload.name,
      result
    });

    if (result.status === "error") {
      // Return 500 so Shopify retries. createPrintfulOrderFromShopify already
      // distinguished duplicate-external-id from real errors, so a 500 here
      // means Printful actually failed.
      return NextResponse.json(
        { ok: false, shopifyOrderId: orderId, ...result },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      shopifyOrderId: orderId,
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await recordProcessedOrder({
      shopifyOrderId: orderId,
      shopifyOrderName: payload.name,
      result: { status: "error", reason: message }
    });
    return NextResponse.json(
      { ok: false, shopifyOrderId: orderId, error: message },
      { status: 500 }
    );
  }
}
