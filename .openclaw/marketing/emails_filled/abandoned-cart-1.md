# Abandoned cart — Email 1 of 2 (sends 1 hour after abandon)

## Subject lines

1. `Still in your cart.`
2. `{{first_name}}, your bag.`
3. `One step away.`

## Preview text

`Heavyweight cotton, embroidered monogram. Yours when you're ready.`

## Body

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0E0C; color:#D4B896; font-family: Georgia, serif;">
  <tr>
    <td align="center" style="padding:48px 24px;">

      <h1 style="font-size:22px; line-height:1.3; margin:0 0 16px;">
        Still in your bag.
      </h1>

      <p style="font-size:15px; max-width:480px; line-height:1.6; margin:0 0 24px;">
        No pressure, no countdown. Premium pieces aren't impulse buys. Just letting you know your bag is held — pick up where you left off any time.
      </p>

      <!-- Cart items -->
      {% for line in cart.items %}
      <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px; max-width:480px; border-top:1px solid rgba(212,184,150,0.2);">
        <tr>
          <td style="padding:16px 8px;" width="120" align="left">
            <img src="{{ line.image }}" alt="{{ line.title }}" width="100" style="display:block;" />
          </td>
          <td style="padding:16px 8px;" align="left" valign="top">
            <div style="font-size:15px; color:#fff;">{{ line.title }}</div>
            <div style="font-size:13px; color:rgba(212,184,150,0.7);">{{ line.variant_title }}</div>
            <div style="font-size:14px; margin-top:8px;">${{ line.price }}</div>
          </td>
        </tr>
      </table>
      {% endfor %}

      <a href="{{CART_RECOVERY_URL}}" style="display:inline-block; margin-top:24px; background:#D4B896; color:#0F0E0C; text-decoration:none; padding:14px 32px; font-size:13px; letter-spacing:0.1em; text-transform:uppercase;">
        Return to your bag
      </a>

      <p style="font-size:13px; color:rgba(212,184,150,0.6); margin:48px 0 0;">
        Built to be Kept.<br/>
        — Black Vault Apparel
      </p>

    </td>
  </tr>
</table>
```

## CTA target

The abandoned-checkout recovery URL — Klaviyo and Shopify both populate this automatically as `{{ event.checkout_url }}` (Klaviyo) or `{{ checkout.abandoned_checkout_url }}` (Shopify Email).

## Notes

- The Liquid loop syntax (`{% for ... %}`) works in both Klaviyo and Shopify Email native templates. If pasting into Klaviyo's drag-and-drop builder, use their dynamic-content blocks instead.
- **Do not include a discount code in this email.** Premium brands that discount within an hour of abandon train customers to abandon every cart. The first-touch is just a reminder.
- If you must add a discount, save it for `abandoned-cart-2` (24 hours later) and make it 10% max.
