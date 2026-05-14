// Human-readable display labels for operator tool names. Used by the chat
// surface so merchants see "Saving your brand profile..." instead of
// "→ intake_brand_profile({...})". Pure UI translation — kept separate
// from lib/operator-tools.ts (which is server-only) so the client can
// import it without pulling in server dependencies.
//
// Gap 5 of the 2026-05-14 BYOK launch-gate dossier: tool names leak into
// chat. Fix: translate at the surface, never show raw names or param
// JSON in user-facing chat bubbles.

export type ToolLabel = {
  /** Active-tense, shown while the tool is running ("→" prefix). */
  active: string;
  /** Past-tense, shown after success ("✓" prefix). */
  done: string;
};

const TOOL_LABELS: Record<string, ToolLabel> = {
  // Tenant-safe (always available)
  intake_brand_profile: {
    active: "Saving what we just learned about your brand",
    done: "Brand profile updated"
  },
  record_note: {
    active: "Saving a note for next time",
    done: "Note saved"
  },
  propose_action: {
    active: "Drafting a proposal for your approval inbox",
    done: "Proposal drafted"
  },
  request_human_input: {
    active: "Queuing a task only you can complete",
    done: "Task queued for you"
  },
  get_spend_summary: {
    active: "Pulling spend summary",
    done: "Spend summary ready"
  },
  set_spend_budget: {
    active: "Updating spend cap",
    done: "Spend cap updated"
  },

  // Shopify (founder-only until BYOK pass)
  list_drafts: {
    active: "Pulling your draft catalog",
    done: "Draft catalog loaded"
  },
  get_recent_orders: {
    active: "Pulling recent orders",
    done: "Recent orders loaded"
  },
  delete_listing: {
    active: "Removing a draft",
    done: "Draft removed"
  },
  publish_listing: {
    active: "Publishing the listing",
    done: "Listing published"
  },
  list_cleanup_queue: {
    active: "Scanning the cleanup queue",
    done: "Cleanup queue scanned"
  },
  bootstrap_store: {
    active: "Setting up your store",
    done: "Store setup done"
  },
  attach_all_to_online_store: {
    active: "Attaching products to your Online Store",
    done: "Products attached"
  },
  list_menus: {
    active: "Reading your store navigation",
    done: "Navigation loaded"
  },
  add_menu_item: {
    active: "Adding a menu item",
    done: "Menu item added"
  },
  remove_menu_item: {
    active: "Removing a menu item",
    done: "Menu item removed"
  },
  transparentize_brand_images: {
    active: "Cleaning up product image backgrounds",
    done: "Images cleaned"
  },
  composite_on_bv_background: {
    active: "Compositing onto brand background",
    done: "Image composited"
  },
  composite_all_brand_images: {
    active: "Compositing the full catalog onto brand background",
    done: "Catalog composited"
  },
  summarize_drafts: {
    active: "Summarizing draft catalog",
    done: "Drafts summarized"
  },
  launch_status: {
    active: "Checking launch readiness",
    done: "Launch readiness checked"
  },
  generate_policies: {
    active: "Drafting your store policies",
    done: "Policies drafted"
  },
  publish_policies: {
    active: "Publishing your store policies",
    done: "Policies published"
  },

  // CJ + Printful
  search_cj_products: {
    active: "Searching the supplier catalog",
    done: "Supplier catalog searched"
  },
  materialize_product: {
    active: "Building a new product draft",
    done: "Product draft built"
  },
  relink_printful_variants: {
    active: "Wiring fulfillment variants to your store",
    done: "Variants wired"
  },

  // Klaviyo
  klaviyo_status: {
    active: "Checking your email platform connection",
    done: "Email platform checked"
  },
  klaviyo_push_test_contact: {
    active: "Pushing a test contact to your email platform",
    done: "Test contact sent"
  },

  // Content studio
  create_content_drop: {
    active: "Creating a content drop",
    done: "Content drop created"
  },
  list_content_drops: {
    active: "Listing your content drops",
    done: "Drops listed"
  },
  get_content_drop: {
    active: "Loading a content drop",
    done: "Drop loaded"
  },
  generate_content_drop_run: {
    active: "Generating lifestyle photos + captions",
    done: "Content generated"
  },
  mark_content_post_posted: {
    active: "Marking a post as published",
    done: "Post marked"
  },

  // Pipeline + CEREBRO
  run_pipeline: {
    active: "Running the research pipeline",
    done: "Pipeline started"
  },
  cerebro_query: {
    active: "Searching the operator's knowledge graph",
    done: "Knowledge graph searched"
  }
};

/** Fallback label for tools that don't have an explicit entry. Strips the
 *  underscore-cased name into something readable so unknown tools don't
 *  leak raw identifiers. */
function defaultLabel(name: string): ToolLabel {
  const pretty = name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { active: `Working: ${pretty}`, done: `${pretty} done` };
}

export function labelForTool(name: string): ToolLabel {
  return TOOL_LABELS[name] ?? defaultLabel(name);
}
