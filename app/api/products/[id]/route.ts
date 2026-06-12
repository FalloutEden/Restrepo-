import { NextResponse } from "next/server";
import { deleteShopifyProduct } from "@/lib/shopify-service";
import { resolveTenantContext } from "@/lib/tenant-context";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  // Founder-only. This route deletes from a founder brand's Shopify store
  // (resolved from the ?brand= slug → founder credentials). A tenant operates
  // on its own store via the tenant-scoped operator tools, never here — without
  // this gate any tenant bearer could delete products from any founder brand.
  const ctx = await resolveTenantContext(request);
  if (!ctx.isFounder) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
