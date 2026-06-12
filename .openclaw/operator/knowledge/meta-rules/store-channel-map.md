# Store / channel map — what the operator can manage (2026-06-11)

The operator ships under multiple brands (see `lib/brands.ts`). Connection reality:

| Brand | Channel | Printful store | Operator can manage? |
|---|---|---|---|
| **Black Vault Apparel** (`black-vault-apparel`) | Shopify (headless) | 18096964 (Manual/API) | ✅ FULLY — Shopify Admin API + Printful API both work. Products created via the design pipeline. |
| **GthicPrintables** (`gthic-printables`) | **Etsy** | 10020261 (Etsy-platform) | ⚠️ PARTIAL — brand-aware (voice + design + SEO generation). Store ops are **UI-only**: Printful API can't create products/templates in an Etsy-platform store (400/404). Programmatic listing mgmt needs the **Etsy Open API** (app pending personal approval). |
| **LockLayer** (`locklayer`) | Shopify | — | ❌ NOT CONNECTED — `SHOPIFY_API_KEY` / `SHOPIFY_STORE_DOMAIN` (unprefixed) are MISSING from `.env.local`. Mint a token to connect. Default fulfillment is CJ, not Printful. |

## Key facts
- Printful token is ACCOUNT-level — one token sees all stores (select via `X-PF-Store-Id`). But the sync-products API only works on Manual/API stores (Black Vault), not platform stores (GthicPrintables = Etsy).
- Black Vault = the proven, fully-automatable path. New BV products: `node scripts/design-pipeline.mjs <config>`.
- GthicPrintables: generate designs + Etsy SEO with the operator; founder uploads via Printful UI until the Etsy API is live. See [[etsy-gthic-strategy]].
- To fully connect LockLayer or unlock GthicPrintables automation, the missing credential/approval must land first — surface it loudly, don't assume it's wired.
