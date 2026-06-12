// Tests for the print-file DPI/quality check used by the tenant Printful
// auto-build path (2026-06-10). The merchant supplies their own print-ready art;
// checkPrintFileQuality warns (never blocks) when it's too low-res or lacks
// transparency. This is the "DPI warning" from the auto-vs-mirror product
// decision.
//
// Run with:
//   node --require ./tests/env-stub.cjs --require ./scripts/server-only-stub.cjs --import tsx --test tests/print-file-quality.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { checkPrintFileQuality } from "../lib/product-materialization";

async function makePng(width: number, height: number, transparent: boolean): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: transparent ? 4 : 3,
      background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 255, g: 255, b: 255 }
    }
  })
    .png()
    .toBuffer();
}

test("low-resolution print file produces a DPI/size warning", async () => {
  const warnings = await checkPrintFileQuality(await makePng(800, 800, true));
  assert.ok(
    warnings.some((w) => /1800px|DPI|soft/i.test(w)),
    `expected a resolution warning, got: ${JSON.stringify(warnings)}`
  );
});

test("high-resolution transparent PNG produces no resolution warning", async () => {
  const warnings = await checkPrintFileQuality(await makePng(2000, 2000, true));
  assert.ok(
    !warnings.some((w) => /1800px/.test(w)),
    `expected no resolution warning, got: ${JSON.stringify(warnings)}`
  );
});

test("opaque (non-transparent) print file warns about missing transparency", async () => {
  const warnings = await checkPrintFileQuality(await makePng(2000, 2000, false));
  assert.ok(
    warnings.some((w) => /transparen|background/i.test(w)),
    `expected a transparency warning, got: ${JSON.stringify(warnings)}`
  );
});

test("an unreadable buffer warns instead of throwing", async () => {
  const warnings = await checkPrintFileQuality(Buffer.from("not an image"));
  assert.ok(warnings.length > 0);
});
