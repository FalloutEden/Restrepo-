import { NextResponse } from "next/server";
import { listShopifyDrafts } from "@/lib/shopify-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? limitParam : 50;
  // Optional ?brand=locklayer | black-vault-apparel — when omitted, drafts are
  // aggregated from every configured brand's Shopify store.
  const brand = searchParams.get("brand")?.trim() || undefined;

  try {
    const drafts = await listShopifyDrafts(limit, brand);
    return NextResponse.json({ drafts, count: drafts.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load drafts." },
      { status: 500 }
    );
  }
}
