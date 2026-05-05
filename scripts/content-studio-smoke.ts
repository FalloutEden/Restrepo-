// Smoke test for the content studio. Bypasses the HTTP layer — calls the
// orchestrator directly so we verify the pipeline works without needing a
// running dev server.
//
// Usage: place at least one source photo at .openclaw/operator/content-studio/<dropId>/sources/
//        OR pass --photo=<path> and the script will copy it into a fresh drop.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/content-studio-smoke.ts --photo=.openclaw/brand/BV%20Monogram.png

import { readFile } from "node:fs/promises";

import { createDrop, addAssetToDrop, newAssetId, saveAssetFile } from "../lib/content-studio/storage";
import { generateContentDrop } from "../lib/content-studio/orchestrator";
import { videoProviderStatus } from "../lib/content-studio/video-pipeline";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const photoPath = arg("photo");
  if (!photoPath) {
    console.error("Usage: --photo=<path-to-image>");
    process.exit(1);
  }

  console.log(`[smoke] reading source photo: ${photoPath}`);
  const buffer = await readFile(photoPath);
  console.log(`[smoke] photo size: ${buffer.length} bytes`);

  console.log(`[smoke] creating drop`);
  const drop = await createDrop({
    productTitle: arg("title") ?? "The Vault Tee (smoke test)",
    brandSlug: arg("brand") ?? "black-vault-apparel"
  });
  console.log(`[smoke] drop created: ${drop.id}`);

  console.log(`[smoke] uploading source photo`);
  const saved = await saveAssetFile(drop.id, "sources", "source-0.png", buffer);
  await addAssetToDrop(drop.id, {
    id: newAssetId(),
    kind: "source_photo",
    source: "user_upload",
    filePath: saved.relativePath,
    createdAt: new Date().toISOString()
  });
  console.log(`[smoke] source photo registered`);

  console.log(`[smoke] video provider: ${JSON.stringify(videoProviderStatus())}`);

  console.log(`[smoke] running generation pipeline`);
  const result = await generateContentDrop(drop.id, {
    // Cap to 1 of each for the smoke test so the cost stays under $1.
    maxLifestyleImages: 1,
    maxModelShots: 1,
    maxVideos: 1,
    targetPlatforms: ["instagram_post", "twitter"]
  });

  console.log("\n[smoke] DONE");
  console.log(`  drop id:         ${result?.id}`);
  console.log(`  status:          ${result?.status}`);
  console.log(`  total assets:    ${result?.assets.length ?? 0}`);
  console.log(`  total posts:     ${result?.posts.length ?? 0}`);
  console.log(`  log entries:     ${result?.log.length ?? 0}`);
  if (result?.log) {
    console.log("\n[smoke] log:");
    for (const l of result.log) {
      console.log(`  [${l.level.toUpperCase()}] ${l.message}`);
    }
  }
  if (result?.posts && result.posts.length > 0) {
    console.log("\n[smoke] sample post:");
    const p = result.posts[0];
    console.log(`  platform: ${p.platform}`);
    console.log(`  caption:`);
    console.log(p.caption.split("\n").map((l) => `    ${l}`).join("\n"));
    console.log(`  hashtags: ${p.hashtags.join(" ")}`);
  }
}

main().catch((e) => {
  console.error(`[smoke] FAILED:`, e);
  process.exit(1);
});
