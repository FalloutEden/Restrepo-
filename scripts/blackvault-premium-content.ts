// Premium storefront content for Black Vault Apparel.
//
// Idempotent script that:
//   1. Upserts five brand pages — About, Story, Craft, Care, Contact —
//      with on-voice copy in the BV register (Aimé Leon Dore / James Perse /
//      Travis Mathew tier — material-specific, no slogans, no occupation
//      gating, no aspirational filler).
//   2. Updates the body_html on the eight smart collections that already
//      exist in the store (Women, Men, Whites, Tees, Outerwear, Polos,
//      Bottoms, Accessories) with collection-specific premium copy.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-premium-content.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";

// ── Shopify helpers ─────────────────────────────────────────────────────

async function shopifyRest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit): Promise<T> {
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

// ── Page upsert ─────────────────────────────────────────────────────────

type PageSpec = { handle: string; title: string; body_html: string };

async function upsertPage(creds: ShopifyCredentials, spec: PageSpec) {
  // List by handle
  const list = await shopifyRest<{ pages: Array<{ id: number; handle: string }> }>(
    creds,
    `/pages.json?handle=${encodeURIComponent(spec.handle)}&limit=1`,
    { method: "GET" }
  );
  const existing = list.pages?.[0];
  if (existing) {
    await shopifyRest(creds, `/pages/${existing.id}.json`, {
      method: "PUT",
      body: JSON.stringify({
        page: { id: existing.id, title: spec.title, body_html: spec.body_html, published: true }
      })
    });
    console.log(`  ↻ ${spec.handle} (updated id=${existing.id})`);
    return;
  }
  await shopifyRest(creds, `/pages.json`, {
    method: "POST",
    body: JSON.stringify({
      page: { handle: spec.handle, title: spec.title, body_html: spec.body_html, published: true }
    })
  });
  console.log(`  ✓ ${spec.handle} (created)`);
}

// ── Smart collection update ─────────────────────────────────────────────

async function updateSmartCollectionBody(creds: ShopifyCredentials, handle: string, body_html: string) {
  const list = await shopifyRest<{ smart_collections: Array<{ id: number; handle: string }> }>(
    creds,
    `/smart_collections.json?handle=${encodeURIComponent(handle)}&limit=1`,
    { method: "GET" }
  );
  const existing = list.smart_collections?.[0];
  if (!existing) {
    console.warn(`  ✗ ${handle} not found — skipping (run blackvault-collections.ts first)`);
    return;
  }
  await shopifyRest(creds, `/smart_collections/${existing.id}.json`, {
    method: "PUT",
    body: JSON.stringify({
      smart_collection: { id: existing.id, body_html }
    })
  });
  console.log(`  ↻ ${handle} (id=${existing.id})`);
}

// ── Premium pages content ──────────────────────────────────────────────────

const PAGES: PageSpec[] = [
  {
    handle: "about",
    title: "About",
    body_html: `
<p>Black Vault Apparel makes premium essentials. Heavyweight cotton, considered cuts, restrained design. Each piece carries the BV monogram embroidered in Old Gold at the chest — the only graphic on the garment, the only thing it has to say.</p>

<p>We make for a wardrobe that gets worn, not curated. The piece you reach for first. The piece you don&rsquo;t have to think about. The kind of garment that disappears into the rotation and earns its place there for years.</p>

<p>Every piece is selected for material weight, construction, and the kind of quiet confidence that doesn&rsquo;t go out of style. Heavyweight 6.5+ oz combed ring-spun cotton. Side-seamed and single-needle stitched. Ring-spun, garment-dyed, organic where it matters. Embroidered, not printed — because thread doesn&rsquo;t fade.</p>

<p><em>Built to be Kept.</em></p>
`.trim()
  },
  {
    handle: "story",
    title: "Story",
    body_html: `
<h2>Why we made this</h2>
<p>Most apparel is built to be replaced. A small share is built to be kept. The first kind never feels right — thin, pilled, faded, gone in eighteen months. The second kind shows up in your closet for a decade and gets better the longer you wear it.</p>

<p>Black Vault Apparel exists for the second kind.</p>

<h2>The aesthetic</h2>
<p>Quiet. Dark. Considered. The kind of clothing you put on and stop thinking about.</p>

<p>Our reference points are not the loud ones. Aimé Leon Dore in Queens. James Perse on the West Coast. Brunello Cucinelli in Solomeo. Travis Mathew on the back nine. Theory in a midtown elevator. Each of those brands answers a different question, but they share an answer to this one: <em>does this still look right after a hundred wears.</em></p>

<p>Our answer: yes, because we built it to.</p>

<h2>The mark</h2>
<p>The BV monogram is embroidered in Old Gold thread on the chest of every garment. It is the only graphic on the piece. It will not fade, peel, or crack — thread doesn&rsquo;t do those things.</p>

<p>The position is the left chest, the size is small (the way Travis Mathew and Live Lucky do it, not the way Polo Ralph Lauren does it). The mark is intended to be noticed at conversational distance, not across a room.</p>

<h2>The vault</h2>
<p>We call the collection &ldquo;the vault&rdquo; because that&rsquo;s how it&rsquo;s meant to be treated. A small set of essentials, chosen with care, kept with care, worn until they&rsquo;ve earned their place. We don&rsquo;t do drops, we don&rsquo;t do collaborations, and we don&rsquo;t add SKUs to chase trends.</p>

<p>What we add, we add slowly. What we remove, we remove only when the replacement is genuinely better.</p>

<h2>Built to be Kept</h2>
<p>Three words. They&rsquo;re on the inside of every garment, embroidered into the neck label. They are also the test — every fabric choice, every stitch spec, every embellishment decision passes or fails on whether it makes the garment more keepable. If it doesn&rsquo;t, it doesn&rsquo;t ship.</p>
`.trim()
  },
  {
    handle: "craft",
    title: "Craft",
    body_html: `
<h2>Material first</h2>
<p>The cheapest way to make apparel feel cheap is to skimp on the fabric. The cheapest way to make it feel premium is to spend on the fabric. Everything else follows from that decision.</p>

<p>Our blanks are sourced from Cotton Heritage, Comfort Colors, AS Colour, Lane Seven, Stanley/Stella, Bella+Canvas, and Port Authority — the heavyweight tier of each catalog, never the budget. Where weight matters, we choose 8&ndash;10 oz over 4&ndash;5 oz. Where construction matters, we choose side-seamed over tubular knit, ring-spun over open-end, combed over carded.</p>

<p>You can feel the difference in the hand. You can see it in the drape. You will notice it forty washes from now, when the cheap version has thinned out and ours has just started to soften.</p>

<h2>Specifics by category</h2>

<h3>Tees</h3>
<p>The Vault Tee — Comfort Colors 1717, 6.1 oz garment-dyed heavyweight cotton. Pigment-dyed for a soft hand and the kind of lived-in patina that only happens with proper garment dye, not surface print.</p>
<p>The Monogram Tee — Cotton Heritage MC1086, 6.5 oz / 220 GSM combed ring-spun cotton. Side-seamed. 1&times;1 rib collar. Single-needle edge stitch. Pre-shrunk.</p>

<h3>Outerwear</h3>
<p>The Heavyweight Hoodie — Stanley/Stella SASU024, 10.3 oz / 350 GSM GOTS-certified organic cotton fleece. Drop-shoulder oversized cut. Double-stitched seams.</p>
<p>The Crewneck — Lane Seven LS14004, 8.25 oz / 280 GSM mid-weight cotton-blend fleece. Ribbed cuffs and hem. Classic relaxed cut.</p>

<h3>Long sleeve</h3>
<p>The Long Sleeve — AS Colour 5081, 8.2 oz / 278 GSM heavyweight cotton. Drop shoulder. Regular fit.</p>

<h3>Polo</h3>
<p>The Polo — Port Authority K500, premium pique knit. Three-button placket. Side vents. Double-needle hem.</p>

<h2>Embroidery, not print</h2>
<p>Every BV piece carries an embroidered chest mark, not a printed one. Embroidery has a tactile quality print can&rsquo;t match — the customer&rsquo;s fingers find the stitching before their eye finds the graphic. It also outlasts the garment: a printed logo fades after fifty washes, embroidered thread does not.</p>

<p>The thread is Madeira Old Gold (#A67843) — warm metallic, deliberately less flashy than yellow gold. Sized small at the chest, in the spirit of Travis Mathew or Live Lucky, not Polo Ralph Lauren. Tone-matched on dark garments. Restrained on white ones.</p>

<h2>What we do not do</h2>
<ul>
  <li>We do not screen-print or DTG. Print is a substrate problem disguised as a design problem.</li>
  <li>We do not use blends below 95% cotton on tees and hoodies. Polyester has its place; that place is performance polos and athletic wear, not heritage essentials.</li>
  <li>We do not chase drops, holiday collections, or seasonal capsules. The collection is the collection until something replaces it.</li>
  <li>We do not put the brand name on the front of the garment. The wearer is the focal point, not the logo.</li>
</ul>
`.trim()
  },
  {
    handle: "care",
    title: "Care",
    body_html: `
<p>Premium cotton and embroidery deserve a few minutes of attention. Followed properly, these instructions extend the life of every Black Vault piece — that&rsquo;s the entire point.</p>

<h2>Washing</h2>
<ul>
  <li>Turn the garment inside out before washing. Protects the embroidery and the fabric face.</li>
  <li>Cold water, gentle cycle. Hot water and aggressive agitation are what wear cotton out.</li>
  <li>Mild detergent only. Skip bleach, fabric softener, and optical brighteners — they break down fibers and dull pigment.</li>
  <li>Wash with similar colors. Dark with dark, white with white. The first three washes on a garment-dyed piece may release loose pigment.</li>
</ul>

<h2>Drying</h2>
<ul>
  <li>Tumble dry low, or hang dry flat. Hang drying preserves shape better; tumble dry is fine if low and brief.</li>
  <li>Avoid high heat. It shrinks cotton and can warp the embroidery.</li>
  <li>Reshape while damp. A heavyweight knit will hold whatever shape it dries in.</li>
</ul>

<h2>Pressing</h2>
<ul>
  <li>Iron inside out, on cotton setting, never directly on the embroidery.</li>
  <li>Steam works better than dry heat for cotton at this weight.</li>
</ul>

<h2>Storage</h2>
<ul>
  <li>Fold heavyweight knits — hangers stretch the shoulders out over time.</li>
  <li>Hang shirts and polos.</li>
  <li>Keep long-term storage cool, dry, away from direct sunlight. Cotton is a natural fiber; it lasts longer when treated like one.</li>
</ul>

<h2>If something goes wrong</h2>
<p>If a stitch comes loose, the fabric thins, or anything else looks off — email <a href="mailto:support@blackvaultapparel.com">support@blackvaultapparel.com</a>. We&rsquo;ll figure it out.</p>
`.trim()
  },
  {
    handle: "contact",
    title: "Contact",
    body_html: `
<h2>Customer support</h2>
<p>Email: <a href="mailto:support@blackvaultapparel.com">support@blackvaultapparel.com</a></p>
<p>We respond Monday through Friday, generally within 1&ndash;2 business days. Messages received on weekends or U.S. holidays will be answered the next business day.</p>

<h2>What we can help with</h2>
<ul>
  <li>Order status, tracking, and delivery questions</li>
  <li>Sizing guidance and fit recommendations</li>
  <li>Returns, exchanges, and refunds</li>
  <li>Defective items, print errors, or shipping damage — please attach photos</li>
  <li>Press, partnerships, and wholesale inquiries</li>
</ul>

<h2>For the fastest response</h2>
<p>Include your order number, the email used at checkout, and a short description of what&rsquo;s going on. If you&rsquo;re writing about a specific product, the SKU on the order confirmation helps us track it down faster.</p>

<h2>Business information</h2>
<p>Black Vault Apparel</p>
<p>Utah, United States</p>
`.trim()
  }
];

// ── Premium collection copy ────────────────────────────────────────────────

const COLLECTIONS: Array<{ handle: string; body_html: string }> = [
  {
    handle: "women",
    body_html: `
<p>The women&rsquo;s line. Same monogram, same brand, sized for the cut. We did not make a separate brand-mark for women&rsquo;s pieces and we did not give them softer language. The standard is the same as the men&rsquo;s vault: heavyweight cotton, considered cuts, restrained design.</p>

<p>What changes is the silhouette. Cropped tees, relaxed-fit boyfriend tees, and pullover hoodies — sized and shaped for the women&rsquo;s line, not shrunken from a men&rsquo;s pattern.</p>

<p><em>Built to be Kept.</em></p>
`.trim()
  },
  {
    handle: "men",
    body_html: `
<p>The vault. Heavyweight cotton, considered cuts, embroidered, never printed. Each piece carries the BV monogram in Old Gold at the chest — small, deliberate, the kind of mark that earns a second look at conversational distance.</p>

<p>This is the rotation. The set of essentials you reach for first, three years in.</p>

<p><em>Built to be Kept.</em></p>
`.trim()
  },
  {
    handle: "whites",
    body_html: `
<p>White is the hardest color to do well. It reveals every shortcut in the fabric, every weak seam, every thin spot. Which is precisely why we started here.</p>

<p>Our whites are cut from the same heavyweight specs as our blacks — 6.1&ndash;10.3 oz combed ring-spun cotton, garment-dyed where the piece calls for it, organic where it matters. Old Gold thread on white reads as a soft metallic whisper instead of a statement. The Tom Ford effect, on a tee.</p>
`.trim()
  },
  {
    handle: "tees",
    body_html: `
<p>The foundation pieces. Two weights, two finishes, both heavy.</p>

<p>The Vault Tee — Comfort Colors 1717, garment-dyed for a soft hand from the first wear. Each piece arrives with subtle color variation, the mark of true garment dye.</p>

<p>The Monogram Tee — Cotton Heritage MC1086, 6.5 oz combed ring-spun, side-seamed and single-needle stitched. The structured one. Holds its line through the wash.</p>

<p>Both carry the BV monogram embroidered in Old Gold at the left chest. Built to be Kept.</p>
`.trim()
  },
  {
    handle: "outerwear",
    body_html: `
<p>The cold-weather anchors. Mid-weight to heavyweight knits, cut for layering and built for keeping.</p>

<p>The Heavyweight Hoodie — 10.3 oz GOTS-certified organic cotton, drop-shoulder relaxed cut, double-stitched seams. The kind of weight you reach for when nothing else feels substantial enough.</p>

<p>The Crewneck — 8.25 oz mid-weight ring-spun blend, ribbed cuffs and hem, classic relaxed cut. Layers over an oxford or wears alone.</p>

<p>Both available in black and white, embroidered chest, no front graphic.</p>
`.trim()
  },
  {
    handle: "polos",
    body_html: `
<p>Premium pique knit, three-button placket, embroidered chest mark — never printed.</p>

<p>The Polo is built for the everyday: the meeting that turned into a lunch, the round of golf that turned into the clubhouse, the in-between moments where a tee feels too casual and a button-up feels too much. It takes a tuck or wears loose. It pairs with denim or with a chino.</p>

<p>Available in black and white.</p>
`.trim()
  },
  {
    handle: "bottoms",
    body_html: `
<p>Heavyweight cotton fleece. The off-duty essential, made to be lived in.</p>

<p>The Sweatpants — Bella+Canvas 4737, structured tapered cut, heavyweight fleece interior. Embroidered Old Gold mark on the hip. Sized to be worn out of the house, not just around it.</p>
`.trim()
  },
  {
    handle: "accessories",
    body_html: `
<p>The supporting pieces. Caps, socks, the small additions to the vault.</p>

<p>Each is sized small and finished with the same restraint as the apparel — embroidered, never printed; tone-matched, never loud. Worn alone they read as quiet confidence. Worn with the rotation they read as a complete set.</p>
`.trim()
  }
];

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] brand=${BRAND} store=${creds.storeDomain}\n`);

  console.log("=== Pages ===");
  for (const page of PAGES) {
    try {
      await upsertPage(creds, page);
    } catch (e) {
      console.warn(`  ✗ ${page.handle}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log("\n=== Collection descriptions ===");
  for (const col of COLLECTIONS) {
    try {
      await updateSmartCollectionBody(creds, col.handle, col.body_html);
    } catch (e) {
      console.warn(`  ✗ ${col.handle}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\n✓ Done. Visit https://${creds.storeDomain}/pages/about to verify.`);
  console.log(`Pages live at /pages/about, /pages/story, /pages/craft, /pages/care, /pages/contact`);
}

main().catch((e) => { console.error(e); process.exit(1); });
