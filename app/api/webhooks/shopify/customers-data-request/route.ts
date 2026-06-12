import { NextResponse } from "next/server";

import { verifyAppWebhook } from "@/lib/shopify-webhook";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GDPR mandatory webhook: customers/data_request. Shopify forwards a shopper's
// request for the data a store/app holds on them. The operator stores NO
// end-customer PII (it works against the merchant's Shopify data in place), so
// there is nothing to compile — we acknowledge and log for the audit trail.
export async function POST(request: Request) {
  const { ok, shopDomain } = await verifyAppWebhook(request);
  if (!ok) return NextResponse.json({ error: "invalid hmac" }, { status: 401 });
  audit({
    action: "admin.action",
    actor: "shopify-gdpr",
    target: shopDomain ?? "unknown",
    detail: { topic: "customers/data_request", note: "no end-customer PII stored" }
  });
  return NextResponse.json({ ok: true });
}
