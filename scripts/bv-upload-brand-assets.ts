// Upload BV brand assets to Shopify Files so the email + ad templates have
// real CDN URLs to reference. Idempotent — re-running uploads only the
// assets that aren't already in the manifest. Writes the URL map to
// .openclaw/brand/asset-cdn-urls.json which the email-template substitution
// step (manual or scripted) can consume.
//
// Run:
//   node --env-file=.env.local --import tsx scripts/bv-upload-brand-assets.ts
//
// Optional flags:
//   --force        re-upload even if a URL is already in the manifest
//   --dry          list what would be uploaded and exit
//   --include glob substring filter (e.g. --include hero will only upload hero*)

import fs from "node:fs";
import path from "node:path";

import { uploadBufferToShopifyFiles } from "@/lib/shopify-service";

type Manifest = Record<string, { filename: string; url: string; uploadedAt: string }>;

const BRAND = "black-vault-apparel";
const BRAND_DIR = path.join(process.cwd(), ".openclaw", "brand");
const MANIFEST_PATH = path.join(BRAND_DIR, "asset-cdn-urls.json");

// Curated whitelist — only these get uploaded. Anything else stays local.
// Add to this list when a new evergreen asset becomes part of the brand kit.
const ASSETS: { localFile: string; key: string; mimeType?: string }[] = [
  { localFile: "BV Gold.png", key: "bv_logo_gold" },
  { localFile: "BV Monogram.png", key: "bv_monogram" },
  { localFile: "BV Transparent.png", key: "bv_logo_transparent" },
  { localFile: "BV apparel.png", key: "bv_wordmark" },
  { localFile: "BV Liquid Background.png", key: "bv_bg_liquid" },
  { localFile: path.join("Mock Up BG", "BG BV Mock.png"), key: "bv_mock_bg" },
  { localFile: "hero.png", key: "hero" },
  { localFile: "hero-final.png", key: "hero_final" }
];

type Args = { force: boolean; dry: boolean; include: string | null };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : null;
  };
  return {
    force: argv.includes("--force"),
    dry: argv.includes("--dry"),
    include: get("--include")
  };
}

async function loadManifest(): Promise<Manifest> {
  try {
    const raw = await fs.promises.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw) as Manifest;
  } catch {
    return {};
  }
}

async function saveManifest(manifest: Manifest) {
  await fs.promises.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

function detectMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

async function main() {
  const args = parseArgs();
  const manifest = await loadManifest();

  let plan = ASSETS.filter((a) => fs.existsSync(path.join(BRAND_DIR, a.localFile)));
  const missingFromDisk = ASSETS.filter((a) => !fs.existsSync(path.join(BRAND_DIR, a.localFile)));
  if (missingFromDisk.length > 0) {
    console.log(
      `[upload] skipping ${missingFromDisk.length} assets not on disk: ${missingFromDisk.map((m) => m.localFile).join(", ")}`
    );
  }
  if (args.include) {
    plan = plan.filter((a) => a.localFile.toLowerCase().includes(args.include!.toLowerCase()));
  }
  if (!args.force) {
    plan = plan.filter((a) => !manifest[a.key]);
  }

  console.log(`[upload] ${plan.length} asset(s) to upload (${args.dry ? "DRY RUN" : "live"})`);
  for (const a of plan) console.log(`  - ${a.key}  ${a.localFile}`);

  if (args.dry || plan.length === 0) {
    if (plan.length === 0) console.log("[upload] nothing to do");
    return;
  }

  for (const a of plan) {
    const filePath = path.join(BRAND_DIR, a.localFile);
    const buffer = await fs.promises.readFile(filePath);
    const mimeType = a.mimeType ?? detectMimeType(a.localFile);
    const filename = path.basename(a.localFile);
    console.log(`[upload] uploading ${filename} (${(buffer.length / 1024).toFixed(0)} KB) as key=${a.key}`);
    try {
      const result = await uploadBufferToShopifyFiles(filename, mimeType, buffer, BRAND);
      manifest[a.key] = {
        filename,
        url: result.url,
        uploadedAt: new Date().toISOString()
      };
      await saveManifest(manifest);
      console.log(`[upload] ✓ ${a.key} → ${result.url}`);
    } catch (e) {
      console.error(`[upload] ✗ ${a.key} failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  console.log(`\n[upload] manifest saved to ${MANIFEST_PATH}`);
  console.log("[upload] paste these URLs into the email/ad templates wherever {{*_URL}} appears:");
  for (const [key, entry] of Object.entries(manifest)) {
    console.log(`  ${key.padEnd(24)}  ${entry.url}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
