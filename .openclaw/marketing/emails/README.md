# BV email campaigns — drop-in for Klaviyo or Shopify Email

These are written in BV brand voice, ready to paste. Each file has:
- **Subject lines** (3 variants for split-test)
- **Preview text**
- **Body HTML** (Shopify Email + Klaviyo both accept inline HTML; for Klaviyo use the drag-and-drop builder and paste each block in)
- **CTA target**
- **Send timing** relative to the trigger event

## Recommended ESP

**Klaviyo** if you want segmentation + abandoned cart that talks to Shopify checkout deeply. **Shopify Email** if you want to launch tonight without integrating another tool — it's already wired and the first 10K emails/month are free.

If you go Shopify Email for launch and switch to Klaviyo later, the templates here paste cleanly into either.

## The flows you need on day 1

| Flow | File | Trigger |
|---|---|---|
| Welcome series (3 emails) | `welcome-1.md`, `welcome-2.md`, `welcome-3.md` | Email signup |
| Abandoned checkout | `abandoned-cart-1.md`, `abandoned-cart-2.md` | Cart abandoned |
| Browse abandonment | `browse-abandonment.md` | Product viewed, no cart |
| Post-purchase | `post-purchase-thanks.md` | Order placed |
| Launch announcement | `launch-announcement.md` | One-off broadcast |
| Re-engagement (day 60) | `re-engagement.md` | No open in 60 days |

## Brand-voice rails for any future email you write

- **Subject lines under 50 chars.** Premium brands don't shout.
- **No emoji.** Saint Laurent doesn't email you with a 🔥.
- **Lead with construction, not "deals".** GSM, mill, embroidery thread.
- **Single CTA per email.** Premium aesthetic = one decision per page.
- **Mobile-first.** 70% of opens are mobile. Hero image must be 1:1 or 4:5, never 16:9.
