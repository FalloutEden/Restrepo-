import { NextResponse } from "next/server";
import { publishShopifyProduct } from "@/lib/shopify-service";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const productId = Number(id);

  if (!Number.isFinite(productId) || productId <= 0) {
    return NextResponse.json({ error: "Invalid product id." }, { status: 400 });
  }

  try {
    const result = await publishShopifyProduct(productId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish product." },
      { status: 500 }
    );
  }
}
