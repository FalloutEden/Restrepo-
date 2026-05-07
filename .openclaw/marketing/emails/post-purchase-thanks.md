# Post-purchase thanks (sends immediately after order confirmation)

## Subject lines

1. `Thanks. Your order's on it.`
2. `Order confirmed — what happens next.`
3. `It's in motion.`

## Preview text

`Made-to-order, embroidered, shipping in 3–7 business days.`

## Body

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0E0C; color:#D4B896; font-family: Georgia, serif;">
  <tr>
    <td align="center" style="padding:48px 24px;">

      <h1 style="font-size:24px; line-height:1.3; margin:0 0 16px;">
        Thank you, {{ customer.first_name }}.
      </h1>

      <p style="font-size:15px; max-width:520px; line-height:1.7; margin:0 0 16px;">
        Order #{{ order.name }} is confirmed. Each BV piece is made to order — your hoodie or tee or hat does not exist yet, in the strict sense. Production starts within 24 hours, and embroidery + finishing takes 3–7 business days before it ships.
      </p>

      <p style="font-size:15px; max-width:520px; line-height:1.7; margin:0 0 16px;">
        We do this on purpose. Made-to-order means no warehouse pile of unsold inventory turning into landfill. The trade is patience for waste avoidance, and we think it's the right trade.
      </p>

      <p style="font-size:15px; max-width:520px; line-height:1.7; margin:0 0 32px;">
        You'll get a tracking number the moment your order leaves the line.
      </p>

      <!-- Order summary -->
      <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px; max-width:520px; text-align:left; border-top:1px solid rgba(212,184,150,0.2); padding-top:16px;">
        {% for line in order.line_items %}
        <tr>
          <td style="padding:8px 0; font-size:14px;">{{ line.title }} — {{ line.variant_title }}</td>
          <td style="padding:8px 0; font-size:14px; text-align:right;">${{ line.price }}</td>
        </tr>
        {% endfor %}
        <tr>
          <td style="padding:16px 0 8px; font-size:14px; border-top:1px solid rgba(212,184,150,0.2);">Total</td>
          <td style="padding:16px 0 8px; font-size:14px; text-align:right; border-top:1px solid rgba(212,184,150,0.2); color:#fff;">${{ order.total_price }}</td>
        </tr>
      </table>

      <a href="{{ order.status_url }}" style="display:inline-block; background:#D4B896; color:#0F0E0C; text-decoration:none; padding:14px 32px; font-size:13px; letter-spacing:0.1em; text-transform:uppercase;">
        Track your order
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

- This email replaces (or augments) Shopify's default order-confirmation. If using Shopify Email, set this as the order-confirmation override. If using Klaviyo, this fires alongside Shopify's confirmation — the Klaviyo one carries brand voice, Shopify's carries the receipt.
- The "made-to-order, no landfill inventory" line is **brand-true**: Printful is dropship POD, every order is produced fresh. This is a real differentiator vs. Bonobos/Everlane who hold inventory.
- 3–7 business days is realistic for Printful US production + standard ship. Adjust if Printful shipping settings change.
