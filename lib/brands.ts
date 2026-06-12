// Brand registry. Restrepo is the parent project / automation framework;
// LockLayer and Black Vault Apparel are the customer-facing brands it ships
// products under. One Restrepo pipeline → many brands → many Shopify stores.
//
// Customers only ever see the brand-level identity (a LockLayer listing, a
// Black Vault Apparel listing). The "Restrepo" name lives only in the codebase
// and dashboard.

export type Brand = {
  slug: string;
  name: string;
  tagline: string;
  // 1–2 sentence voice description fed into the Claude copywriting prompt.
  // Keep it concrete: name comparable real brands, call out phrases to avoid.
  voice: string;
  audience: string;
  // Public-facing marketing/customer domain. NOT necessarily the Shopify host.
  domain?: string;
  // Optional: which Shopify storefront fulfils this brand. When unset, falls
  // back to SHOPIFY_STORE_DOMAIN env. We have one Shopify store today
  // (LockLayer) and will add Black Vault's once that store is created.
  shopifyStoreDomain?: string;
  // Default fulfillment supplier preference for this brand.
  defaultFulfillment: "printful" | "cj" | "digital";
};

export const BRANDS: Record<string, Brand> = {
  locklayer: {
    slug: "locklayer",
    name: "LockLayer",
    tagline: "Honest home security",
    voice:
      "Practical, confident, no-nonsense. Plain English. Talks about protection and peace of mind without fearmongering. Specific about features (resolution, range, battery life) instead of vague superlatives. Comparable in tone to Wyze, Eufy, and Ring. Avoids: 'cutting-edge', 'revolutionary', 'state-of-the-art', 'world-class', 'high-quality' (without specifics).",
    audience:
      "Renters, new homeowners, Airbnb hosts, parents — people who want reliable home security without paying ADT prices.",
    domain: "locklayer.com",
    defaultFulfillment: "cj"
  },
  "black-vault-apparel": {
    slug: "black-vault-apparel",
    name: "Black Vault Apparel",
    tagline: "Premium essentials, built to be kept.",
    voice:
      "Confident, considered, quietly premium. Speaks to craft, material, fit, and longevity — never to slogans, occupations, or lifestyle clichés. Treats the customer as someone with taste who doesn't need to be told a story. Comparable in tone to Psycho Bunny, Murano, James Perse, Theory, Aimé Leon Dore. Justifies premium pricing through specific material and construction language: cite exact fabric weight in oz/yd² and GSM, fiber composition (e.g. '100% combed ring-spun cotton', 'GOTS-certified organic'), construction details (side-seamed, single-needle edge stitch, 1×1 rib collar, double-stitched seams), and embellishment method (Old Gold embroidered chest, not 'printed logo'). Avoids: 'rockstar', 'hustle', 'grind', 'queen', generic inspirational quotes, occupation-specific lock-ins ('for nurses', 'for veterans'), anything that reads as fast-fashion or community merch. Tagline 'Built to be Kept' is the watchword — every piece must justify it through real material substance, not just brand voice.",
    audience:
      "Premium lifestyle buyers shopping the elevated-essentials tier at department stores (Dillard's, Nordstrom Men's) and specialty boutiques. Skews 28–55, values material and construction over branding, willing to pay $40–80 for a tee because it feels different on.",
    domain: "blackvaultapparel.com",
    defaultFulfillment: "printful"
  },
  // GthicPrintables sells on ETSY, not Shopify. Its Printful store is an
  // Etsy-platform store (API CANNOT create products/templates there — UI only).
  // Programmatic management is gated on the Etsy Open API (app pending personal
  // approval as of 2026-06-11). Registered here so the operator is brand-aware
  // and can generate designs + Etsy SEO; store ops stay manual until Etsy API.
  "gthic-printables": {
    slug: "gthic-printables",
    name: "GthicPrintables",
    tagline: "Romantic gothic, made to keep.",
    voice:
      "Romantic gothic / witchy — refined, never edgy-for-its-own-sake. Dramatic but tasteful: dark academia, occult, celestial, memento mori. Speaks to lovers of black cats, tarot, death's-head moths, moon phases, skeletal botanicals, ravens. Elegant serif sensibility with gold/cream-on-black or vintage-antique palettes. Comparable in tone to Killstar (dialed back), Disturbia, and vintage apothecary/occult print shops. Avoids: edgelord clichés, gore, try-hard 'spooky', mass-merch slogans, all-caps shouting. ETSY SEO-FIRST: every listing needs a keyword-rich descriptive title and all 13 tags (the channel is pure search).",
    audience:
      "Etsy shoppers in the gothic / witchy / dark-academia aesthetic — skews 18–40, buys stickers (fastest test), black apparel, wall art, tote bags; values vibe + craft; finds products by aesthetic keyword search.",
    domain: "etsy.com/shop/GthicPrintables",
    defaultFulfillment: "printful"
  }
};

export function resolveBrand(slug: string | undefined | null): Brand {
  if (slug && slug in BRANDS) return BRANDS[slug];
  // Default to LockLayer — it's the validated path right now. Black Vault
  // will route there once its Shopify store is set up.
  return BRANDS.locklayer;
}
