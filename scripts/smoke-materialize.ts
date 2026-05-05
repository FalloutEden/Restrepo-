// Smoke test: materialize a single product end-to-end and dump the result.
// Run with:  node --import tsx scripts/smoke-materialize.ts
import { materializeProduct } from "@/lib/product-materialization";

async function main() {
  const result = await materializeProduct({
    runtimeId: `smoke_${Date.now()}`,
    title: "Hospice Nurse 'End-of-Life Warrior' Premium Hoodie",
    description:
      "Heavyweight premium hoodie designed for hospice nurses. Embroidered chest crest with the phrase \"End-of-Life Warrior\" — a quiet badge of honor for the toughest specialty in nursing. Soft brushed fleece interior, ribbed cuffs, kangaroo pocket. Made for night-shift comfort and end-of-shift catharsis.",
    productType: "Apparel",
    fulfillmentType: "printful",
    niche: "Healthcare professional pride",
    keywords: ["hospice nurse", "premium hoodie", "healthcare pride"],
    imagePrompt:
      "Bold vintage-distressed badge design: the words 'End-of-Life Warrior' in muted sage and slate, layered over a soft caduceus and crescent-moon motif. Heavy-weight serif headline with thin sans-serif sub-line. Quiet, dignified, hospice-appropriate — not clinical. Earth-tone palette: sage, dusty slate, cream."
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[smoke] failed:", err);
  process.exit(1);
});
