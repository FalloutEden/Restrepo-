# Tenant capabilities — what works for a merchant on their own keys (BYOK)

_Last updated 2026-06-10. This file tells you (the operator) which of your tools
a real tenant can use, so you never promise something that's still founder-only
and never silently spend the founder's money. Founder/admin context keeps ALL
tools; the list below is about the TENANT (btk_) context._

## The principle: offer options, don't limit

When a merchant wants to do something, present the available tools and let them
choose — with honest warnings about trade-offs. Don't decide for them, and don't
hard-block a path just because it has a quality risk; warn and let them pick.

## Tools a tenant CAN use today (lifted to per-tenant credentials)

Resolved from the tenant's encrypted vault (no founder-key fallback — if a key
isn't configured, the tool returns a clear "configure it in your dashboard"
error):

- **Shopify store ops:** list_drafts, get_recent_orders, list_cleanup_queue,
  publish_listing, attach_all_to_online_store, relink_printful_variants,
  delete_listing, summarize_drafts, launch_status
- **Storefront nav + policies:** list_menus, add_menu_item, remove_menu_item,
  generate_policies, publish_policies
- **Onboarding:** bootstrap_store
- **Sourcing:** search_cj_products (tenant's own CJ account)
- **Email:** klaviyo_status, klaviyo_push_test_contact (tenant's own Klaviyo key)
- **Product creation:** materialize_product (see the image menu below)
- **Always-on (no credentials):** record_note, propose_action,
  request_human_input, get_spend_summary, set_spend_budget

## Product creation — the artwork menu (materialize_product, Printful)

ASK the merchant how they want the design; offer all four, don't pick for them:

1. **Upload their own** print-ready transparent PNG → pass `printFileUrl`. We run
   a resolution/transparency check and WARN (never block) if it's below ~1800px
   on the long edge (≈150 DPI for a 12in print) or has no alpha.
2. **Generate with OpenAI** (`imageProvider: "openai"`, gpt-image-1) — fast, but
   can corrupt small text/fine detail. Always surface the "review before
   publishing" warning the tool returns.
3. **Generate with Google Nano Banana 2** (`imageProvider: "google"`,
   gemini-3.1-flash-image) — renders text far more reliably; recommended AI
   option. Still tell them to review before publishing.
4. **Mirror from Printful** — the merchant designs in Printful's UI, you import
   it read-only and write the listing copy. Best for full creative control.

The merchant needs a Printful default blank (`printfulDefaultVariantId`) + their
Printful key configured for auto-build. AI providers need the matching key
(OpenAI / Google Gemini) in their vault.

## Still founder-only (don't offer these to tenants yet)

create_content_drop / list_content_drops / get_content_drop /
generate_content_drop_run / mark_content_post_posted (content studio),
transparentize_brand_images, composite_on_bv_background,
composite_all_brand_images, run_pipeline, cerebro_query. If a tenant asks for
one, say it's coming and offer record_note / propose_action / request_human_input
to capture the intent. (Update this list as tools are lifted.)
