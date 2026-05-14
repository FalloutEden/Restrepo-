import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { audit } from "@/lib/audit";

// Printful order webhook receiver. Printful posts events here when an
// order's fulfillment status changes (created, in_production, shipped,
// canceled, returned, failed).
//
// We:
//   1. Verify signature (Printful sends X-PF-Signature header, HMAC-SHA256
//      of body with PRINTFUL_WEBHOOK_SECRET as key)
//   2. Append the event to .openclaw/printful-events.jsonl
//   3. If it's a shipment event AND we have the customer email, the
//      operator could send a "your order shipped" email (Phase 4 — for now
//      we just log; existing Shopify will send its own fulfillment notice)
//
// Setup in Printful:
//   Settings → Stores → [your store] → Webhooks → set URL to
//   https://blackvault.studio/api/webhooks/printful/order-status
//   Enable events: package_shipped, package_returned, order_canceled,
//   order_failed, order_put_hold, order_remove_hold, order_refunded
//   Generate the signing key, set as PRINTFUL_WEBHOOK_SECRET in env

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVENTS_PATH = (() => {
  const onVercel = Boolean(process.env.VERCEL);
  const base = onVercel ? "/tmp/openclaw" : path.join(process.cwd(), ".openclaw");
  return path.join(base, "printful-events.jsonl");
})();

function ensureDir() {
  const dir = path.dirname(EVENTS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function verifyPrintfulSignature(body: string, signature: string): boolean {
  const secret = process.env.PRINTFUL_WEBHOOK_SECRET?.trim();
  if (!secret) {
    // No secret configured — allow in dev, block in prod
    return !process.env.VERCEL;
  }
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

type PrintfulEvent = {
  type?: string;
  created?: number;
  retries?: number;
  store?: number;
  data?: Record<string, unknown>;
};

export async function POST(req: Request) {
  const signature = req.headers.get("x-pf-signature") ?? "";
  const body = await req.text();

  if (!verifyPrintfulSignature(body, signature)) {
    audit({
      action: "auth.failed",
      actor: "printful-webhook",
      target: "/api/webhooks/printful/order-status",
      ok: false,
      detail: { reason: "invalid_signature" }
    });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: PrintfulEvent;
  try {
    event = JSON.parse(body) as PrintfulEvent;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // Append to event log
  ensureDir();
  const entry = {
    receivedAt: new Date().toISOString(),
    type: event.type,
    created: event.created,
    store: event.store,
    retries: event.retries,
    data: event.data
  };
  try {
    fs.appendFileSync(EVENTS_PATH, JSON.stringify(entry) + "\n");
  } catch (e) {
    console.warn("[printful webhook] failed to append:", e);
  }

  audit({
    action: "admin.action",
    actor: "printful-webhook",
    target: event.type ?? "unknown",
    ok: true,
    detail: { store: event.store }
  });

  // Stripe expects 2xx ack within seconds — same for Printful. Return fast.
  return NextResponse.json({ ok: true });
}
