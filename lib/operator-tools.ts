import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { listShopifyDrafts, deleteShopifyProduct } from "@/lib/shopify-service";
import { listConfiguredShopifyCredentials, resolveShopifyCredentials } from "@/lib/shopify-credentials";
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

// Each tool the operator can call is declared once here:
//   - schema: JSONSchema Anthropic uses to constrain tool_use
//   - run:    server-side implementation
// The agent loop in lib/operator-agent.ts dispatches by tool name.

export type OperatorToolContext = {
  conversationId?: string;
  source: "chat" | "tick";
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
  brandSlug: string,
  sinceIsoDate: string
): Promise<{ brandSlug: string; orders: ShopifyOrder[]; error?: string }> {
  try {
    const creds = resolveShopifyCredentials(brandSlug);
    const url = `https://${creds.storeDomain}/admin/api/${creds.apiVersion}/orders.json?status=any&created_at_min=${encodeURIComponent(sinceIsoDate)}&limit=250&fields=id,created_at,total_price,currency,financial_status,line_items`;
    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": creds.token,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      return { brandSlug, orders: [], error: `Shopify orders ${response.status}` };
    }
    const body = (await response.json()) as { orders?: ShopifyOrder[] };
    return { brandSlug, orders: body.orders ?? [] };
  } catch (error) {
    return {
      brandSlug,
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
  async run(args) {
    const brand = typeof args.brand === "string" && args.brand !== "all" ? args.brand : undefined;
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const drafts = await listShopifyDrafts(limit, brand);
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
  async run(args) {
    const sinceDays = typeof args.sinceDays === "number" ? args.sinceDays : 30;
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const targetBrand = typeof args.brand === "string" && args.brand !== "all" ? args.brand : null;

    const allCreds = listConfiguredShopifyCredentials();
    const targets = targetBrand ? allCreds.filter((c) => c.brandSlug === targetBrand) : allCreds;

    const results = await Promise.all(
      targets.map((creds) => fetchRecentOrdersForBrand(creds.brandSlug, since))
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
  async run(args) {
    const kw = String(args.categoryKeywords || "");
    const pageSize = typeof args.pageSize === "number" ? args.pageSize : 20;
    const regex = new RegExp(kw, "i");
    const categories = await findCjCategoryIds(regex);
    if (categories.length === 0) {
      return { categories: [], products: [] };
    }
    const primary = categories[0];
    const products = await searchCjProducts({ categoryId: primary.id, pageSize });
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
    "Create a Shopify draft listing autonomously. Drafts are reversible and not customer-facing, so this does NOT need approval. For Printful/apparel, omit sourceProductId. For LockLayer/CJ, pass sourceProductId from search_cj_products. Brand defaults from fulfillmentType.",
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
      imagePrompt: { type: "string", description: "Print-on-demand artwork direction (Printful only)." }
    },
    required: ["title", "description", "productType", "fulfillmentType"]
  },
  async run(args, ctx) {
    const input: MaterializationInput = {
      runtimeId: newId("op"),
      title: String(args.title),
      description: String(args.description),
      productType: String(args.productType),
      fulfillmentType: String(args.fulfillmentType) as FulfillmentType,
      brand: typeof args.brand === "string" ? args.brand : undefined,
      niche: typeof args.niche === "string" ? args.niche : undefined,
      sourceProductId: typeof args.sourceProductId === "string" ? args.sourceProductId : undefined,
      imagePrompt: typeof args.imagePrompt === "string" ? args.imagePrompt : undefined
    };
    const result = await materializeProduct(input);
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
    const productId = Number(args.productId);
    const brand = String(args.brand);
    const reason = String(args.reason || "no reason given");
    const result = await deleteShopifyProduct(productId, brand);
    await logActivity({
      kind: "tool_call",
      message: `delete_listing → ${productId} (${brand})`,
      data: { reason, source: ctx.source }
    });
    return { ...result, reason };
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
      { briefMarkdown, roiCsv }
    );

    await logActivity({
      kind: "proposal_created",
      message: `Proposal "${proposal.title}" created — $${proposal.estimatedCostUsd} est. cost`,
      data: { proposalId: proposal.id, source: ctx.source }
    });

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
    const task = await writeHumanTask({
      id: newId("task"),
      title: String(args.title),
      detail: String(args.detail),
      why: String(args.why),
      source: { kind: ctx.source, conversationId: ctx.conversationId }
    });
    await logActivity({
      kind: "task_created",
      message: `Human task: ${task.title}`,
      data: { taskId: task.id, source: ctx.source }
    });
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
  async run(args) {
    const note = String(args.note || "").trim();
    if (!note) return { saved: false };
    await appendOperatorMemory(note);
    await logActivity({ kind: "note", message: note });
    return { saved: true };
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

const POLICY_OUTPUT_ROOT = path.join(process.cwd(), ".openclaw", "policies");

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
    const brandSlug = String(args.brand);
    const config = await loadPolicyConfig(brandSlug);
    const policies = generateAllPolicies(config);
    const dir = path.join(POLICY_OUTPUT_ROOT, brandSlug);
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
    const brandSlug = String(args.brand);
    const config = await loadPolicyConfig(brandSlug);
    const policies = generateAllPolicies(config);
    const results = await pushAllPolicies(brandSlug, policies);
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
    "Run the full content drop pipeline for a drop that already has source photos uploaded. Generates lifestyle images (gpt-image-1), videos (Runway/Luma if configured), and platform-specific captions (Claude). Long-running — typically 2–6 minutes depending on configuration. Costs roughly $0.50–$5 per drop depending on whether videos are enabled.",
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
    });
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
  async run(args) {
    const sinceDays = typeof args.sinceDays === "number" ? args.sinceDays : undefined;
    const summary = await summarizeSpend(sinceDays ? { sinceDays } : {});
    const budgetStatus = await getBudgetStatus();
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
  async run(args) {
    const monthlyCapUsd = Number(args.monthlyCapUsd ?? 0);
    const warnAtPct = typeof args.warnAtPct === "number" ? Number(args.warnAtPct) : 80;
    await writeBudget({ monthlyCapUsd, warnAtPct });
    const status = await getBudgetStatus();
    return { ok: true, budgetStatus: status };
  }
};

// ── Registry ──────────────────────────────────────────────────────────────

export const OPERATOR_TOOLS: OperatorTool[] = [
  list_drafts,
  get_recent_orders,
  search_cj_products,
  materialize_product,
  delete_listing,
  propose_action,
  request_human_input,
  record_note,
  run_pipeline,
  generate_policies,
  publish_policies,
  create_content_drop,
  list_content_drops_tool,
  get_content_drop,
  generate_content_drop_run,
  mark_content_post_posted,
  get_spend_summary,
  set_spend_budget
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
