import { NextResponse } from "next/server";
import { deleteShopifyProduct } from "@/lib/shopify-service";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const productId = Number(id);

  if (!Number.isFinite(productId) || productId <= 0) {
    return NextResponse.json({ error: "Invalid product id." }, { status: 400 });
  }

  const brand = new URL(request.url).searchParams.get("brand")?.trim() || undefined;

  try {
    const result = await deleteShopifyProduct(productId, brand);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete product." },
      { status: 500 }
    );
  }
}
