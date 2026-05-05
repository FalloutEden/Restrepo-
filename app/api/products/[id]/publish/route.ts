import { NextResponse } from "next/server";
import { publishShopifyProduct } from "@/lib/shopify-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const productId = Number(id);

  if (!Number.isFinite(productId) || productId <= 0) {
    return NextResponse.json({ error: "Invalid product id." }, { status: 400 });
  }

  // Brand identifies which Shopify store owns this product id. Defaults to
  // LockLayer for backwards-compat with pre-multi-store callers.
  const brand = new URL(request.url).searchParams.get("brand")?.trim() || undefined;

  try {
    const result = await publishShopifyProduct(productId, brand);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish product." },
      { status: 500 }
    );
  }
}
