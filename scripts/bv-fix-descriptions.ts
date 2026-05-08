// One-shot fix for BV product description hygiene flagged in Karling's audit:
//   1. The Long Sleeve (7623582089314) — drop "from AS Colour" supplier mention
//   2. The Polo / performance pique (7623687864418) — drop "Travis Mathew /
//      Live Lucky territory" competitor comparison + retitle to disambiguate
//   3. The Polo / AOP slim-fit (7629242368098) — retitle to "The AOP Polo —
//      Men's" so it doesn't collide with the performance polo
//
// Run:
//   node --require ./scripts/server-only-stub.cjs --env-file=.env.local --import tsx scripts/bv-fix-descriptions.ts

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";

const BRAND = "black-vault-apparel";

async function rest<T>(creds: ShopifyCredentials, endpoint: string, init: RequestInit = {}): Promise<T> {
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

const FIXES: Array<{
  id: number;
  newTitle?: string;
  newBodyHtml: string;
  reason: string;
}> = [
  {
    id: 7623582089314,
    reason: "Long Sleeve: drop 'from AS Colour' supplier mention",
    newBodyHtml:
      "<p>An 8.2 oz / 278 GSM heavyweight long-sleeve in 100% combed ring-spun cotton. The BV monogram is embroidered in Old Gold thread at the left chest. Regular fit. Drop shoulder. The off-season anchor — built for layering through the in-between months. Built to be Kept.</p>"
  },
  {
    id: 7623687864418,
    newTitle: "The Performance Polo",
    reason: "Performance Polo: drop competitor comparison + rename to disambiguate from AOP Polo",
    newBodyHtml:
      "<p>A tailored-fit performance pique polo. 65% polyester / 35% cotton blend with 4-way stretch — built to wick, hold shape, and drape clean over a frame. The BV monogram is embroidered in Old Gold thread at the left chest. The clubhouse polo, sized clean. Built to be Kept.</p>"
  },
  {
    id: 7629242368098,
    newTitle: "The AOP Polo — Men's",
    reason: "AOP Polo: rename to disambiguate from Performance Polo (matches AOP capsule naming)",
    newBodyHtml:
      "<p>A men's all-over-print slim-fit polo. The BV monogram tiles edge to edge across the body, framed by gold diagonal grid lines and 4-point stars at every intersection. Cut-sewn so the print continues unbroken across panel seams. Smooth color-locked polyester. Ribbed collar. Built to be Kept.</p>"
  }
];

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[fix-descriptions] applying ${FIXES.length} fixes to ${creds.storeDomain}\n`);

  for (const fix of FIXES) {
    console.log(`→ ${fix.id}: ${fix.reason}`);
    try {
      const productUpdate: Record<string, unknown> = {
        id: fix.id,
        body_html: fix.newBodyHtml
      };
      if (fix.newTitle) productUpdate.title = fix.newTitle;

      await rest(creds, `/products/${fix.id}.json`, {
        method: "PUT",
        body: JSON.stringify({ product: productUpdate })
      });
      console.log(`  ✓ updated${fix.newTitle ? ` (title → "${fix.newTitle}")` : ""}\n`);
      // Be polite to Shopify rate limits
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.log(`  ✗ failed: ${e instanceof Error ? e.message : "unknown"}\n`);
    }
  }

  // Verify by re-reading
  console.log("[verify] re-reading from Shopify…\n");
  for (const fix of FIXES) {
    const data = await rest<{ product: { id: number; title: string; body_html: string } }>(
      creds,
      `/products/${fix.id}.json?fields=id,title,body_html`
    );
    const text = data.product.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    console.log(`  ${data.product.id} | "${data.product.title}"`);
    console.log(`    ${text.slice(0, 160)}${text.length > 160 ? "…" : ""}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
