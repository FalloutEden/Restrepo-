import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Command Center live metrics. Real where we have a connected source; an explicit
// `status: "pending"` where we don't yet (e.g. Etsy — API approval pending), so the
// dashboard never shows fake numbers. Founder env creds; safe to fail to pending.

type Block = { status: "live" | "pending"; [k: string]: unknown };

export async function GET() {
  const out: { shopify: Block; earnings: Block; etsy: Block; imageGen: Block } = {
    shopify: { status: "pending" },
    earnings: { status: "pending" },
    etsy: { status: "pending", note: "Etsy API approval pending" },
    imageGen: { status: "pending" }
  };

  const dom = process.env.SHOPIFY_BLACKVAULT_STORE_DOMAIN?.trim();
  const tok = process.env.SHOPIFY_BLACKVAULT_API_KEY?.trim();
  if (dom && tok) {
    try {
      const headers = { "X-Shopify-Access-Token": tok };
      const r = await fetch(
        `https://${dom}/admin/api/2024-04/orders.json?status=any&limit=250&fields=total_price,created_at`,
        { headers, cache: "no-store" }
      );
      if (r.ok) {
        const orders: Array<{ total_price?: string; created_at?: string }> = (await r.json()).orders ?? [];
        const total = orders.reduce((s, o) => s + parseFloat(o.total_price || "0"), 0);
        const now = new Date();
        const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();
        const thisM = monthKey(now);
        let revThis = 0, revLast = 0;
        for (const o of orders) {
          if (!o.created_at) continue;
          const k = monthKey(new Date(o.created_at));
          const v = parseFloat(o.total_price || "0");
          if (k === thisM) revThis += v;
          else if (k === thisM - 1) revLast += v;
        }
        const growth = revLast > 0 ? Math.round(((revThis - revLast) / revLast) * 100) : null;
        out.shopify = { status: "live", orders: orders.length, revenue: Math.round(total), growth };
        out.earnings = { status: "live", total: Math.round(total), net: Math.round(total * 0.7), monthly: revThis ? Math.round(revThis) : 0 };
      }
    } catch {
      // leave pending
    }
  }

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
