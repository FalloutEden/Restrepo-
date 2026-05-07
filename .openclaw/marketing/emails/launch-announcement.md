# Launch announcement (one-off broadcast — send to entire list when launch is live)

## Subject lines (split-test in Klaviyo with even split)

1. `Black Vault is open.`
2. `It's live.`
3. `Six pieces. Built to be Kept.`

## Preview text

`Heavyweight cotton. Embroidered Old Gold. The whole launch line is live now.`

## Send timing

- Send: **Tuesday or Thursday, 10am MST**. Premium menswear opens better mid-week, mid-morning, in the buyer's local timezone (split by Klaviyo's smart-send if list is large enough).
- **Do not** send Monday morning (lost in inbox), Friday afternoon (people in weekend mode), or weekend (lower commercial intent).

## Body

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0E0C; color:#D4B896; font-family: Georgia, serif;">
  <tr>
    <td align="center" style="padding:0;">

      <!-- Hero -->
      <img src="{{HERO_IMAGE_URL}}" alt="Black Vault Apparel" width="600" style="display:block; max-width:100%; margin:0;" />

      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:48px 24px;">

            <h1 style="font-size:32px; line-height:1.2; margin:0 0 16px; letter-spacing:0.02em;">
              It's open.
            </h1>

            <p style="font-size:16px; max-width:520px; line-height:1.7; margin:0 0 24px;">
              Six pieces. Each one chosen because it's the best build at its price. Heavyweight cottons, embroidered marks, mills you can verify. No collection-wide discount, no inventory padding, no gimmicks.
            </p>

            <p style="font-size:16px; max-width:520px; line-height:1.7; margin:0 0 32px; color:rgba(212,184,150,0.85);">
              The Heavyweight Hoodie. The Crewneck. The Long Sleeve. The Vault Tee. The Monogram Tee. The Snapback. The Beanie. The whole line is live now.
            </p>

            <a href="{{COLLECTION_URL}}" style="display:inline-block; background:#D4B896; color:#0F0E0C; text-decoration:none; padding:16px 40px; font-size:14px; letter-spacing:0.12em; text-transform:uppercase;">
              Shop the collection
            </a>

            <p style="font-size:13px; color:rgba(212,184,150,0.6); margin:48px 0 0;">
              Built to be Kept.<br/>
              — Black Vault Apparel
            </p>

          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

## CTA target

`https://blackvaultapparel.com/collections/all`

## Pre-flight checklist before sending

- [ ] Hero image (`{{HERO_IMAGE_URL}}`) is a Shopify-Files-hosted CDN URL (not a local path)
- [ ] All 7 product pages return 200 and load on mobile in < 3s
- [ ] Stripe / Shopify Payments is on (not "Bogus Gateway") and the test card has been removed
- [ ] Order-paid webhook fires correctly (place a $0 verify order via Shopify Bogus → confirm Vercel function logs hit, then disable Bogus)
- [ ] Email-list compliance: Klaviyo / Shopify Email has SPF + DKIM + DMARC validated for blackvaultapparel.com
- [ ] Sending domain is **NOT** the bare blackvaultapparel.com root — use `news.blackvaultapparel.com` or `mail.blackvaultapparel.com` for marketing, keep the root reserved for transactional. Otherwise a single spam complaint hits your transactional reputation.
- [ ] List is segmented to "engaged in last 60 days" — don't blast cold subscribers, that tanks domain reputation.

## Notes

- This is the only "discount-eligible" email in the welcome era. If you do offer a launch promo (e.g., free shipping over $100), include it here — but **not as a percentage discount on apparel**. Free shipping reads as policy, percentage discounts read as desperation.
