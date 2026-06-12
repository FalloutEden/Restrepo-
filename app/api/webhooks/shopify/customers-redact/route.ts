import { NextResponse } from "next/server";

import { verifyAppWebhook } from "@/lib/shopify-webhook";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GDPR mandatory webhook: customers/redact. Request to erase a shopper's data.
// The operator holds no end-customer PII of its own, so there is nothing to
// delete — acknowledge and log.
export async function POST(request: Request) {
  const { ok, shopDomain } = await verifyAppWebhook(request);
  if (!ok) return NextResponse.json({ error: "invalid hmac" }, { status: 401 });
  audit({
    action: "admin.action",
    actor: "shopify-gdpr",
    target: shopDomain ?? "unknown",
    detail: { topic: "customers/redact", note: "no end-customer PII stored" }
  });
  return NextResponse.json({ ok: true });
}
