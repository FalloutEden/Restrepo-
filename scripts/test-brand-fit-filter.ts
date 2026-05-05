// Quick verification that the brand-fit filter would have blocked the 5
// off-brand drafts the pipeline produced on 2026-05-01. Also exercises a few
// known-good cases so we don't accidentally over-reject.
//
// Run: node --require ./scripts/server-only-stub.cjs --import tsx scripts/test-brand-fit-filter.ts

import { evaluateBrandFit } from "../lib/brand-fit-filter";

type TestCase = {
  label: string;
  title: string;
  productServiceType?: string;
  fulfillmentType: "printful" | "zendrop" | "digital";
  brand: string;
  expectOk: boolean;
};

const cases: TestCase[] = [
  // ── Slop the pipeline produced on 2026-05-01 (must reject) ─────────────
  { label: "creative-director", title: "Creative Director Premium Essentials Line", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: false },
  { label: "consulting-svc", title: "Premium POD Consulting for Fashion Brands", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: false },
  { label: "architect-women", title: "Women's Architect Minimalist Series", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: false },
  { label: "therapist-comfort", title: "Therapist Comfort Collection", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: false },
  { label: "sourcing-database", title: "Premium Basics Sourcing Database", fulfillmentType: "digital", brand: "locklayer", expectOk: false },
  // From earlier off-brand drafts the operator deleted
  { label: "ai-workflow", title: "AI Workflow Automation Setup for Fashion Retailers", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: false },
  { label: "taxonomist", title: "E-commerce Taxonomist Organization System", fulfillmentType: "digital", brand: "locklayer", expectOk: false },
  { label: "sqr-prep", title: "Search Quality Rater Certification Prep Kit", fulfillmentType: "digital", brand: "locklayer", expectOk: false },
  // Other slop from prior misroutings
  { label: "nicu-nurse", title: "NICU Nurse Mom Pride Apparel Line", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: false },
  { label: "german-shepherd-dad", title: "German Shepherd Dad Premium Hoodies", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: false },
  { label: "crossfit-mom", title: "Crossfit Mom Performance Leggings", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: false },
  { label: "faith-scripture", title: "Faith Scripture Wall Art for Specific Denominations", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: false },

  // ── Legitimate Black Vault concepts (must accept) ──────────────────────
  { label: "vault-tee", title: "The Vault Tee", productServiceType: "Tee", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: true },
  { label: "monogram-tee", title: "The Monogram Tee", productServiceType: "Tee", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: true },
  { label: "heavyweight-hoodie", title: "The Heavyweight Hoodie", productServiceType: "Hoodie", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: true },
  { label: "performance-polo", title: "The Performance Polo", productServiceType: "Polo", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: true },
  { label: "cropped-tee", title: "The Cropped Tee", productServiceType: "Women's Tee", fulfillmentType: "printful", brand: "black-vault-apparel", expectOk: true },

  // ── Legitimate LockLayer concepts (must accept) ────────────────────────
  { label: "smart-lock", title: "Bluetooth Smart Fingerprint Door Lock", productServiceType: "Smart Lock", fulfillmentType: "zendrop", brand: "locklayer", expectOk: true },
  { label: "doorbell-cam", title: "1080p Smart Doorbell Camera", productServiceType: "Camera", fulfillmentType: "zendrop", brand: "locklayer", expectOk: true },
  { label: "smoke-detector", title: "Smoke Detector / Fire Alarm", fulfillmentType: "zendrop", brand: "locklayer", expectOk: true }
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const result = evaluateBrandFit(
    { title: c.title, productServiceType: c.productServiceType },
    c.fulfillmentType,
    c.brand
  );
  const ok = result.ok === c.expectOk;
  if (ok) {
    pass += 1;
    console.log(`  ✓  [${c.label}] expected ${c.expectOk ? "ok" : "rejected"} — ${result.ok ? "ok" : "rejected"}${result.ok ? "" : ` (${result.reason})`}`);
  } else {
    fail += 1;
    console.log(`  ✗  [${c.label}] expected ${c.expectOk ? "OK" : "REJECT"} — got ${result.ok ? "OK" : "REJECT"}${result.ok ? "" : ` (${result.reason})`}`);
    console.log(`     title: "${c.title}"`);
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
