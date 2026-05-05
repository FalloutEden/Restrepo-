// Black Vault categorization + collections.
//
// Phase 1: backfill tags on the original launch SKUs (gender, color, category)
//          so every BV product carries a consistent tag surface.
// Phase 2: create Smart Collections in Shopify that auto-include products by
//          tag — Women, Men, Whites, Tees, Hoodies, Polos, Bottoms, Accessories.
//          Smart collections update automatically when new products materialize
//          with matching tags, so the operator doesn't have to maintain
//          collection memberships.
//
// Run:
//   node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/blackvault-collections.ts

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

// ── Category mapping ──────────────────────────────────────────────────────
// Single source of truth for which Shopify product_type maps to which
// collection category. Drives both backfill tagging AND collection rules.

const CATEGORY_BY_PRODUCT_TYPE: Record<string, string> = {
  "T-Shirt": "tees",
  "Women's T-Shirt": "tees",
  "Long Sleeve T-Shirt": "tees",
  "Sweatshirt": "outerwear",
  "Hoodie": "outerwear",
  "Women's Hoodie": "outerwear",
  "Polo": "polos",
  "Sweatpants": "bottoms",
  "Hat": "accessories",
  "Socks": "accessories"
};

function inferGender(productType: string): "men" | "women" {
  return /women/i.test(productType) ? "women" : "men";
}

// ── Phase 1: tag backfill ─────────────────────────────────────────────────

type BvProduct = {
  id: number;
  title: string;
  product_type: string;
  tags: string;
};

async function backfillTags(creds: ShopifyCreds): Promise<void> {
  console.log("=== PHASE 1: tag backfill ===\n");
  const list = await shopifyRest<{ products: BvProduct[] }>(
    creds,
    "/products.json?status=draft&limit=250&fields=id,title,product_type,tags",
    { method: "GET" }
  );
  const bvProducts = list.products.filter((p) =>
    (p.tags ?? "").split(",").some((t) => t.trim() === "brand:black-vault-apparel")
  );
  console.log(`[backfill] ${bvProducts.length} BV products to inspect\n`);

  for (const p of bvProducts) {
    const tags = (p.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    const tagSet = new Set(tags);
    const before = tagSet.size;

    // Gender — infer from product_type if missing.
    if (!tags.some((t) => /^gender:/.test(t))) {
      tagSet.add(`gender:${inferGender(p.product_type)}`);
    }
    // Color — assume black on the originals (the new whites already self-tag).
    if (!tags.some((t) => /^color:/.test(t))) {
      tagSet.add("color:black");
    }
    // Category — inferred from product_type via the map above.
    if (!tags.some((t) => /^category:/.test(t))) {
      const cat = CATEGORY_BY_PRODUCT_TYPE[p.product_type];
      if (cat) tagSet.add(`category:${cat}`);
    }

    if (tagSet.size === before) {
      console.log(`  - ${p.title} (already tagged, skipping)`);
      continue;
    }

    const newTags = Array.from(tagSet).join(", ");
    await shopifyRest(creds, `/products/${p.id}.json`, {
      method: "PUT",
      body: JSON.stringify({ product: { id: p.id, tags: newTags } })
    });
    const added = Array.from(tagSet).filter((t) => !tags.includes(t));
    console.log(`  ✓ ${p.title} — added: ${added.join(", ")}`);
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log();
}

// ── Phase 2: smart collections ────────────────────────────────────────────

type SmartCollectionSpec = {
  handle: string;
  title: string;
  body_html: string;
  rules: Array<{
    column: "tag" | "type" | "vendor" | "title";
    relation: "equals" | "contains" | "starts_with";
    condition: string;
  }>;
  // disjunctive=false (default) means ALL rules must match. We use single-rule
  // collections so this doesn't matter, but explicit for clarity.
  disjunctive?: boolean;
};

const COLLECTIONS: SmartCollectionSpec[] = [
  {
    handle: "women",
    title: "Women",
    body_html:
      "<p>The women's line. Same monogram, same brand, sized for the cut.</p>",
    rules: [{ column: "tag", relation: "equals", condition: "gender:women" }]
  },
  {
    handle: "men",
    title: "Men",
    body_html:
      "<p>Heavyweight cotton. Considered cuts. Embroidered, never printed.</p>",
    rules: [{ column: "tag", relation: "equals", condition: "gender:men" }]
  },
  {
    handle: "whites",
    title: "Whites",
    body_html:
      "<p>The clean canvas pieces. Old Gold monogram on pure white — soft metal whisper, restraint as the move.</p>",
    rules: [{ column: "tag", relation: "equals", condition: "color:white" }]
  },
  {
    handle: "tees",
    title: "Tees",
    body_html: "<p>Heavyweight cotton tees. Built to be Kept.</p>",
    rules: [{ column: "tag", relation: "equals", condition: "category:tees" }]
  },
  {
    handle: "outerwear",
    title: "Hoodies & Crewnecks",
    body_html:
      "<p>Mid-weight to heavyweight knits. The cold-weather anchors of the vault.</p>",
    rules: [{ column: "tag", relation: "equals", condition: "category:outerwear" }]
  },
  {
    handle: "polos",
    title: "Polos",
    body_html: "<p>Premium pique knit. The everyday polo, made to take a tuck or wear loose.</p>",
    rules: [{ column: "tag", relation: "equals", condition: "category:polos" }]
  },
  {
    handle: "bottoms",
    title: "Bottoms",
    body_html: "<p>Heavyweight cotton fleece. The off-duty essential.</p>",
    rules: [{ column: "tag", relation: "equals", condition: "category:bottoms" }]
  },
  {
    handle: "accessories",
    title: "Accessories",
    body_html: "<p>The supporting pieces. Caps, socks, small additions to the vault.</p>",
    rules: [{ column: "tag", relation: "equals", condition: "category:accessories" }]
  }
];

async function findExistingCollection(creds: ShopifyCreds, handle: string): Promise<{ id: number } | null> {
  const r = await shopifyRest<{ smart_collections: Array<{ id: number; handle: string }> }>(
    creds,
    `/smart_collections.json?handle=${encodeURIComponent(handle)}`,
    { method: "GET" }
  );
  return r.smart_collections[0] ?? null;
}

async function upsertSmartCollection(creds: ShopifyCreds, spec: SmartCollectionSpec) {
  const existing = await findExistingCollection(creds, spec.handle);
  const payload = {
    smart_collection: {
      title: spec.title,
      handle: spec.handle,
      body_html: spec.body_html,
      rules: spec.rules,
      disjunctive: spec.disjunctive ?? false,
      published: true
    }
  };

  if (existing) {
    const r = await shopifyRest<{ smart_collection: { id: number; admin_graphql_api_id: string } }>(
      creds,
      `/smart_collections/${existing.id}.json`,
      { method: "PUT", body: JSON.stringify({ smart_collection: { id: existing.id, ...payload.smart_collection } }) }
    );
    console.log(`  ↻ ${spec.handle} (${spec.title}) — updated id=${r.smart_collection.id}`);
    return r.smart_collection;
  }

  const r = await shopifyRest<{ smart_collection: { id: number; admin_graphql_api_id: string } }>(
    creds,
    "/smart_collections.json",
    { method: "POST", body: JSON.stringify(payload) }
  );
  console.log(`  ✓ ${spec.handle} (${spec.title}) — created id=${r.smart_collection.id}`);
  return r.smart_collection;
}

async function createCollections(creds: ShopifyCreds): Promise<Array<{ handle: string; id: number }>> {
  console.log("=== PHASE 2: smart collections ===\n");
  const created: Array<{ handle: string; id: number }> = [];
  for (const spec of COLLECTIONS) {
    try {
      const c = await upsertSmartCollection(creds, spec);
      created.push({ handle: spec.handle, id: c.id });
    } catch (e) {
      console.warn(`  ✗ ${spec.handle}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log();
  return created;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const creds = resolveShopifyCredentials(BRAND);
  console.log(`[init] brand=${BRAND} store=${creds.storeDomain}\n`);

  await backfillTags(creds);
  const collections = await createCollections(creds);

  console.log("=== SUMMARY ===");
  console.log(`Collections: ${collections.length}`);
  for (const c of collections) {
    console.log(`  ${c.handle.padEnd(15)} https://${creds.storeDomain}/admin/collections/${c.id}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
