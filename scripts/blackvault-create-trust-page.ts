// Create or update the "The Foundation" trust/backstory page on the BV
// storefront. Distinct from the existing About page — this one's about WHY
// the brand exists and what to expect, written for someone deciding whether
// to trust a small brand they haven't heard of yet.
//
// Idempotent: if a page with the same handle already exists, it gets
// updated in place.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-create-trust-page.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";

const TRUST_PAGE = {
  handle: "the-foundation",
  title: "The Foundation",
  body_html: `
<p><em>Why Black Vault exists, and what you can expect from us.</em></p>

<h3>Why we made this</h3>

<p>Most apparel is built to be replaced. A small share is built to be kept. The first kind never quite feels right; the second kind shows up in your closet for a decade and gets better the longer you wear it. Black Vault is in the second category, deliberately.</p>

<p>We started this for a simple reason: there's a tier of essentials — heavyweight, considered, restrained — that's been priced into the territory of luxury houses, and we don't think it has to be. What you're paying for at $300 for a logo'd tee is the logo. What you're paying for at $58 for a Black Vault tee is the cotton, the seams, and the embroidery. We'd rather be honest about which of those actually wears in.</p>

<h3>What we make</h3>

<p>One brand mark — the BV monogram, embroidered in Old Gold thread at the left chest. It's the only graphic that goes on the garment. We don't print, we stitch. Thread outlasts ink, and we'd rather you reach for the piece in five years than throw it out in two.</p>

<p>Heavyweight cotton (6.1–10.3 oz / 220–350 GSM, depending on the piece). Side-seamed construction. Pre-shrunk so what you order is what you keep. Garment-dyed where it matters, ring-spun where it matters more. Made through Printful's premium fulfillment network — the same blanks lines like Aimé Leon Dore and Travis Mathew start with.</p>

<h3>What you can expect from us</h3>

<ul>
  <li><strong>Honest fit notes.</strong> Sizes run true. The Vault Tee garment-dyes to a slightly relaxed fit; the Monogram Tee runs straight; the Heavyweight Hoodie is intentionally drop-shouldered. We say this so you don't get something that doesn't work for you.</li>
  <li><strong>Real returns.</strong> Within 30 days of arrival, unworn, tags-attached, we refund you. No restocking fee. The only way we earn trust is by making it easy to take that bet.</li>
  <li><strong>Quiet release cadence.</strong> We don't run weekly drops. We don't do flash sales — every piece is priced to last, not to be discounted into trash. You'll hear from us when something we'd actually wear ourselves is ready, and not before.</li>
  <li><strong>Made-to-order, mostly.</strong> We don't hold large inventory. Each order is fulfilled through a vetted production network within ~3 business days, then shipped from a US warehouse. The trade is one-week delivery instead of two-day, in exchange for less waste and no markup on overstock.</li>
</ul>

<h3>What we're still working on</h3>

<p>We're young. We tell you that because it's true. Some categories you might want — outerwear, sleepwear, certain women's silhouettes — aren't in the vault yet. We add them as we find blanks and finishing partners that meet the standard. If something's not here, it's because we haven't said yes to it yet, not because we forgot. If there's something specific you're hoping we'd carry, write us at <a href="mailto:support@blackvaultapparel.com">support@blackvaultapparel.com</a>.</p>

<h3>The standard</h3>

<p>Everything in the vault has been worn-tested by us before it ships. We don't list a piece we wouldn't wear ourselves. We don't write copy about a fabric we haven't put through a season. The only mark of trust we ask for is the first piece — and our job is to make sure that first piece earns the second.</p>

<p><em>Reserved for those who notice.</em></p>
`.trim()
};

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

async function main() {
  const creds = resolveShopifyCredentials(BRAND);

  // Look up existing page by handle
  const existing = await shopifyRest<{ pages: Array<{ id: number; handle: string; title: string }> }>(
    creds,
    `/pages.json?handle=${TRUST_PAGE.handle}`,
    { method: "GET" }
  );

  const found = existing.pages.find((p) => p.handle === TRUST_PAGE.handle);

  if (found) {
    await shopifyRest(creds, `/pages/${found.id}.json`, {
      method: "PUT",
      body: JSON.stringify({
        page: {
          id: found.id,
          title: TRUST_PAGE.title,
          body_html: TRUST_PAGE.body_html,
          published: true
        }
      })
    });
    console.log(`✓ Updated existing page: ${TRUST_PAGE.title} (id=${found.id})`);
    console.log(`  https://${creds.storeDomain}/pages/${TRUST_PAGE.handle}`);
  } else {
    const created = await shopifyRest<{ page: { id: number; handle: string } }>(
      creds,
      `/pages.json`,
      {
        method: "POST",
        body: JSON.stringify({
          page: {
            title: TRUST_PAGE.title,
            handle: TRUST_PAGE.handle,
            body_html: TRUST_PAGE.body_html,
            published: true
          }
        })
      }
    );
    console.log(`✓ Created page: ${TRUST_PAGE.title} (id=${created.page.id})`);
    console.log(`  https://${creds.storeDomain}/pages/${created.page.handle}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
