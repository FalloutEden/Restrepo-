import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  listShopifyDrafts,
  deleteShopifyProduct,
  listShopifyCleanupQueue,
  publishShopifyProduct
} from "@/lib/shopify-service";
import { listConfiguredShopifyCredentials, listShopifyCredentialsForContext, resolveShopifyCredentials } from "@/lib/shopify-credentials";
import { searchCjProducts, findCjCategoryIds } from "@/lib/cj-service";
import { materializeProduct, type MaterializationInput, type FulfillmentType } from "@/lib/product-materialization";
import { createAutonomousRun } from "@/lib/autonomous-run-service";
import { BRANDS } from "@/lib/brands";
import { loadPolicyConfig } from "@/lib/policies-config";
import { generateAllPolicies } from "@/lib/policies-generator";
import { pushAllPolicies } from "@/lib/policies-shopify";
import {
  createDrop as createContentDrop,
  listDrops as listContentDrops,
  readDrop as readContentDrop,
  markPostPosted
} from "@/lib/content-studio/storage";
import { generateContentDrop } from "@/lib/content-studio/orchestrator";
import { videoProviderStatus } from "@/lib/content-studio/video-pipeline";
import { ALL_PLATFORMS, type Platform } from "@/lib/content-studio/types";
import { summarizeSpend, getBudgetStatus, writeBudget } from "@/lib/spend-tracker";
import {
  writeProposal,
  writeHumanTask,
  appendOperatorMemory,
  newId,
  logActivity,
  type Proposal
} from "@/lib/operator-state";
import { buildRoiBrief } from "@/lib/operator-roi";
import { bootstrapStore } from "@/lib/store-bootstrap";
import { relinkPrintfulVariants } from "@/lib/printful-link";
import { attachAllToOnlineStore, transparentizeBrandImages, compositeBrandImagesOnBvBg, type BgCompositeMode } from "@/lib/bulk-store-ops";
import { evaluateBrandFit } from "@/lib/brand-fit-filter";
import { addMenuItem, listMenus, removeMenuItem } from "@/lib/shopify-menus";
import { aiBackgroundReplace, cutoutComposite, sharpFlatWhiteCutout, BV_MOCK_BG_PATH } from "@/lib/bg-composite";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getLaunchStatus, getLaunchStatusForAllBrands, getTenantLaunchStatus } from "@/lib/launch-status";
import {
  klaviyoHealthCheck,
  klaviyoListLists,
  klaviyoUpsertProfile,
  klaviyoSubscribeProfileToList,
  klaviyoListCampaigns
} from "@/lib/klaviyo";
import { FOUNDER_TENANT_ID, contextForTenantId } from "@/lib/tenant-context";
import { patchTenantProfile, type FulfillmentLane } from "@/lib/tenant-profile";

// Each tool the operator can call is declared once here:
//   - schema: JSONSchema Anthropic uses to constrain tool_use
//   - run:    server-side implementation
// The agent loop in lib/operator-agent.ts dispatches by tool name.
//
// ── Tenant safety gate (Gap 7 follow-up) ─────────────────────────────────
// Several service libs (lib/shopify-credentials.ts, lib/cj-service.ts,
// lib/printful-service.ts, lib/klaviyo.ts) still read credentials directly
// from process.env.* — that means in tenant mode they would silently act
// on the founder's keys and bill the founder's Shopify/Printful/Klaviyo
// accounts. Until each of those libs is refactored to accept a per-tenant
// credential, tools that touch them must be guarded.
//
// FOUNDER_ONLY_TOOLS lists tools that read credentials and have NOT yet
// been migrated to per-tenant credential resolution. When invoked from a
// non-founder context they return a clear error instead of executing.
// The list shrinks as each underlying service lib gets the BYOK pass.

const FOUNDER_ONLY_TOOLS = new Set<string>([
  // The lifted list keeps shrinking as each underlying service lib gains a
  // tenantCtx pass. Lifted Shopify-family tools (creds resolved per-tenant via
  // shopify-credentials.ts):
  //   2026-05-14: list_drafts, get_recent_orders, list_cleanup_queue,
  //               publish_listing, attach_all_to_online_store,
  //               relink_printful_variants
  //   2026-06-10: delete_listing, bootstrap_store, list_menus, add_menu_item,
  //               remove_menu_item, summarize_drafts, launch_status,
  //               generate_policies, publish_policies (shopify-menus.ts /
  //               store-bootstrap.ts / policies-shopify.ts / launch-status.ts
  //               threaded with tenantCtx)
  //
  // Still gated — each needs more than a credential thread.
  // Composites onto the founder's BV mock-background asset (OpenAI + a brand
  // asset a tenant doesn't have — needs a per-tenant brand background first):
  "composite_on_bv_background",
  "composite_all_brand_images",
  // Autonomous research pipeline (uses every credential type — lift last)
  "run_pipeline",
  // CEREBRO (architectural: gap 2, graphify not hosted on Vercel — not a BYOK fix)
  "cerebro_query"
]);

function isFounder(ctx: OperatorToolContext): boolean {
  return (ctx.tenantId ?? FOUNDER_TENANT_ID) === FOUNDER_TENANT_ID;
}

/** Returns a structured error result when a tenant invokes a tool that
 *  hasn't been BYOK-migrated yet. Lets the operator surface a clear
 *  "configure your platform credentials" message instead of silently
 *  running on the founder's keys. Returns null when the tool is safe to
 *  proceed (founder context, or tool already migrated). */
export function tenantSafetyGate(toolName: string, ctx: OperatorToolContext) {
  if (isFounder(ctx)) return null;
  if (!FOUNDER_ONLY_TOOLS.has(toolName)) return null;
  return {
    ok: false,
    error: "tenant-byok-pending",
    message:
      `The ${toolName} tool is not yet available on the tenant SaaS — it routes to a platform ` +
      `service (Shopify / Printful / CJ / Klaviyo / OpenAI) whose credentials are still ` +
      `read from the founder's environment. The BYOK migration for that service is queued; ` +
      `until it ships, only the founder/admin can invoke this tool. ` +
      `Tools that work for tenants today: record_note, propose_action, request_human_input, ` +
      `get_spend_summary, set_spend_budget.`
  };
}

export type OperatorToolContext = {
  conversationId?: string;
  source: "chat" | "tick";
  /** Tenant that owns this invocation. Tools that persist state or read
   *  credentials must scope by this — never by hardcoded env vars or global
   *  filesystem paths. Defaults to FOUNDER_TENANT_ID when not provided so
   *  legacy admin/dev call sites keep working. See lib/tenant-context.ts. */
  tenantId?: string;
};

export type OperatorTool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  run: (args: Record<string, unknown>, ctx: OperatorToolContext) => Promise<unknown>;
};

// ── Shopify orders helper (recent revenue per product, per brand) ─────────
// Read directly here rather than expanding shopify-service.ts. The operator
// uses this to judge what's working without us bloating the public lib.

type ShopifyOrderLineItem = {
  product_id?: number;
  title: string;
  quantity: number;
  price: string;
};

type ShopifyOrder = {
  id: number;
  created_at: string;
  total_price: string;
  currency: string;
  financial_status: string;
  line_items: ShopifyOrderLineItem[];
};

async function fetchRecentOrdersForBrand(
  creds: import("@/lib/shopify-credentials").ShopifyCredentials,
  sinceIsoDate: string
): Promise<{ brandSlug: string; orders: ShopifyOrder[]; error?: string }> {
  try {
    const url = `https://${creds.storeDomain}/admin/api/${creds.apiVersion}/orders.json?status=any&created_at_min=${encodeURIComponent(sinceIsoDate)}&limit=250&fields=id,created_at,total_price,currency,financial_status,line_items`;
    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": creds.token,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      return { brandSlug: creds.brandSlug, orders: [], error: `Shopify orders ${response.status}` };
    }
    const body = (await response.json()) as { orders?: ShopifyOrder[] };
    return { brandSlug: creds.brandSlug, orders: body.orders ?? [] };
  } catch (error) {
    return {
      brandSlug: creds.brandSlug,
      orders: [],
      error: error instanceof Error ? error.message : "Unknown orders error"
    };
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────

const list_drafts: OperatorTool = {
  name: "list_drafts",
  description:
    "List unpublished draft products across configured Shopify stores. Returns id, title, brand, tags, and admin URL. Use this before deciding whether to materialize more products.",
  input_schema: {
    type: "object",
    properties: {
      brand: {
        type: "string",
        enum: Object.keys(BRANDS).concat(["all"]),
        description: "Brand slug to filter by, or 'all' to aggregate."
      },
      limit: { type: "integer", minimum: 1, maximum: 250 }
    }
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const brand = typeof args.brand === "string" && args.brand !== "all" ? args.brand : undefined;
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const drafts = await listShopifyDrafts(limit, brand, tenantCtx);
    return {
      count: drafts.length,
      drafts: drafts.map((d) => ({
        id: d.id,
        title: d.title,
        brand: d.brand,
        productType: d.productType,
        tags: d.tags,
        createdAt: d.createdAt,
        adminUrl: d.adminUrl
      }))
    };
  }
};

const get_recent_orders: OperatorTool = {
  name: "get_recent_orders",
  description:
    "Fetch Shopify orders from the last N days across configured stores. Aggregates revenue per product and per brand so you can judge what's selling. Default 30 days. Returns nothing about customers — only product-level performance.",
  input_schema: {
    type: "object",
    properties: {
      sinceDays: { type: "integer", minimum: 1, maximum: 180 },
      brand: { type: "string", enum: Object.keys(BRANDS).concat(["all"]) }
    }
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const sinceDays = typeof args.sinceDays === "number" ? args.sinceDays : 30;
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const targetBrand = typeof args.brand === "string" && args.brand !== "all" ? args.brand : null;

    // Resolve creds: tenant gets their one store; founder gets the requested
    // brand or every configured brand.
    const { listShopifyCredentialsForContext } = await import("@/lib/shopify-credentials");
    const allCreds = tenantCtx.isFounder
      ? listConfiguredShopifyCredentials()
      : listShopifyCredentialsForContext(tenantCtx);
    const targets = targetBrand ? allCreds.filter((c) => c.brandSlug === targetBrand) : allCreds;

    const results = await Promise.all(
      targets.map((creds) => fetchRecentOrdersForBrand(creds, since))
    );

    const perBrand = results.map((r) => {
      const orders = r.orders.filter((o) => o.financial_status !== "voided" && o.financial_status !== "refunded");
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
      const productMap = new Map<string, { productId?: number; title: string; units: number; revenue: number }>();
      for (const o of orders) {
        for (const li of o.line_items ?? []) {
          const key = li.product_id ? String(li.product_id) : li.title;
          const existing = productMap.get(key);
          const lineRevenue = Number(li.price || 0) * (li.quantity ?? 0);
          if (existing) {
            existing.units += li.quantity ?? 0;
            existing.revenue += lineRevenue;
          } else {
            productMap.set(key, {
              productId: li.product_id,
              title: li.title,
              units: li.quantity ?? 0,
              revenue: lineRevenue
            });
          }
        }
      }
      const topProducts = Array.from(productMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);
      return {
        brand: r.brandSlug,
        sinceDays,
        totalOrders,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        topProducts,
        error: r.error
      };
    });

    return { brands: perBrand };
  }
};

const search_cj_products: OperatorTool = {
  name: "search_cj_products",
  description:
    "Browse CJ Dropshipping for new sourcing opportunities (LockLayer's IoT/security path). Pass a category-keyword regex like 'smart|lock|camera' to find category IDs, then page through products. Returns titles, price ranges, and CJ pids you can pass to materialize_product.sourceProductId.",
  input_schema: {
    type: "object",
    properties: {
      categoryKeywords: {
        type: "string",
        description: "Regex (case-insensitive) matched against CJ category paths. Examples: 'smart|lock|camera', 'doorbell', 'sensor|alarm'."
      },
      pageSize: { type: "integer", minimum: 5, maximum: 50 }
    },
    required: ["categoryKeywords"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const kw = String(args.categoryKeywords || "");
    const pageSize = typeof args.pageSize === "number" ? args.pageSize : 20;
    const regex = new RegExp(kw, "i");
    const categories = await findCjCategoryIds(regex, tenantCtx);
    if (categories.length === 0) {
      return { categories: [], products: [] };
    }
    const primary = categories[0];
    const products = await searchCjProducts({ categoryId: primary.id, pageSize }, tenantCtx);
    return {
      categories: categories.slice(0, 5),
      pickedCategory: primary,
      productCount: products.length,
      products: products.slice(0, pageSize).map((p) => ({
        pid: p.pid,
        title: p.title,
        priceMin: p.priceMin,
        priceMax: p.priceMax,
        currency: p.currency,
        imageCount: p.images.length,
        categoryName: p.categoryName
      }))
    };
  }
};

const materialize_product: OperatorTool = {
  name: "materialize_product",
  description:
    "Create a Shopify draft listing. Drafts are reversible and not customer-facing, so this does NOT need approval. " +
    "For a Printful/apparel product, ASK the merchant how they want the artwork — offer all options, don't pick for them: " +
    "(1) UPLOAD their own print-ready transparent PNG (≥1800px) → pass printFileUrl; (2) GENERATE with imageProvider 'openai' (gpt-image-1) or 'google' (Nano Banana 2 — better at text); or (3) MIRROR a product they designed in Printful (use the mirror flow, not this tool). " +
    "Surface any warnings the result returns (low-res upload, or 'review AI art before publishing'). " +
    "For dropship/CJ, pass sourceProductId from search_cj_products. Brand defaults from fulfillmentType.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      productType: { type: "string" },
      fulfillmentType: { type: "string", enum: ["printful", "zendrop", "digital"] },
      brand: { type: "string", enum: Object.keys(BRANDS) },
      niche: { type: "string" },
      sourceProductId: { type: "string", description: "CJ pid when fulfillmentType is 'zendrop'." },
      imagePrompt: { type: "string", description: "Artwork direction for AI generation (used when imageProvider is set and no printFileUrl)." },
      printFileUrl: { type: "string", description: "Printful AUTO-build: URL of the merchant's own print-ready transparent PNG (≥1800px on the long edge). Use when the merchant supplies their own art." },
      imageProvider: { type: "string", enum: ["openai", "google"], description: "Generate the artwork instead of uploading: 'openai' (gpt-image-1) or 'google' (Nano Banana 2, gemini-3.1-flash-image — renders text far better). Ignored when printFileUrl is given. Each carries a 'review before publishing' warning." }
    },
    required: ["title", "description", "productType", "fulfillmentType"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const input: MaterializationInput = {
      runtimeId: newId("op"),
      title: String(args.title),
      description: String(args.description),
      productType: String(args.productType),
      fulfillmentType: String(args.fulfillmentType) as FulfillmentType,
      brand: typeof args.brand === "string" ? args.brand : undefined,
      niche: typeof args.niche === "string" ? args.niche : undefined,
      sourceProductId: typeof args.sourceProductId === "string" ? args.sourceProductId : undefined,
      imagePrompt: typeof args.imagePrompt === "string" ? args.imagePrompt : undefined,
      printFileUrl: typeof args.printFileUrl === "string" ? args.printFileUrl : undefined,
      imageProvider:
        args.imageProvider === "openai" || args.imageProvider === "google" ? args.imageProvider : undefined
    };
    const result = await materializeProduct(input, tenantCtx);
    await logActivity({
      kind: "tool_call",
      message: `materialize_product → ${result.status} "${result.title}"`,
      data: {
        productId: result.shopifyProductId,
        brand: input.brand,
        fulfillment: result.fulfillmentType,
        source: ctx.source
      }
    });
    return result;
  }
};

const delete_listing: OperatorTool = {
  name: "delete_listing",
  description:
    "Delete a Shopify draft (or active) product. Use to clean up dead-weight listings. For drafts this is fully reversible only by re-creation, so confirm in your reasoning that you want to delete before calling.",
  input_schema: {
    type: "object",
    properties: {
      productId: { type: "integer" },
      brand: { type: "string", enum: Object.keys(BRANDS) },
      reason: { type: "string", description: "Why you're deleting this — saved to activity log." }
    },
    required: ["productId", "brand", "reason"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const productId = Number(args.productId);
    const brand = String(args.brand);
    const reason = String(args.reason || "no reason given");
    const result = await deleteShopifyProduct(productId, brand, tenantCtx);
    await logActivity({
      kind: "tool_call",
      message: `delete_listing → ${productId} (${brand})`,
      data: { reason, source: ctx.source }
    });
    return { ...result, reason };
  }
};

const list_cleanup_queue: OperatorTool = {
  name: "list_cleanup_queue",
  description:
    "List products that need merchant review — drafts, plus active products that aren't yet published to the Online Store sales channel. The user uses this to decide which ones to publish vs delete. Aggregates across every configured brand by default.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS), description: "Limit to one brand. Omit for all brands." },
      includePublished: { type: "boolean", description: "Also include products already live on the Online Store. Default false." },
      limit: { type: "integer", minimum: 1, maximum: 250 }
    }
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const items = await listShopifyCleanupQueue({
      brand: typeof args.brand === "string" ? args.brand : undefined,
      includePublished: args.includePublished === true,
      limit: typeof args.limit === "number" ? args.limit : 250,
      tenantCtx
    });
    return {
      count: items.length,
      byReason: items.reduce<Record<string, number>>((acc, item) => {
        acc[item.reason] = (acc[item.reason] ?? 0) + 1;
        return acc;
      }, {}),
      items
    };
  }
};

const publish_listing: OperatorTool = {
  name: "publish_listing",
  description:
    "Publish a single Shopify product to the Online Store sales channel (sets status=active and adds it to the Online Store publication, both of which are needed for the storefront to show it). Customer-facing — only call after the user has approved the specific product.",
  input_schema: {
    type: "object",
    properties: {
      productId: { type: "integer" },
      brand: { type: "string", enum: Object.keys(BRANDS) }
    },
    required: ["productId", "brand"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const productId = Number(args.productId);
    const brand = String(args.brand);
    const result = await publishShopifyProduct(productId, brand, tenantCtx);
    await logActivity({
      kind: "tool_call",
      message: `publish_listing → ${productId} (${brand}) onlineStore=${result.onlineStorePublished}`,
      data: { source: ctx.source }
    });
    return result;
  }
};

const bootstrap_store: OperatorTool = {
  name: "bootstrap_store",
  description:
    "One-shot SaaS-resale onboarding: verify the Shopify access token, register the orders/paid webhook, push customer-facing policies, and confirm the Online Store sales channel exists. Run after a new store's env vars are configured. Idempotent — safe to re-run on partially-bootstrapped stores. Use webhookCallbackUrl matching this app's deployment (e.g. https://restrepo.vercel.app/api/webhooks/shopify/order-paid).",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS) },
      webhookCallbackUrl: { type: "string", description: "Public HTTPS URL of /api/webhooks/shopify/order-paid for this deployment." },
      skipPolicies: { type: "boolean" }
    },
    required: ["brand", "webhookCallbackUrl"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const brand = String(args.brand);
    const webhookCallbackUrl = String(args.webhookCallbackUrl);
    const skipPolicies = args.skipPolicies === true;
    const result = await bootstrapStore(brand, { webhookCallbackUrl, skipPolicies }, tenantCtx);
    const okSteps = result.steps.filter((s) => s.ok).length;
    await logActivity({
      kind: "tool_call",
      message: `bootstrap_store → ${brand} (${okSteps}/${result.steps.length} ok)`,
      data: { source: ctx.source, webhookCallbackUrl }
    });
    return result;
  }
};

const relink_printful_variants: OperatorTool = {
  name: "relink_printful_variants",
  description:
    "Sweep every product on a brand's Shopify store and ensure each Printful sync_variant's external_id matches the corresponding Shopify variant id. Run after creating new product drafts (the order-paid webhook can't auto-fulfill without this). Idempotent — re-runs only patch what's wrong.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS) }
    },
    required: ["brand"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const brand = String(args.brand);
    const summary = await relinkPrintfulVariants(brand, tenantCtx);
    await logActivity(
      {
        kind: "tool_call",
        message: `relink_printful_variants → ${brand} (${summary.updated} updated, ${summary.alreadyLinked} ok)`,
        data: { source: ctx.source }
      },
      ctx.tenantId ?? FOUNDER_TENANT_ID
    );
    return summary;
  }
};

const attach_all_to_online_store: OperatorTool = {
  name: "attach_all_to_online_store",
  description:
    "Bulk-attach every product on a brand's Shopify store to the Online Store sales channel. Run once after a new store is bootstrapped, or after a batch of products is created where the user wants them all eligible for the storefront. Idempotent. Note: this only ensures the Online Store membership flag — products with status=draft remain hidden from customers.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS) }
    },
    required: ["brand"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const brand = String(args.brand);
    const result = await attachAllToOnlineStore(brand, tenantCtx);
    await logActivity({
      kind: "tool_call",
      message: `attach_all_to_online_store → ${brand} (${result.attached}/${result.total})`,
      data: { source: ctx.source }
    });
    return result;
  }
};

const list_menus: OperatorTool = {
  name: "list_menus",
  description:
    "List the storefront navigation menus for a brand (main-menu, footer, etc.) with their current items. Use to know what's already linked before adding/removing entries.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS) }
    },
    required: ["brand"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    return await listMenus(String(args.brand), tenantCtx);
  }
};

const add_menu_item: OperatorTool = {
  name: "add_menu_item",
  description:
    "Add an item to a storefront navigation menu. Provide ONE of: page (Shopify page id), product (Shopify product id), collection (id), or url (raw external/internal URL). Idempotent — duplicates by title are skipped. Common menuHandle values: 'main-menu', 'footer'. Customer-facing change but reversible — call remove_menu_item if it looks wrong.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS) },
      menuHandle: { type: "string", description: "Typically 'main-menu' or 'footer'." },
      title: { type: "string", description: "Visible menu label." },
      pageId: { type: "integer", description: "Shopify page numeric id (preferred for the brand-story / about page)." },
      productId: { type: "integer" },
      collectionId: { type: "integer" },
      url: { type: "string", description: "Raw URL — for external links or fallback." },
      position: { type: "integer", description: "0-indexed insertion position. Default = end." }
    },
    required: ["brand", "menuHandle", "title"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const result = await addMenuItem({
      brand: String(args.brand),
      menuHandle: String(args.menuHandle),
      title: String(args.title),
      page: typeof args.pageId === "number" ? { id: args.pageId } : undefined,
      product: typeof args.productId === "number" ? { id: args.productId } : undefined,
      collection: typeof args.collectionId === "number" ? { id: args.collectionId } : undefined,
      url: typeof args.url === "string" ? args.url : undefined,
      position: typeof args.position === "number" ? args.position : undefined
    }, tenantCtx);
    await logActivity({
      kind: "tool_call",
      message: `add_menu_item → ${args.brand} ${args.menuHandle} += ${args.title}`,
      data: { source: ctx.source }
    });
    return result;
  }
};

const remove_menu_item: OperatorTool = {
  name: "remove_menu_item",
  description: "Remove an item from a storefront navigation menu by its visible title. Customer-facing change.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS) },
      menuHandle: { type: "string" },
      title: { type: "string" }
    },
    required: ["brand", "menuHandle", "title"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const result = await removeMenuItem(String(args.brand), String(args.menuHandle), String(args.title), tenantCtx);
    await logActivity({
      kind: "tool_call",
      message: `remove_menu_item → ${args.brand} ${args.menuHandle} -= ${args.title}`,
      data: { source: ctx.source }
    });
    return result;
  }
};

const transparentize_brand_images: OperatorTool = {
  name: "transparentize_brand_images",
  description:
    "Replace each product's primary image with a version that has the white background removed (alpha-cut). Useful when products on a dark theme show distracting white squares. Skips images that already have meaningful transparency. edgeOnly mode preserves white interior regions (logos, text) and only removes white that's reachable from the image edge — slower but safer for printed designs.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS) },
      productId: { type: "integer", description: "Limit to one product. Omit to process every product on the brand." },
      edgeOnly: { type: "boolean", description: "Preserve interior white. Default false." }
    },
    required: ["brand"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const brand = String(args.brand);
    const result = await transparentizeBrandImages(brand, {
      edgeOnly: args.edgeOnly === true,
      productId: typeof args.productId === "number" ? args.productId : undefined
    }, tenantCtx);
    await logActivity({
      kind: "tool_call",
      message: `transparentize_brand_images → ${brand} (${result.processed}/${result.total})`,
      data: { source: ctx.source }
    });
    return result;
  }
};

const propose_action: OperatorTool = {
  name: "propose_action",
  description:
    "Push a spend-bound action into the human approval inbox. Use for: publishing listings, registering domains, signing up for paid tools, ad spend, or any action where money or customer-facing state changes. Always include estimatedCostUsd and revenue projections (low/mid/high). The system writes a markdown brief and CSV ROI sheet automatically — you don't need to format them.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short title shown in the inbox." },
      summary: { type: "string", description: "One paragraph the user reads to decide quickly." },
      action: { type: "string", description: "What you want to do, in concrete terms." },
      rationale: { type: "string", description: "Why this is the right call now. Cite signals." },
      assumptions: { type: "array", items: { type: "string" } },
      estimatedCostUsd: { type: "number", minimum: 0 },
      unitCostUsd: { type: "number", minimum: 0 },
      retailPriceUsd: { type: "number", minimum: 0 },
      projectedWeeklyVolume: {
        type: "object",
        properties: {
          low: { type: "number" },
          mid: { type: "number" },
          high: { type: "number" }
        },
        required: ["low", "mid", "high"]
      },
      paybackWeeks: { type: "number", description: "Estimated weeks to recover estimatedCostUsd at mid-volume." },
      humanFootwork: {
        type: "array",
        items: { type: "string" },
        description: "Anything you need the user to do alongside approving — verifying details, taking a photo, signing something."
      }
    },
    required: ["title", "summary", "action", "estimatedCostUsd"]
  },
  async run(args, ctx) {
    const id = newId("prop");
    const projectedWeeklyVolume = (args.projectedWeeklyVolume ?? null) as
      | { low: number; mid: number; high: number }
      | null;
    const retail = typeof args.retailPriceUsd === "number" ? args.retailPriceUsd : 0;
    const unitCost = typeof args.unitCostUsd === "number" ? args.unitCostUsd : 0;
    const margin = Math.max(0, retail - unitCost);

    let monthly: { low: number; mid: number; high: number } | undefined;
    if (projectedWeeklyVolume && margin > 0) {
      monthly = {
        low: Math.round(projectedWeeklyVolume.low * margin * 4.33),
        mid: Math.round(projectedWeeklyVolume.mid * margin * 4.33),
        high: Math.round(projectedWeeklyVolume.high * margin * 4.33)
      };
    }

    const { briefMarkdown, roiCsv } = buildRoiBrief({
      id,
      title: String(args.title),
      summary: String(args.summary),
      action: String(args.action),
      rationale: typeof args.rationale === "string" ? args.rationale : undefined,
      assumptions: Array.isArray(args.assumptions) ? (args.assumptions as string[]) : [],
      estimatedCostUsd: Number(args.estimatedCostUsd ?? 0),
      unitCostUsd: unitCost || undefined,
      retailPriceUsd: retail || undefined,
      projectedWeeklyVolume,
      paybackWeeks: typeof args.paybackWeeks === "number" ? args.paybackWeeks : undefined,
      humanFootwork: Array.isArray(args.humanFootwork) ? (args.humanFootwork as string[]) : []
    });

    const tenantId = ctx.tenantId ?? FOUNDER_TENANT_ID;
    const proposal = await writeProposal(
      {
        id,
        title: String(args.title),
        summary: String(args.summary),
        action: String(args.action),
        estimatedCostUsd: Number(args.estimatedCostUsd ?? 0),
        estimatedMonthlyRevenueUsd: monthly,
        source: { kind: ctx.source, conversationId: ctx.conversationId }
      },
      { briefMarkdown, roiCsv },
      tenantId
    );

    await logActivity(
      {
        kind: "proposal_created",
        message: `Proposal "${proposal.title}" created — $${proposal.estimatedCostUsd} est. cost`,
        data: { proposalId: proposal.id, source: ctx.source }
      },
      tenantId
    );

    return {
      id: proposal.id,
      status: proposal.status,
      briefPath: proposal.briefPath,
      roiCsvPath: proposal.roiCsvPath
    };
  }
};

const request_human_input: OperatorTool = {
  name: "request_human_input",
  description:
    "Queue a task only the human can complete: verify identity, take a photo, approve a paid signup, sign a contract, etc. Don't use this for spend-bound actions where you have a concrete proposal — use propose_action for those.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      detail: { type: "string", description: "What needs to happen, with enough detail that the user can act on it without re-asking." },
      why: { type: "string", description: "Why you can't do this yourself." }
    },
    required: ["title", "detail", "why"]
  },
  async run(args, ctx) {
    const tenantId = ctx.tenantId ?? FOUNDER_TENANT_ID;
    const task = await writeHumanTask(
      {
        id: newId("task"),
        title: String(args.title),
        detail: String(args.detail),
        why: String(args.why),
        source: { kind: ctx.source, conversationId: ctx.conversationId }
      },
      tenantId
    );
    await logActivity(
      {
        kind: "task_created",
        message: `Human task: ${task.title}`,
        data: { taskId: task.id, source: ctx.source }
      },
      tenantId
    );
    return { id: task.id, status: task.status };
  }
};

const record_note: OperatorTool = {
  name: "record_note",
  description:
    "Save a finding to operator memory so future conversations and ticks know it. Good for: 'CJ category X has best margin', 'Black Vault buyers respond to specific GSM language', 'avoid materializing more crewneck SKUs — saturated'. Keep notes short and concrete.",
  input_schema: {
    type: "object",
    properties: {
      note: { type: "string", description: "One concise sentence." }
    },
    required: ["note"]
  },
  async run(args, ctx) {
    const note = String(args.note || "").trim();
    if (!note) return { saved: false };
    const tenantId = ctx.tenantId ?? FOUNDER_TENANT_ID;
    await appendOperatorMemory(note, tenantId);
    await logActivity({ kind: "note", message: note }, tenantId);
    return { saved: true };
  }
};

// ── Tenant brand intake (gap 3 of the 2026-05-14 launch-gate dossier) ────
// Persists answers from the turn-1 intake conversation so the operator
// never has to ask the same merchant twice. Safe to call from any context
// — works for both founder and tenant. Tools that need brand context (copy
// generation, materialization) read this profile to ground their output.

const intake_brand_profile: OperatorTool = {
  name: "intake_brand_profile",
  description:
    "Save what you learned about the merchant's brand during the intake conversation. Call this incrementally — every time you gather a new field, patch it in. Don't wait until you have everything to save the first time. Required fields to consider this profile complete: brandName, audience, voice, fulfillment. Optional: tagline, shopifyStoreDomain, tierOneNotes (what they've already done — domain, store, payments KYC, fulfillment account), notes (anything else relevant).",
  input_schema: {
    type: "object",
    properties: {
      brandName: { type: "string", description: "The merchant's brand name." },
      tagline: { type: "string", description: "One-line tagline if they have one." },
      audience: {
        type: "string",
        description:
          "Who they're selling to, in their own words. 1-2 sentences. Capture demographics + psychographics + price tolerance."
      },
      voice: {
        type: "string",
        description:
          "How they want to sound. Cite comparables (\"like Wild One\", \"like Aimé Leon Dore\", \"premium-restrained\", \"playful-confident\"). 1-2 sentences."
      },
      fulfillment: {
        type: "string",
        enum: ["printful", "cj-dropship", "digital", "manual", "unknown"],
        description:
          "Primary fulfillment lane. printful=apparel POD, cj-dropship=hardware/general dropship, digital=info products, manual=they fulfill themselves, unknown=ask them."
      },
      shopifyStoreDomain: {
        type: "string",
        description: "Their store domain, e.g. 'pawvault.myshopify.com'. Omit if they don't have one yet."
      },
      tierOneNotes: {
        type: "string",
        description:
          "Short notes on Tier-1 footwork status — domain owned? Shopify store created? Payments KYC submitted? Fulfillment account exists? One short sentence per item, comma-separated."
      },
      notes: {
        type: "array",
        items: { type: "string" },
        description: "Free-form intake notes that don't fit a structured field."
      }
    }
  },
  async run(args, ctx) {
    const tenantId = ctx.tenantId ?? FOUNDER_TENANT_ID;
    const patch: Record<string, unknown> = {};
    if (typeof args.brandName === "string" && args.brandName.trim()) patch.brandName = args.brandName.trim();
    if (typeof args.tagline === "string" && args.tagline.trim()) patch.tagline = args.tagline.trim();
    if (typeof args.audience === "string" && args.audience.trim()) patch.audience = args.audience.trim();
    if (typeof args.voice === "string" && args.voice.trim()) patch.voice = args.voice.trim();
    if (typeof args.fulfillment === "string") {
      patch.fulfillment = args.fulfillment as FulfillmentLane;
    }
    if (typeof args.shopifyStoreDomain === "string" && args.shopifyStoreDomain.trim()) {
      patch.shopifyStoreDomain = args.shopifyStoreDomain.trim().toLowerCase();
    }
    if (typeof args.tierOneNotes === "string" && args.tierOneNotes.trim()) {
      patch.tierOneNotes = args.tierOneNotes.trim();
    }
    if (Array.isArray(args.notes)) {
      patch.notes = (args.notes as unknown[]).filter((n): n is string => typeof n === "string");
    }

    const profile = await patchTenantProfile(patch, tenantId);
    await logActivity(
      {
        kind: "note",
        message: `intake: profile updated${profile.completedAt ? " (complete)" : ""}`,
        data: { fields: Object.keys(patch), brandName: profile.brandName }
      },
      tenantId
    );
    return {
      saved: true,
      profile,
      complete: Boolean(profile.completedAt),
      missing:
        ["brandName", "audience", "voice", "fulfillment"].filter(
          (k) => !(profile as unknown as Record<string, unknown>)[k]
        )
    };
  }
};

const run_pipeline: OperatorTool = {
  name: "run_pipeline",
  description:
    "Trigger the 11-agent autonomous research pipeline (research → routing → validation → strategy → design → build → review → monitor). Costs roughly $5 in Claude tokens per run and takes 5–6 minutes. Returns the runId immediately — the run continues in the background and progress can be watched at /pipeline. Use when the user asks for fresh research, or when you genuinely need new opportunities and want to spend the tokens.",
  input_schema: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        description: "What the pipeline should research. Examples: 'find premium apparel niches for Black Vault', 'discover IoT/security products under $25 cost basis for LockLayer'."
      }
    },
    required: ["goal"]
  },
  async run(args, ctx) {
    const goal = String(args.goal || "").trim();
    if (!goal) return { error: "goal is required" };

    // createAutonomousRun returns 202 + payload {runId} when accepted.
    const result = await createAutonomousRun({ goal });
    await logActivity({
      kind: "tool_call",
      message: `run_pipeline → "${goal}" (status ${result.status})`,
      data: { source: ctx.source, status: result.status }
    });
    return {
      status: result.status,
      payload: result.payload
    };
  }
};

// ── Policy generation and publishing ──────────────────────────────────────


const generate_policies: OperatorTool = {
  name: "generate_policies",
  description:
    "Generate the five customer-facing store policies (Privacy, Terms, Refund, Shipping, Contact) for a brand and save them to disk for review. This does NOT publish to Shopify — that's a separate step. Free, autonomous. Re-run anytime brand info changes.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS) }
    },
    required: ["brand"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const brandSlug = String(args.brand);
    const config = await loadPolicyConfig(brandSlug);
    const policies = generateAllPolicies(config);
    // Review output goes under the tenant-aware operator root — tenant-isolated
    // and on the writable ephemeral base on Vercel (vs. the read-only bundle).
    const dir = path.join(tenantCtx.paths.root, "policies", brandSlug);
    await mkdir(dir, { recursive: true });
    const written: string[] = [];
    for (const policy of policies) {
      const filePath = path.join(dir, policy.filename);
      await writeFile(filePath, policy.body, "utf8");
      written.push(filePath);
    }
    await logActivity({
      kind: "tool_call",
      message: `generate_policies → ${brandSlug} (${policies.length} files)`,
      data: { brand: brandSlug, source: ctx.source }
    });
    return {
      brand: brandSlug,
      legalEntity: config.legalEntity,
      filesWritten: written,
      policies: policies.map((p) => ({ type: p.type, title: p.title, filename: p.filename }))
    };
  }
};

const publish_policies: OperatorTool = {
  name: "publish_policies",
  description:
    "Publish the five generated store policies for a brand to Shopify (overwrites whatever is currently live). Customer-facing — the user must explicitly ask for this; do not run autonomously. Always run generate_policies first so the user has a chance to review the drafts on disk.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS) }
    },
    required: ["brand"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const brandSlug = String(args.brand);
    const config = await loadPolicyConfig(brandSlug);
    const policies = generateAllPolicies(config);
    const results = await pushAllPolicies(brandSlug, policies, tenantCtx);
    await logActivity({
      kind: "tool_call",
      message: `publish_policies → ${brandSlug} (${results.filter((r) => r.ok).length}/${results.length} ok)`,
      data: { brand: brandSlug, source: ctx.source }
    });
    return {
      brand: brandSlug,
      results: results.map((r) => ({
        type: r.type,
        ok: r.ok,
        url: r.url,
        error: r.error
      }))
    };
  }
};

// ── Content Studio (AI content factory) ───────────────────────────────────

const create_content_drop: OperatorTool = {
  name: "create_content_drop",
  description:
    "Create a new content drop for a product. The drop is a container for source photos (which the user uploads via /content-studio in the UI) and the AI-generated content that follows. Returns a drop id the user uses to upload photos and trigger generation. The user must upload at least one product photo before generation can produce useful output.",
  input_schema: {
    type: "object",
    properties: {
      productTitle: { type: "string", description: "The product name, e.g. 'The Vault Tee'" },
      brand: { type: "string", enum: Object.keys(BRANDS) },
      productId: { type: "integer", description: "Optional Shopify product id" },
      productHandle: { type: "string", description: "Optional Shopify product handle" }
    },
    required: ["productTitle", "brand"]
  },
  async run(args, ctx) {
    const drop = await createContentDrop({
      productTitle: String(args.productTitle),
      brandSlug: String(args.brand),
      productId: typeof args.productId === "number" ? args.productId : undefined,
      productHandle: typeof args.productHandle === "string" ? args.productHandle : undefined
    });
    await logActivity({
      kind: "tool_call",
      message: `create_content_drop → ${drop.id} for "${drop.productTitle}"`,
      data: { dropId: drop.id, source: ctx.source }
    });
    return {
      id: drop.id,
      productTitle: drop.productTitle,
      brand: drop.brandSlug,
      status: drop.status,
      uploadUrl: `/content-studio?drop=${drop.id}`,
      message: "Drop created. Upload product photos via the /content-studio page, then call generate_content_drop_run."
    };
  }
};

const list_content_drops_tool: OperatorTool = {
  name: "list_content_drops",
  description:
    "List all content drops across all products. Returns drop id, product title, status, asset count, and post count.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["draft", "generating", "ready", "posted", "archived", "any"] }
    }
  },
  async run(args) {
    const filterStatus = typeof args.status === "string" && args.status !== "any" ? args.status : null;
    const drops = await listContentDrops();
    const filtered = filterStatus ? drops.filter((d) => d.status === filterStatus) : drops;
    return {
      count: filtered.length,
      drops: filtered.map((d) => ({
        id: d.id,
        productTitle: d.productTitle,
        brand: d.brandSlug,
        status: d.status,
        assetCount: d.assets.length,
        sourcePhotoCount: d.assets.filter((a) => a.kind === "source_photo").length,
        postCount: d.posts.length,
        createdAt: d.createdAt
      }))
    };
  }
};

const get_content_drop: OperatorTool = {
  name: "get_content_drop",
  description: "Read the full manifest of a content drop including all assets, posts, and the generation log.",
  input_schema: {
    type: "object",
    properties: {
      dropId: { type: "string" }
    },
    required: ["dropId"]
  },
  async run(args) {
    const drop = await readContentDrop(String(args.dropId));
    if (!drop) return { error: "drop not found" };
    return drop;
  }
};

const generate_content_drop_run: OperatorTool = {
  name: "generate_content_drop_run",
  description:
    "Run the full content drop pipeline for a drop that already has source photos uploaded. Generates lifestyle variants (deterministic crops/treatments), AI model shots (needs the merchant's OpenAI key — skipped if absent), videos (only if the merchant has a video provider configured — skipped otherwise), and platform captions (Claude). Each phase degrades gracefully: a missing key skips that phase, it doesn't fail the drop. Long-running — typically 2–6 minutes. Costs roughly $0.50–$5 per drop on the merchant's own keys.",
  input_schema: {
    type: "object",
    properties: {
      dropId: { type: "string" },
      lifestyleScenarios: {
        type: "array",
        items: { type: "string" },
        description: "Optional override of lifestyle scene prompts. Defaults to a 5-scene premium apparel set."
      },
      videoScenes: {
        type: "array",
        items: { type: "string" },
        description: "Optional override of video scene prompts. Defaults to a 3-scene premium apparel set."
      },
      targetPlatforms: {
        type: "array",
        items: { type: "string", enum: ALL_PLATFORMS },
        description: "Optional override of target platforms. Defaults to instagram_post, instagram_reel, tiktok, pinterest, twitter."
      },
      maxLifestyleImages: { type: "integer", minimum: 0, maximum: 10 },
      maxVideos: { type: "integer", minimum: 0, maximum: 10 }
    },
    required: ["dropId"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const dropId = String(args.dropId);
    const drop = await readContentDrop(dropId);
    if (!drop) return { error: "drop not found" };
    if (drop.assets.filter((a) => a.kind === "source_photo").length === 0) {
      return { error: "no source photos uploaded — upload photos at /content-studio first" };
    }
    const result = await generateContentDrop(dropId, {
      lifestyleScenarios: Array.isArray(args.lifestyleScenarios) ? (args.lifestyleScenarios as string[]) : undefined,
      videoScenes: Array.isArray(args.videoScenes) ? (args.videoScenes as string[]) : undefined,
      targetPlatforms: Array.isArray(args.targetPlatforms) ? (args.targetPlatforms as Platform[]) : undefined,
      maxLifestyleImages: typeof args.maxLifestyleImages === "number" ? args.maxLifestyleImages : undefined,
      maxVideos: typeof args.maxVideos === "number" ? args.maxVideos : undefined
    }, tenantCtx);
    await logActivity({
      kind: "tool_call",
      message: `generate_content_drop_run → ${dropId} (${result?.posts.length ?? 0} posts generated)`,
      data: { dropId, source: ctx.source }
    });
    return {
      id: dropId,
      status: result?.status ?? "unknown",
      assetCount: result?.assets.length ?? 0,
      postCount: result?.posts.length ?? 0,
      videoProvider: videoProviderStatus()
    };
  }
};

const mark_content_post_posted: OperatorTool = {
  name: "mark_content_post_posted",
  description: "Flag a generated content post as posted (after the user pastes it into the platform manually).",
  input_schema: {
    type: "object",
    properties: {
      dropId: { type: "string" },
      postId: { type: "string" }
    },
    required: ["dropId", "postId"]
  },
  async run(args) {
    await markPostPosted(String(args.dropId), String(args.postId));
    return { ok: true };
  }
};

// ── Spend tracking ────────────────────────────────────────────────────────

const get_spend_summary: OperatorTool = {
  name: "get_spend_summary",
  description:
    "Read the in-app spend tracker. Returns total Claude + OpenAI API spend with breakdowns by provider, model, kind, and day. Includes today, last 7 days, last 30 days. Use to answer 'how much have we spent' or to check if approaching a monthly budget cap.",
  input_schema: {
    type: "object",
    properties: {
      sinceDays: { type: "integer", minimum: 1, maximum: 365 }
    }
  },
  async run(args, ctx) {
    const tenantId = ctx.tenantId ?? FOUNDER_TENANT_ID;
    const sinceDays = typeof args.sinceDays === "number" ? args.sinceDays : undefined;
    const summary = await summarizeSpend(
      sinceDays ? { sinceDays, tenantId } : { tenantId }
    );
    const budgetStatus = await getBudgetStatus(tenantId);
    return { summary, budgetStatus };
  }
};

const set_spend_budget: OperatorTool = {
  name: "set_spend_budget",
  description:
    "Set the monthly spend cap (in USD) and warning threshold. Sample call: { monthlyCapUsd: 25, warnAtPct: 80 } means warn when monthly spend hits $20, alert at $25. Set monthlyCapUsd to 0 to disable the cap.",
  input_schema: {
    type: "object",
    properties: {
      monthlyCapUsd: { type: "number", minimum: 0 },
      warnAtPct: { type: "number", minimum: 0, maximum: 100 }
    },
    required: ["monthlyCapUsd"]
  },
  async run(args, ctx) {
    const tenantId = ctx.tenantId ?? FOUNDER_TENANT_ID;
    const monthlyCapUsd = Number(args.monthlyCapUsd ?? 0);
    const warnAtPct = typeof args.warnAtPct === "number" ? Number(args.warnAtPct) : 80;
    await writeBudget({ monthlyCapUsd, warnAtPct }, tenantId);
    const status = await getBudgetStatus(tenantId);
    return { ok: true, budgetStatus: status };
  }
};

// ── Brand-background compositor (model-on-BV-mock) ────────────────────────

const composite_on_bv_background: OperatorTool = {
  name: "composite_on_bv_background",
  description:
    "Place a model/product photo onto the official Black Vault Apparel mock background (.openclaw/brand/Mock Up BG/BG BV Mock.png — dark luxury gradient with BV monogram). Two modes: 'ai' uses gpt-image-1 image edit and matches lighting to the dark mood (best for editorial fashion shots, ~$0.04 per image); 'cutout' uses gpt-image-1 to remove the source background then deterministically composites onto the BG (predictable, model stays pixel-identical); 'sharp' is the cheapest path and only works if the input is on a near-white seamless background. Reads inputPath from disk and writes the composited PNG to outputPath. Both must be absolute or repo-relative paths.",
  input_schema: {
    type: "object",
    properties: {
      inputPath: { type: "string", description: "Path to the source photo (jpg/png). Can be repo-relative." },
      outputPath: { type: "string", description: "Where to write the composited PNG. Defaults to .openclaw/brand/composited/<basename>-on-bg.png" },
      mode: { type: "string", enum: ["ai", "cutout", "sharp"] },
      subjectHeightFrac: { type: "number", minimum: 0.1, maximum: 1, description: "cutout/sharp modes: fraction of canvas the subject occupies vertically. Default 0.85." },
      subjectCenterXFrac: { type: "number", minimum: 0, maximum: 1, description: "cutout/sharp modes: horizontal center 0-1. Default 0.55 (slight right so BV mark stays visible)." },
      subjectBottomYFrac: { type: "number", minimum: 0, maximum: 1, description: "cutout/sharp modes: bottom edge of subject 0-1. Default 0.98." },
      dropShadow: { type: "boolean", description: "cutout/sharp modes: add a soft drop shadow under the subject. Default false." }
    },
    required: ["inputPath"]
  },
  async run(args, ctx) {
    const inputPath = String(args.inputPath);
    const mode = (typeof args.mode === "string" ? args.mode : "ai") as "ai" | "cutout" | "sharp";
    const absoluteIn = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);
    if (!existsSync(absoluteIn)) {
      return { error: `Input not found: ${absoluteIn}` };
    }
    if (!existsSync(BV_MOCK_BG_PATH)) {
      return { error: `BV mock BG missing at ${BV_MOCK_BG_PATH}` };
    }
    const sourceBuffer = await readFile(absoluteIn);

    let result: Buffer;
    if (mode === "ai") {
      result = await aiBackgroundReplace(sourceBuffer);
    } else if (mode === "cutout") {
      result = await cutoutComposite(sourceBuffer, {
        subjectHeightFrac: typeof args.subjectHeightFrac === "number" ? args.subjectHeightFrac : undefined,
        subjectCenterXFrac: typeof args.subjectCenterXFrac === "number" ? args.subjectCenterXFrac : undefined,
        subjectBottomYFrac: typeof args.subjectBottomYFrac === "number" ? args.subjectBottomYFrac : undefined,
        dropShadow: args.dropShadow === true
      });
    } else {
      const cutout = await sharpFlatWhiteCutout(sourceBuffer);
      result = await cutoutComposite(cutout, {
        subjectHeightFrac: typeof args.subjectHeightFrac === "number" ? args.subjectHeightFrac : undefined,
        subjectCenterXFrac: typeof args.subjectCenterXFrac === "number" ? args.subjectCenterXFrac : undefined,
        subjectBottomYFrac: typeof args.subjectBottomYFrac === "number" ? args.subjectBottomYFrac : undefined,
        dropShadow: args.dropShadow === true,
        alreadyTransparent: true
      });
    }

    const baseName = path.basename(absoluteIn, path.extname(absoluteIn));
    const defaultOut = path.join(process.cwd(), ".openclaw", "brand", "composited", `${baseName}-on-bg.png`);
    const outPath = typeof args.outputPath === "string"
      ? (path.isAbsolute(args.outputPath) ? args.outputPath : path.join(process.cwd(), args.outputPath))
      : defaultOut;
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, result);

    await logActivity({
      kind: "tool_call",
      message: `composite_on_bv_background → ${mode} ${path.basename(absoluteIn)} → ${path.basename(outPath)}`,
      data: { mode, inputPath: absoluteIn, outputPath: outPath, source: ctx.source }
    });

    return {
      ok: true,
      mode,
      inputPath: absoluteIn,
      outputPath: outPath,
      sizeBytes: result.length
    };
  }
};

const summarize_drafts: OperatorTool = {
  name: "summarize_drafts",
  description:
    "Categorize every draft product across configured brands into delete/decide/publish buckets via the existing brand-fit filter. Use to surface pre-launch hygiene work — what should be deleted as off-brand, what needs merchant decision, what's safe to publish. Returns per-brand bucketed lists with admin URLs and rationale. Read-only; no state changes.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS), description: "Brand slug. Omit for all configured brands." }
    }
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    // Founder enumerates every configured brand; a tenant sees only their own
    // store — never the founder's BV/LL drafts.
    const allCreds = listShopifyCredentialsForContext(tenantCtx);
    const brands = typeof args.brand === "string"
      ? allCreds.filter((c) => c.brandSlug === args.brand)
      : allCreds;
    type Bucket = "publish_candidate" | "off_brand_delete" | "wrong_brand_for_apparel" | "needs_decision";
    type Item = { id: number; title: string; productType?: string; tags: string[]; bucket: Bucket; reason: string; adminUrl: string };
    const results = await Promise.all(brands.map(async (c) => {
      const drafts = await listShopifyDrafts(250, c.brandSlug, tenantCtx);
      const buckets: Record<Bucket, Item[]> = {
        publish_candidate: [],
        off_brand_delete: [],
        wrong_brand_for_apparel: [],
        needs_decision: []
      };
      for (const d of drafts) {
        const tags = d.tags ?? [];
        const fulfillment = tags.some((t) => t.toLowerCase().includes("zendrop") || t.toLowerCase().includes("cj-"))
          ? "zendrop"
          : "printful";
        const fit = evaluateBrandFit(
          { title: d.title, productServiceType: d.productType ?? "" },
          fulfillment as "printful" | "zendrop" | "digital",
          c.brandSlug
        );
        let bucket: Bucket = "publish_candidate";
        let reason = "on-brand, safe to publish";
        if (!fit.ok) {
          bucket = "off_brand_delete";
          reason = fit.reason ?? "fails brand-fit filter";
        } else if (c.brandSlug === "locklayer") {
          const t = (d.productType ?? "").toLowerCase();
          if (/apparel|t-shirt|hoodie|tumbler|drinkware|wall art|canvas|jersey|sweatshirt|hat|polo/.test(t)) {
            bucket = "wrong_brand_for_apparel";
            reason = `${d.productType} listed under LockLayer (hardware-only brand)`;
          } else if (tags.some((tag) => tag.startsWith("cj-pid:"))) {
            bucket = "needs_decision";
            reason = "CJ-sourced — verify margin + image quality before publish";
          }
        }
        buckets[bucket].push({
          id: d.id,
          title: d.title,
          productType: d.productType,
          tags,
          bucket,
          reason,
          adminUrl: d.adminUrl
        });
      }
      return {
        brand: c.brandSlug,
        totals: {
          off_brand_delete: buckets.off_brand_delete.length,
          wrong_brand_for_apparel: buckets.wrong_brand_for_apparel.length,
          needs_decision: buckets.needs_decision.length,
          publish_candidate: buckets.publish_candidate.length,
          total: drafts.length
        },
        buckets
      };
    }));
    return { brands: results };
  }
};

const composite_all_brand_images: OperatorTool = {
  name: "composite_all_brand_images",
  description:
    "Bulk-replace every active product's primary image with a version composited onto the BV mock background. Idempotent — products tagged `bv-bg-composited` are skipped on re-runs unless force=true. Customer-facing: the new composited image becomes primary; the original is kept as backup at position 2 unless deleteOriginal=true.\n\n" +
      "Mode picking — DEFAULT to 'editorial' for product page imagery: AI re-renders the subject as a premium editorial shot on TRANSPARENT BG, then sharp-composites onto the real BV mock BG. Wordmark in upper-left stays pixel-perfect (never hallucinated). Auto-derives gender + garment hint from product title (cropped tee → female, hat/sock → no model, men's default → male). Cost ~$0.04/image.\n\n" +
      "'ai' mode is legacy — AI generates the whole scene including BG, which often hallucinates the wordmark ('BLACA VAULT', etc.) and gets gender wrong. Use only for one-off creative experiments.\n\n" +
      "'cutout' preserves the original mockup pixel-identical on BV BG. 'sharp' is free but only works when sources are already on white seamless.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS) },
      mode: { type: "string", enum: ["editorial", "ai", "cutout", "sharp"], description: "Default: editorial." },
      productId: { type: "integer", description: "Process one product instead of all." },
      force: { type: "boolean", description: "Re-process products that already have the bv-bg-composited tag." },
      deleteOriginal: { type: "boolean", description: "Delete the original primary image after compositing. Default: false (kept as backup)." },
      dryRun: { type: "boolean", description: "List what would happen without making changes or spending money." }
    },
    required: ["brand"]
  },
  async run(args, ctx) {
    const brand = String(args.brand);
    const mode = (typeof args.mode === "string" ? args.mode : "editorial") as BgCompositeMode;
    const result = await compositeBrandImagesOnBvBg(brand, {
      mode,
      productId: typeof args.productId === "number" ? args.productId : undefined,
      force: args.force === true,
      keepOriginal: args.deleteOriginal !== true,
      dryRun: args.dryRun === true
    });
    await logActivity({
      kind: "tool_call",
      message: `composite_all_brand_images → ${brand} mode=${mode} ${result.processed}/${result.total} processed${args.dryRun ? " (dry-run)" : ""}`,
      data: { brand, mode, source: ctx.source }
    });
    return result;
  }
};

const launch_status: OperatorTool = {
  name: "launch_status",
  description:
    "Read-only readiness check. Returns a list of named checks (Shopify connection, active product count, unreviewed drafts, env vars, webhook secret, OPERATOR_AUTH_SECRET on Vercel, Printful auto-confirm posture) each with status (ok/warn/fail) and a fix hint. Use this to answer 'are we ready to launch?' with concrete data instead of guessing. Brand slug optional — omit to check every configured brand.",
  input_schema: {
    type: "object",
    properties: {
      brand: { type: "string", enum: Object.keys(BRANDS), description: "Brand slug. Omit for all configured brands." }
    }
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    // Tenants get exactly their own store's readiness via the tenant-aware
    // path; the brand arg and all-brands enumeration are founder-only.
    if (!tenantCtx.isFounder) {
      return await getTenantLaunchStatus(tenantCtx);
    }
    if (typeof args.brand === "string") {
      return await getLaunchStatus(args.brand);
    }
    const reports = await getLaunchStatusForAllBrands();
    return { reports };
  }
};

// ── Klaviyo (email marketing platform) ────────────────────────────────────

const klaviyo_status: OperatorTool = {
  name: "klaviyo_status",
  description:
    "Read-only health check on the Klaviyo integration. Verifies the KLAVIYO_API_KEY is live, returns the connected account name, lists configured, and recent campaigns. Use to confirm Klaviyo is wired before recommending any flows or sends.",
  input_schema: { type: "object", properties: {} },
  async run(_args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const health = await klaviyoHealthCheck(tenantCtx);
    if (!health.ok) return { ok: false, detail: health.detail };
    const lists = await klaviyoListLists(tenantCtx).catch(() => []);
    const campaigns = await klaviyoListCampaigns(tenantCtx).catch(() => []);
    return {
      ok: true,
      account: { id: health.accountId, organization: health.organizationName },
      lists: lists.map((l) => ({ id: l.id, name: l.name })),
      campaignCount: campaigns.length,
      recentCampaigns: campaigns.slice(0, 5).map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        sentAt: c.sentAt
      }))
    };
  }
};

const klaviyo_push_test_contact: OperatorTool = {
  name: "klaviyo_push_test_contact",
  description:
    "Push a test profile to a Klaviyo list — useful for verifying flows are firing correctly without real customer data. Requires email + listId. Use list id from klaviyo_status. Returns the new (or existing) profile id.",
  input_schema: {
    type: "object",
    properties: {
      email: { type: "string", description: "Test email — use a real inbox you control so you can verify the email lands." },
      listId: { type: "string", description: "Klaviyo list id (from klaviyo_status output)." },
      firstName: { type: "string" },
      lastName: { type: "string" }
    },
    required: ["email", "listId"]
  },
  async run(args, ctx) {
    const tenantCtx = await contextForTenantId(ctx.tenantId ?? FOUNDER_TENANT_ID);
    const email = String(args.email);
    const listId = String(args.listId);
    const upsert = await klaviyoUpsertProfile({
      email,
      firstName: typeof args.firstName === "string" ? args.firstName : undefined,
      lastName: typeof args.lastName === "string" ? args.lastName : undefined,
      properties: { source: "operator-test", testedAt: new Date().toISOString() }
    }, tenantCtx);
    if (!upsert.ok || !upsert.profileId) {
      return { ok: false, step: "profile_upsert", detail: upsert.detail };
    }
    const sub = await klaviyoSubscribeProfileToList(upsert.profileId, listId, tenantCtx);
    await logActivity({
      kind: "tool_call",
      message: `klaviyo_push_test_contact → ${email} → list ${listId} (profile ${upsert.profileId})`,
      data: { source: ctx.source }
    });
    return {
      ok: sub.ok,
      profileId: upsert.profileId,
      profileDetail: upsert.detail,
      subscribeDetail: sub.detail
    };
  }
};

// ── CEREBRO query (Graphify knowledge graph) ──────────────────────────────
// Lets the operator pull context from the project's knowledge graph before
// answering. Also logs every call to .openclaw/cerebro-usage.jsonl so we
// can build edge-weighting (STDP) on top later.

const cerebro_query: OperatorTool = {
  name: "cerebro_query",
  description:
    "Query CEREBRO — the project's local Graphify knowledge graph (codebase + docs + conversation history + memory). Three modes: 'query' (BFS traversal for a question), 'explain' (a single node and its neighbors), 'path' (shortest path between two concepts). Use this BEFORE searching files when you need cross-cutting context about decisions, conventions, or how parts of the system relate. Stays local; no API spend.",
  input_schema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["query", "explain", "path"],
        description: "query=BFS for question; explain=node+neighbors; path=A to B"
      },
      question: { type: "string", description: "For mode=query, the question text" },
      node: { type: "string", description: "For mode=explain, the concept/file/function name" },
      from: { type: "string", description: "For mode=path, the source concept" },
      to: { type: "string", description: "For mode=path, the destination concept" },
      budget: { type: "integer", minimum: 200, maximum: 5000, description: "Token budget cap for query mode (default 2000)" }
    },
    required: ["mode"]
  },
  async run(args, ctx) {
    const { spawnSync } = await import("node:child_process");
    const fs = await import("node:fs");
    const path = await import("node:path");

    const mode = args.mode as "query" | "explain" | "path";
    const budget = typeof args.budget === "number" ? args.budget : 2000;

    let cliArgs: string[];
    let inputLabel: string;
    if (mode === "query") {
      const q = String(args.question ?? "").trim();
      if (!q) return { ok: false, error: "mode=query requires a 'question' arg" };
      cliArgs = ["query", q, "--budget", String(budget)];
      inputLabel = q;
    } else if (mode === "explain") {
      const n = String(args.node ?? "").trim();
      if (!n) return { ok: false, error: "mode=explain requires a 'node' arg" };
      cliArgs = ["explain", n];
      inputLabel = n;
    } else if (mode === "path") {
      const a = String(args.from ?? "").trim();
      const b = String(args.to ?? "").trim();
      if (!a || !b) return { ok: false, error: "mode=path requires both 'from' and 'to'" };
      cliArgs = ["path", a, b];
      inputLabel = `${a} -> ${b}`;
    } else {
      return { ok: false, error: `unknown mode: ${mode}` };
    }

    // Run graphify
    const result = spawnSync("graphify", cliArgs, {
      encoding: "utf8",
      timeout: 60_000,
      cwd: process.cwd()
    });

    if (result.error) {
      return { ok: false, error: `CEREBRO unavailable: ${result.error.message}` };
    }
    const stdout = (result.stdout || "").trim();
    const stderr = (result.stderr || "").trim();

    // Parse node names from stdout (lines starting with "NODE ")
    const nodeMatches = [...stdout.matchAll(/^NODE\s+([^\s\[]+)/gm)].map((m) => m[1]);
    // Cap returned text to fit a sensible context envelope
    const truncated = stdout.length > 8000 ? stdout.slice(0, 8000) + "\n...[truncated]" : stdout;

    // Append to usage log for STDP/hot-nodes analysis
    try {
      const logDir = path.join(".openclaw");
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      const entry = {
        ts: new Date().toISOString(),
        mode,
        input: inputLabel,
        budget: mode === "query" ? budget : undefined,
        returnedNodes: nodeMatches,
        nodeCount: nodeMatches.length,
        source: ctx.source,
        conversationId: ctx.conversationId,
        exitStatus: result.status
      };
      fs.appendFileSync(path.join(logDir, "cerebro-usage.jsonl"), JSON.stringify(entry) + "\n");
    } catch (e) {
      // Don't fail the tool call because logging broke
    }

    await logActivity({
      kind: "tool_call",
      message: `cerebro_query (${mode}) "${inputLabel.slice(0, 80)}" -> ${nodeMatches.length} nodes`,
      data: { source: ctx.source, mode, returnedNodes: nodeMatches.slice(0, 10) }
    });

    return {
      ok: true,
      mode,
      input: inputLabel,
      returnedNodeCount: nodeMatches.length,
      topNodes: nodeMatches.slice(0, 15),
      raw: truncated,
      stderr: stderr || undefined
    };
  }
};

// ── Registry ──────────────────────────────────────────────────────────────

export const OPERATOR_TOOLS: OperatorTool[] = [
  list_drafts,
  get_recent_orders,
  search_cj_products,
  materialize_product,
  delete_listing,
  list_cleanup_queue,
  publish_listing,
  bootstrap_store,
  relink_printful_variants,
  attach_all_to_online_store,
  transparentize_brand_images,
  list_menus,
  add_menu_item,
  remove_menu_item,
  propose_action,
  request_human_input,
  record_note,
  intake_brand_profile,
  run_pipeline,
  generate_policies,
  publish_policies,
  create_content_drop,
  list_content_drops_tool,
  get_content_drop,
  generate_content_drop_run,
  mark_content_post_posted,
  get_spend_summary,
  set_spend_budget,
  composite_on_bv_background,
  composite_all_brand_images,
  summarize_drafts,
  launch_status,
  klaviyo_status,
  klaviyo_push_test_contact,
  cerebro_query
];

export function getToolByName(name: string): OperatorTool | undefined {
  return OPERATOR_TOOLS.find((t) => t.name === name);
}

export function toAnthropicTools() {
  return OPERATOR_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema
  }));
}

export type { Proposal };
