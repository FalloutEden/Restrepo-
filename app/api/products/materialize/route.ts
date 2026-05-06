import { NextResponse } from "next/server";
import { materializeProduct, type MaterializationInput } from "@/lib/product-materialization";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  products?: Array<Partial<MaterializationInput>>;
};

// Manual materialization — bypasses the multi-minute Claude research pipeline.
// Use this to prove the Shopify draft + AI image path works, or to push a hand-curated
// batch of listings without burning Claude tokens on the research stage.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const products = Array.isArray(body.products) ? body.products : [];

    if (products.length === 0) {
      return NextResponse.json({ error: "Provide a non-empty `products` array." }, { status: 400 });
    }

    // Hard cap to prevent budget-bomb attacks. Each materialization is a
    // gpt-image-1 call (~$0.04–$0.19), Shopify draft creation, and Printful
    // sync — so a single request with 1000 items would burn $40–$190 in
    // image gen alone before any auth check tripped. 10 covers any realistic
    // batch the merchant runs by hand.
    const MAX_BATCH = 10;
    if (products.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `Batch too large: ${products.length} > ${MAX_BATCH}. Split into smaller requests.` },
        { status: 400 }
      );
    }

    const results = await Promise.all(
      products.map((p, idx) => {
        const runtimeId = `manual_${Date.now()}_${idx}`;
        const input: MaterializationInput = {
          runtimeId,
          title: p.title?.trim() || "Untitled product",
          description: p.description?.trim() || "Manual materialization without description.",
          productType: p.productType?.trim() || "Apparel",
          fulfillmentType: (p.fulfillmentType ?? "printful") as MaterializationInput["fulfillmentType"],
          niche: p.niche,
          keywords: p.keywords,
          imagePrompt: p.imagePrompt,
          buildSummary: p.buildSummary,
          sourceProductId: p.sourceProductId,
          // brand falls back to the fulfillment-type default inside materializeProduct
          // (printful → black-vault-apparel, otherwise → locklayer).
          brand: p.brand
        };
        return materializeProduct(input);
      })
    );

    const created = results.filter((r) => r.status === "created").length;
    const failed = results.length - created;

    return NextResponse.json({
      created,
      failed,
      results
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Manual materialization failed." },
      { status: 500 }
    );
  }
}
