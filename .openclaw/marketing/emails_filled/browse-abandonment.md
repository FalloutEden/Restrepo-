# Browse abandonment (sends 4 hours after a logged-in viewer browsed a product without adding to cart)

## Subject lines

1. `{{ event.viewed_product.title }}.`
2. `Built to be Kept.`
3. `Still thinking about it?`

## Preview text

`Heavyweight cotton, embroidered. Tap to revisit when you're ready.`

## Body

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0E0C; color:#D4B896; font-family: Georgia, serif;">
  <tr>
    <td align="center" style="padding:48px 24px;">

      <img src="{{ event.viewed_product.image_url }}" alt="{{ event.viewed_product.title }}" width="320" style="display:block; max-width:100%; margin:0 auto 24px;" />

      <h1 style="font-size:22px; line-height:1.3; margin:0 0 16px;">
        {{ event.viewed_product.title }}
      </h1>

      <p style="font-size:14px; max-width:480px; line-height:1.6; margin:0 0 24px;">
        {{ event.viewed_product.description | truncate: 300 }}
      </p>

      <a href="{{ event.viewed_product.url }}" style="display:inline-block; background:#D4B896; color:#0F0E0C; text-decoration:none; padding:14px 32px; font-size:13px; letter-spacing:0.1em; text-transform:uppercase;">
        Take another look
      </a>

      <p style="font-size:13px; color:rgba(212,184,150,0.6); margin:48px 0 0;">
        Built to be Kept.<br/>
        — Black Vault Apparel
      </p>

    </td>
  </tr>
</table>
```

## Notes

- Klaviyo's "Viewed Product" metric requires the Klaviyo onsite tracking script installed via Shopify. This flow won't work on Shopify Email native — Shopify Email doesn't have browse tracking.
- Trigger only on identified visitors (i.e., someone who has previously given an email). Anonymous browse abandonment isn't actionable until they self-identify.
