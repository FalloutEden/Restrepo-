// Create the brand-voiced pages on the Black Vault Apparel Shopify store:
// About, Care, Contact. Voice matches lib/brands.ts (Psycho Bunny / Murano /
// James Perse / Theory tier — material-specific, no slogans, no occupation
// gating, no aspirational filler).
//
// Idempotent: looks up existing page by handle and updates instead of creating
// a duplicate.
//
// Run with:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-create-pages.ts

import { resolveShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";

type ShopifyCreds = { storeDomain: string; apiVersion: string; token: string };

async function shopifyRest<T>(creds: ShopifyCreds, endpoint: string, init: RequestInit) {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}${endpoint}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": creds.token,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Shopify ${init.method ?? "GET"} ${endpoint} (${r.status}): ${text}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

type PageSpec = { handle: string; title: string; body_html: string };

const PAGES: PageSpec[] = [
  {
    handle: "about",
    title: "About",
    body_html: `
<p>Black Vault Apparel makes premium essentials. Heavyweight cotton, considered cuts, restrained design. Each piece carries the BV monogram embroidered in Old Gold at the chest — the only graphic on the garment, the only thing it has to say.</p>

<p>We started Black Vault on a simple observation: most apparel is built to be replaced, and a small share is built to be kept. The first kind never feels right. The second kind shows up in your closet for a decade and gets better the longer you wear it.</p>

<p>Every piece in the vault is selected for material, construction, and the kind of quiet confidence that doesn't go out of style. Heavyweight 6.5+ oz cotton. Side-seamed and single-needle stitched. Ring-spun, garment-dyed, organic where it matters. Embroidered, not printed — because thread doesn't fade.</p>

<p>We make for a wardrobe that gets worn, not curated. The piece you reach for first. The piece you don't have to think about.</p>

<p><em>Built to be Kept.</em></p>
`.trim()
  },
  {
    handle: "care",
    title: "Care",
    body_html: `
<p>Premium cotton and embroidery deserve a few minutes of attention. Followed properly, these instructions extend the life of every Black Vault piece — that's the entire point.</p>

<h3>Washing</h3>
<ul>
  <li>Turn the garment inside out before washing. Protects the embroidery and the fabric face.</li>
  <li>Cold water, gentle cycle. Hot water and aggressive agitation are what wear cotton out.</li>
  <li>Mild detergent only. Skip bleach, fabric softener, and optical brighteners — they break down fibers and dull pigment.</li>
  <li>Wash with similar colors. Garment-dyed pieces (The Vault Tee) will release a small amount of pigment in early washes; this is normal and expected.</li>
</ul>

<h3>Drying</h3>
<ul>
  <li>Hang dry whenever possible. The dryer is the single biggest cause of premature wear on heavyweight cotton.</li>
  <li>If you must use the dryer: low heat, remove while slightly damp, lay flat or hang to finish.</li>
</ul>

<h3>Embroidery</h3>
<ul>
  <li>The BV monogram is embroidered in Old Gold thread. It will not fade or crack the way printed graphics do — but the cotton around it can wrinkle. Iron the surrounding fabric gently if needed; do not iron directly over the embroidery.</li>
</ul>

<h3>Storage</h3>
<ul>
  <li>Fold heavier pieces (hoodies, crewnecks). Hangers stretch shoulder seams over time.</li>
  <li>Tees can be folded or hung — preference, not durability.</li>
</ul>

<p>Treated this way, every piece in the vault should outlast every trend cycle it lives through. That's the deal.</p>
`.trim()
  },
  {
    handle: "contact",
    title: "Contact",
    body_html: `
<p>For order questions, sizing, returns, or anything else: <a href="mailto:support@blackvaultapparel.com">support@blackvaultapparel.com</a>.</p>

<p>We respond within one business day, usually faster.</p>

<p>For wholesale, press, or partnership inquiries: <a href="mailto:hello@blackvaultapparel.com">hello@blackvaultapparel.com</a>.</p>
`.trim()
  }
];

async function upsertPage(creds: ShopifyCreds, spec: PageSpec) {
  // Look up existing page by handle
  const existing = await shopifyRest<{ pages: Array<{ id: number; handle: string }> }>(
    creds,
    `/pages.json?handle=${encodeURIComponent(spec.handle)}&fields=id,handle`,
    { method: "GET" }
  );
  const found = existing.pages?.find((p) => p.handle === spec.handle);

  if (found) {
    await shopifyRest(creds, `/pages/${found.id}.json`, {
      method: "PUT",
      body: JSON.stringify({
        page: {
          id: found.id,
          title: spec.title,
          body_html: spec.body_html,
          published: true
        }
      })
    });
    console.log(`[${spec.handle}] updated existing page ${found.id}`);
    return found.id;
  }

  const created = await shopifyRest<{ page?: { id: number; handle?: string } }>(
    creds,
    `/pages.json`,
    {
      method: "POST",
      body: JSON.stringify({
        page: {
          title: spec.title,
          handle: spec.handle,
          body_html: spec.body_html,
          published: true
        }
      })
    }
  );
  const id = created.page?.id;
  if (!id) throw new Error(`Failed to create page ${spec.handle}`);
  console.log(`[${spec.handle}] created page ${id}`);
  return id;
}

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] brand=${creds.brandSlug} store=${creds.storeDomain}`);
  for (const spec of PAGES) {
    try {
      const id = await upsertPage(creds, spec);
      console.log(`  → https://${creds.storeDomain}/admin/pages/${id}`);
    } catch (e) {
      console.warn(`[${spec.handle}] failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log("\nDone.");
  console.log("\nNext (Shopify admin steps you'll need to do manually):");
  console.log("  - Settings → Policies → generate or paste in Privacy / Refund / Shipping / TOS templates (Shopify provides defaults).");
  console.log("  - Online Store → Navigation → add About, Care, Contact to the footer menu.");
  console.log("  - Settings → General → set the contact email to support@blackvaultapparel.com.");
}

main().catch((e) => { console.error(e); process.exit(1); });
