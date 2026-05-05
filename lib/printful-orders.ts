import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Printful order line item — references the matching Shopify variant via external_variant_id,
// which we set at sync_variant creation time (see createPrintfulSyncProduct in
// lib/product-materialization.ts).
type PrintfulOrderItem = {
  external_variant_id: string;
  quantity: number;
  retail_price?: string;
};

type ShopifyAddress = {
  name?: string;
  first_name?: string;
  last_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province_code?: string;
  country_code?: string;
  zip?: string;
  phone?: string;
};

type ShopifyLineItem = {
  variant_id?: number | null;
  quantity?: number;
  price?: string;
  title?: string;
  fulfillment_service?: string;
  vendor?: string;
};

export type ShopifyOrderPayload = {
  id?: number;
  name?: string;
  email?: string;
  currency?: string;
  financial_status?: string;
  line_items?: ShopifyLineItem[];
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
};

type PrintfulConfig = {
  token: string;
  storeId: string;
};

function loadPrintfulConfig(): PrintfulConfig {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token) throw new Error("Missing PRINTFUL_API_KEY in server environment.");
  if (!storeId) throw new Error("Missing PRINTFUL_STORE_ID in server environment.");
  return { token, storeId };
}

// Validate the Shopify HMAC header on a webhook payload. Shopify signs the raw
// request body (not JSON-parsed) with the custom app's API secret key, which
// is set per-store. We support multiple stores by trying each configured
// brand's secret in turn — the first match wins.
//
// Env var precedence:
//   SHOPIFY_BLACKVAULT_WEBHOOK_SECRET — Black Vault custom app's API secret
//   SHOPIFY_WEBHOOK_SECRET            — LockLayer (or single-store default)
export function verifyShopifyHmac(rawBody: string, headerValue: string | null): boolean {
  if (!headerValue) return false;
  const candidates = [
    process.env.SHOPIFY_BLACKVAULT_WEBHOOK_SECRET?.trim(),
    process.env.SHOPIFY_WEBHOOK_SECRET?.trim()
  ].filter((s): s is string => Boolean(s));
  if (candidates.length === 0) return false;

  const headerBuf = Buffer.from(headerValue);
  for (const secret of candidates) {
    const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    const computedBuf = Buffer.from(computed);
    if (computedBuf.length !== headerBuf.length) continue;
    if (timingSafeEqual(computedBuf, headerBuf)) return true;
  }
  return false;
}

function pickRecipient(payload: ShopifyOrderPayload) {
  const addr = payload.shipping_address ?? payload.billing_address;
  if (!addr) return null;
  const name =
    addr.name?.trim() ||
    [addr.first_name, addr.last_name].filter(Boolean).join(" ").trim() ||
    payload.email ||
    "Customer";
  if (!addr.address1 || !addr.city || !addr.country_code || !addr.zip) {
    return null;
  }
  return {
    name,
    address1: addr.address1,
    address2: addr.address2 || undefined,
    city: addr.city,
    state_code: addr.province_code || undefined,
    country_code: addr.country_code,
    zip: addr.zip,
    phone: addr.phone || undefined,
    email: payload.email || undefined
  };
}

function pickPrintfulItems(payload: ShopifyOrderPayload): PrintfulOrderItem[] {
  return (payload.line_items ?? [])
    .filter((line) => Number.isFinite(line.variant_id) && (line.quantity ?? 0) > 0)
    .map((line) => ({
      external_variant_id: String(line.variant_id),
      quantity: line.quantity ?? 1,
      retail_price: line.price
    }));
}

export type PrintfulOrderResult =
  | { status: "created"; printfulOrderId: number; itemsSubmitted: number; confirm: boolean }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string; httpStatus?: number; body?: string };

// Create a Printful order from a Shopify order payload.
//
// Idempotency: we set external_id = `shopify_<orderId>`. Printful enforces uniqueness
// on this field, so duplicate webhook deliveries return 4xx and we treat that as success.
export async function createPrintfulOrderFromShopify(payload: ShopifyOrderPayload): Promise<PrintfulOrderResult> {
  if (!payload.id) {
    return { status: "skipped", reason: "missing shopify order id" };
  }

  const items = pickPrintfulItems(payload);
  if (items.length === 0) {
    return { status: "skipped", reason: "no printful-eligible line items" };
  }

  const recipient = pickRecipient(payload);
  if (!recipient) {
    return { status: "skipped", reason: "incomplete shipping address" };
  }

  const config = loadPrintfulConfig();
  const externalId = `shopify_${payload.id}`;
  const confirm = process.env.PRINTFUL_AUTO_CONFIRM?.trim().toLowerCase() === "true";

  const response = await fetch("https://api.printful.com/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "X-PF-Store-Id": config.storeId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      external_id: externalId,
      shipping: "STANDARD",
      recipient,
      items,
      confirm
    })
  });

  const rawBody = await response.text();

  // Printful returns 4xx with a "duplicate external_id" error on retried webhooks.
  // Treat that as already-created, not a failure.
  if (response.status >= 400 && /external_id/i.test(rawBody) && /duplicate|already/i.test(rawBody)) {
    return { status: "skipped", reason: `already created (external_id=${externalId})` };
  }

  if (!response.ok) {
    return {
      status: "error",
      reason: `printful order creation failed (${response.status})`,
      httpStatus: response.status,
      body: rawBody.slice(0, 500)
    };
  }

  const parsed = rawBody ? (JSON.parse(rawBody) as { result?: { id?: number; items?: unknown[] } }) : {};
  const printfulOrderId = parsed.result?.id;
  if (!printfulOrderId) {
    return {
      status: "error",
      reason: "printful order response missing result.id",
      body: rawBody.slice(0, 500)
    };
  }

  return {
    status: "created",
    printfulOrderId,
    itemsSubmitted: items.length,
    confirm
  };
}
