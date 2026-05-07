// Delete the 9 off-brand pipeline-slop drafts on LockLayer that were created
// before the brand-fit filter shipped 2026-05-01. Each ID is hand-curated
// from .openclaw/drafts-summary.md — no auto-discovery, no scope creep.
//
// Run dry-run (default — lists what would happen, no deletes):
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/delete-slop-drafts.ts
//
// Live run (irreversible, deletes products from Shopify):
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/delete-slop-drafts.ts --confirm

import { deleteShopifyProduct } from "@/lib/shopify-service";

type Slop = { id: number; title: string; reason: string };

const SLOP_DRAFTS: Slop[] = [
  { id: 7769718456425, title: "Hospice Nurse 'End-of-Life Warrior' Premium Hoodie", reason: "Occupation-specific apparel" },
  { id: 7769718325353, title: "Hospice Nurse 'End-of-Life Warrior' Premium Hoodie (dup)", reason: "Occupation-specific apparel (duplicate)" },
  { id: 7769647546473, title: "Night Shift ICU - Vampire Shift Warrior Insulated Tumbler", reason: "Occupation/inspirational drinkware" },
  { id: 7769597902953, title: "Pediatric PT Milestone Canvas - Thank You for Helping Me Move Mountains", reason: "Occupation/inspirational wall art" },
  { id: 7769597870185, title: "Night Shift ICU - Vampire Shift Warrior Insulated Tumbler (dup)", reason: "Occupation/inspirational drinkware (duplicate)" },
  { id: 7769597804649, title: "Radiation Therapy Tech Pride - Precision Saves Lives Hoodie", reason: "Occupation-specific apparel" },
  { id: 7769597771881, title: "Foster Dog Parent - Saving Lives One Paw at a Time Tee", reason: "Occupation-specific apparel" },
  { id: 7769597739113, title: "Hospice Nurse End-of-Life Warrior Premium Hoodie (dup3)", reason: "Occupation-specific apparel (duplicate)" },
  { id: 7764705345641, title: "Minimalist Animal Care Wall Art Series — Profession-Specific Prints", reason: "Profession-specific wall art series" }
];

const BRAND = "locklayer";

async function main() {
  const confirm = process.argv.includes("--confirm");
  console.log(`[slop-delete] brand=${BRAND}  ${confirm ? "LIVE" : "DRY RUN — pass --confirm to actually delete"}`);
  console.log(`[slop-delete] targets:\n`);
  for (const s of SLOP_DRAFTS) {
    console.log(`  ${s.id}  "${s.title}"`);
    console.log(`    reason: ${s.reason}`);
  }
  if (!confirm) {
    console.log(`\n[slop-delete] dry-run complete. Re-run with --confirm to delete.`);
    return;
  }
  const results: Array<{ id: number; ok: boolean; error?: string }> = [];
  for (const s of SLOP_DRAFTS) {
    try {
      await deleteShopifyProduct(s.id, BRAND);
      results.push({ id: s.id, ok: true });
      console.log(`[slop-delete] ✓ deleted ${s.id} "${s.title}"`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ id: s.id, ok: false, error: msg });
      console.log(`[slop-delete] ✗ ${s.id}: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n[slop-delete] ${ok}/${results.length} deleted`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
