// Add the BV Transparent logo to the label_inside placement on every Printful
// product that supports it. The customer never sees the supplier's neck text
// (COMFORT COLORS / STANLEY/STELLA / etc.) again at production — Printful
// prints the BV mark inside the neckline.
//
// File: id 987217027 (BV-Transparent-NeckLabel.png, 966x966 @ 96 dpi)
//
// Coverage: only applies to products with `label_inside` (or `label_inside_dtf`)
// placement support. Blanks that don't support custom inside printing
// (Comfort Colors, Port Authority, Lane Seven, AS Colour, Stella+Nora womens)
// keep their supplier neck text — those would need a blank-swap to fix.
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-add-inside-label.ts

const NECK_LABEL_FILE_ID = 987217027;
const PF_BASE = "https://api.printful.com";

type Target = {
  slug: string;
  syncProductId: number;
  productId: number;
  labelPlacement: string; // either "label_inside" or "label_inside_dtf" (cropped tee)
};

const TARGETS: Target[] = [
  // Chest_left products that support inside label printing
  { slug: "monogram-tee", syncProductId: 430513612, productId: 508, labelPlacement: "label_inside" },
  { slug: "monogram-tee-white", syncProductId: 430996312, productId: 508, labelPlacement: "label_inside" },
  { slug: "heavyweight-hoodie", syncProductId: 430513822, productId: 831, labelPlacement: "label_inside" },
  { slug: "heavyweight-hoodie-white", syncProductId: 430996329, productId: 831, labelPlacement: "label_inside" },
  { slug: "cropped-tee", syncProductId: 430996346, productId: 636, labelPlacement: "label_inside_dtf" },
  { slug: "cropped-tee-white", syncProductId: 430996350, productId: 636, labelPlacement: "label_inside_dtf" }
  // Relaxed Tee + AOP products handled in earlier passes (AOP succeeded;
  // Relaxed Tee returned "Unsupported file type: label_inside" despite the
  // printfile spec listing it — variant-specific limitation, skipped)
];

function ensurePf() {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  if (!token || !storeId) throw new Error("Missing Printful creds");
  return { token, storeId };
}

async function pf(method: "GET" | "POST" | "PUT", urlPath: string, body?: unknown) {
  const { token, storeId } = ensurePf();
  const r = await fetch(`${PF_BASE}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-PF-Store-Id": storeId,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Printful ${method} ${urlPath} (${r.status}): ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  ensurePf();
  console.log(`[init] adding BV neck label (file_id ${NECK_LABEL_FILE_ID}) to ${TARGETS.length} products\n`);

  let ok = 0;
  const failed: string[] = [];

  for (const t of TARGETS) {
    process.stdout.write(`[${t.slug}] ${t.labelPlacement}… `);
    try {
      const detail = await pf("GET", `/store/products/${t.syncProductId}`);
      const syncVariants = (detail.result?.sync_variants ?? []) as Array<{
        id: number;
        external_id?: string;
        variant_id: number;
        retail_price: string;
        files: Array<{ type: string; id?: number; url?: string }>;
        options?: Array<{ id: string; value: unknown }>;
      }>;

      const newSyncVariants = syncVariants.map((sv) => {
        // Preserve all files EXCEPT preview (auto-regenerated) and any
        // existing version of the label we're about to set. Critical: keep
        // options (thread_colors_chest_left = Old Gold) — losing them breaks
        // production for embroidery products.
        const existingFiles = sv.files
          .filter((f) => f.type !== "preview" && f.type !== t.labelPlacement)
          .map((f) => ({ type: f.type, id: f.id }));
        existingFiles.push({ type: t.labelPlacement, id: NECK_LABEL_FILE_ID });
        return {
          id: sv.id,
          external_id: sv.external_id,
          variant_id: sv.variant_id,
          retail_price: sv.retail_price,
          files: existingFiles,
          options: sv.options ?? []
        };
      });

      await pf("PUT", `/store/products/${t.syncProductId}`, { sync_variants: newSyncVariants });
      console.log("✓");
      ok += 1;
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`);
      failed.push(t.slug);
    }
    await new Promise((r) => setTimeout(r, 6000)); // be polite to Printful rate limit (60 calls/min)
  }

  console.log(`\n[done] ${ok}/${TARGETS.length} updated`);
  if (failed.length > 0) console.log(`  failed: ${failed.join(", ")}`);
  console.log(`\nNote: Label is production-only. Standard Printful mockups don't visualize the inside neck print —`);
  console.log(`it will appear in actual shipped garments. Verify on first physical sample.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
