// Tests for the bg-composite library. None of these tests make API calls —
// they exercise the pure-sharp paths (cutoutComposite with alreadyTransparent,
// sharpFlatWhiteCutout) and verify the BV mock background asset is wired
// correctly.
//
// Run with:
//   node --require ./scripts/server-only-stub.cjs --import tsx --test tests/bg-composite.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {
  BV_MOCK_BG_PATH,
  cutoutComposite,
  sharpFlatWhiteCutout
} from "../lib/bg-composite";

test("BV_MOCK_BG_PATH resolves to a real PNG", async () => {
  assert.equal(typeof BV_MOCK_BG_PATH, "string");
  assert.ok(BV_MOCK_BG_PATH.endsWith(".png"));
  assert.ok(fs.existsSync(BV_MOCK_BG_PATH), `BV mock BG missing at ${BV_MOCK_BG_PATH}`);
  const meta = await sharp(BV_MOCK_BG_PATH).metadata();
  assert.ok((meta.width ?? 0) >= 800, "BG should be at least 800px wide");
  assert.ok((meta.height ?? 0) >= 800, "BG should be at least 800px tall");
});

test("cutoutComposite alreadyTransparent skips the API call and produces a PNG", async () => {
  // Build a synthetic 256x256 transparent PNG with a red square in the middle —
  // stand-in for a cut-out subject.
  const subject = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      {
        input: {
          create: {
            width: 96,
            height: 192,
            channels: 4,
            background: { r: 220, g: 50, b: 60, alpha: 1 }
          }
        },
        left: 80,
        top: 32
      }
    ])
    .png()
    .toBuffer();

  const result = await cutoutComposite(subject, { alreadyTransparent: true });
  const meta = await sharp(result).metadata();

  // Should match the BV BG dimensions (the composite uses the BG as the canvas).
  const bgMeta = await sharp(BV_MOCK_BG_PATH).metadata();
  assert.equal(meta.width, bgMeta.width);
  assert.equal(meta.height, bgMeta.height);
  assert.equal(meta.format, "png");
});

test("cutoutComposite respects subjectHeightFrac", async () => {
  // Bright opaque green subject so we can sample raw pixels and confirm
  // the smaller-scale composite covers fewer pixels than the larger.
  const subject = await sharp({
    create: {
      width: 200,
      height: 400,
      channels: 4,
      background: { r: 80, g: 200, b: 120, alpha: 1 }
    }
  })
    .png()
    .toBuffer();

  const small = await cutoutComposite(subject, {
    alreadyTransparent: true,
    subjectHeightFrac: 0.2
  });
  const large = await cutoutComposite(subject, {
    alreadyTransparent: true,
    subjectHeightFrac: 0.95
  });

  // Count green-ish pixels in each output; the larger-scale composite
  // should have noticeably more.
  const countGreen = async (buf: Buffer) => {
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    let n = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > 150 && r < 150 && b < 200) n += 1;
    }
    return n;
  };

  const smallGreen = await countGreen(small);
  const largeGreen = await countGreen(large);
  assert.ok(largeGreen > smallGreen * 2, `expected large (${largeGreen}) >> small (${smallGreen})`);
});

test("sharpFlatWhiteCutout removes a near-white background and returns transparent PNG", async () => {
  // 100x100 image: white bg with a small black square in the middle.
  const input = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([
      {
        input: {
          create: {
            width: 30,
            height: 30,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 1 }
          }
        },
        left: 35,
        top: 35
      }
    ])
    .png()
    .toBuffer();

  const out = await sharpFlatWhiteCutout(input);
  const { data, info } = await sharp(out)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  assert.equal(info.channels, 4);

  // Pixel (5, 5) should be transparent (was white, edge-reachable).
  const cornerIdx = (5 * info.width + 5) * 4;
  assert.equal(data[cornerIdx + 3], 0, "edge corner should be fully transparent");

  // Pixel (50, 50) should be opaque (the black square).
  const centerIdx = (50 * info.width + 50) * 4;
  assert.ok(data[centerIdx + 3] > 200, "center black pixel should remain mostly opaque");
});
