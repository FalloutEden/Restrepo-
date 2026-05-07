# Abandoned cart — Email 2 of 2 (sends 24 hours after abandon if email 1 didn't recover)

## Subject lines

1. `One last note on your bag.`
2. `Released or claimed?`
3. `{{first_name}}, before we release it.`

## Preview text

`Items hold for one more day, then go back to inventory. No pressure.`

## Body

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0E0C; color:#D4B896; font-family: Georgia, serif;">
  <tr>
    <td align="center" style="padding:48px 24px;">

      <h1 style="font-size:22px; line-height:1.3; margin:0 0 16px;">
        Before we release it back.
      </h1>

      <p style="font-size:15px; max-width:480px; line-height:1.6; margin:0 0 24px;">
        Your bag is still here. We hold abandoned bags for 48 hours so people who got pulled away mid-checkout don't lose them. After that they go back to inventory.
      </p>

      <p style="font-size:15px; max-width:480px; line-height:1.6; margin:0 0 24px;">
        If you wanted to come back and finish — now's the moment.
      </p>

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
        Finish checkout
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

- "We hold abandoned bags for 48 hours" is brand-honest framing — if you want, this can be a real soft-reservation policy backed by the cart cookie. Either way, the language reads as restraint, not as a fake countdown.
- **Discount discipline:** if you do offer a recovery discount, NEVER more than 10%, and use a single-use code per recipient (Klaviyo can generate). A blanket public code trains everyone to abandon.
- After this email: stop. Do not chase abandoned carts beyond 48h — premium positioning collapses if you nag.
