# Welcome — Email 1 of 3 (sends immediately)

## Subject lines (split-test all 3)

1. `Welcome to Black Vault.`
2. `What you just signed up for.`
3. `Built to be Kept.`

## Preview text

`No discount codes. No daily emails. Construction-first apparel.`

## Body

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0E0C; color:#D4B896; font-family: Georgia, 'Times New Roman', serif;">
  <tr>
    <td align="center" style="padding:48px 24px;">

      <!-- BV mark -->
      <img src="https://cdn.shopify.com/s/files/1/0674/3991/9202/files/BV_Gold.png?v=1778179677" alt="Black Vault Apparel" width="64" style="display:block; margin:0 auto 32px;" />

      <!-- Headline -->
      <h1 style="font-family: Georgia, serif; font-size:28px; line-height:1.3; color:#D4B896; margin:0 0 24px; letter-spacing:0.02em;">
        You're on the list.
      </h1>

      <p style="font-size:16px; line-height:1.6; max-width:520px; margin:0 0 24px;">
        Black Vault Apparel is built around one idea: that the apparel you wear most should be the apparel that lasts longest. Heavyweight cottons. Embroidered marks, not printed ones. Construction details we'll tell you outright — GSM, mill, thread color — because we want you inspecting them.
      </p>

      <p style="font-size:16px; line-height:1.6; max-width:520px; margin:0 0 32px;">
        We don't run discount codes. We don't email you every day. We send three emails over the next week so you know exactly what BV is, then we get out of your inbox until something we make is ready for you.
      </p>

      <a href="https://blackvaultapparel.com/collections/all" style="display:inline-block; background:#D4B896; color:#0F0E0C; text-decoration:none; padding:14px 32px; font-family: 'Helvetica Neue', sans-serif; font-size:13px; letter-spacing:0.1em; text-transform:uppercase;">
        See the launch collection
      </a>

      <p style="font-size:13px; line-height:1.5; color:rgba(212,184,150,0.6); margin:48px 0 0; max-width:480px;">
        Built to be Kept.<br/>
        — Black Vault Apparel
      </p>

    </td>
  </tr>
</table>
```

## CTA target

`https://blackvaultapparel.com/collections/all`

## Notes

- `https://cdn.shopify.com/s/files/1/0674/3991/9202/files/BV_Gold.png?v=1778179677` should resolve to a Shopify-hosted CDN URL of `BV Gold.png` (already in `.openclaw/brand/`). Upload it to Shopify Files and paste the URL.
- `https://blackvaultapparel.com/collections/all` — same as the CTA target above. Klaviyo will substitute.
- This email is intentionally restrained. Do not add discount codes, social icons, or "follow us" prompts. Premium apparel = restrained welcome.
