# Welcome — Email 3 of 3 (sends 5 days after signup)

## Subject lines

1. `One last note.`
2. `The full collection.`
3. `Six pieces, no gimmicks.`

## Preview text

`The whole BV launch line — six pieces, each chosen to outlast the wardrobe around them.`

## Body

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0E0C; color:#D4B896; font-family: Georgia, 'Times New Roman', serif;">
  <tr>
    <td align="center" style="padding:48px 24px;">

      <h1 style="font-size:24px; line-height:1.3; margin:0 0 16px; max-width:520px;">
        The full collection.
      </h1>

      <p style="font-size:15px; line-height:1.6; max-width:520px; margin:0 0 32px;">
        Six pieces. Each one chosen because it's the best build at its price. After this email, we go quiet until the next thing is ready.
      </p>

      <!-- Product grid (6 items, 2 rows of 3) -->
      <table cellpadding="0" cellspacing="0" style="margin:0 auto; max-width:520px;">
        <tr>
          <td style="padding:8px;" align="center">
            <a href="{{HOODIE_URL}}" style="text-decoration:none; color:#D4B896;">
              <img src="{{HOODIE_THUMB_URL}}" alt="The Heavyweight Hoodie" width="140" style="display:block; margin:0 auto 8px;" />
              <div style="font-size:13px;">The Hoodie<br/><span style="color:#fff;">$168</span></div>
            </a>
          </td>
          <td style="padding:8px;" align="center">
            <a href="{{CREWNECK_URL}}" style="text-decoration:none; color:#D4B896;">
              <img src="{{CREWNECK_THUMB_URL}}" alt="The Crewneck" width="140" style="display:block; margin:0 auto 8px;" />
              <div style="font-size:13px;">The Crewneck<br/><span style="color:#fff;">$88</span></div>
            </a>
          </td>
          <td style="padding:8px;" align="center">
            <a href="{{LONGSLEEVE_URL}}" style="text-decoration:none; color:#D4B896;">
              <img src="{{LONGSLEEVE_THUMB_URL}}" alt="The Long Sleeve" width="140" style="display:block; margin:0 auto 8px;" />
              <div style="font-size:13px;">The Long Sleeve<br/><span style="color:#fff;">$84</span></div>
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:8px;" align="center">
            <a href="{{VAULT_TEE_URL}}" style="text-decoration:none; color:#D4B896;">
              <img src="{{VAULT_TEE_THUMB_URL}}" alt="The Vault Tee" width="140" style="display:block; margin:0 auto 8px;" />
              <div style="font-size:13px;">The Vault Tee<br/><span style="color:#fff;">$54</span></div>
            </a>
          </td>
          <td style="padding:8px;" align="center">
            <a href="{{MONOGRAM_TEE_URL}}" style="text-decoration:none; color:#D4B896;">
              <img src="{{MONOGRAM_TEE_THUMB_URL}}" alt="The Monogram Tee" width="140" style="display:block; margin:0 auto 8px;" />
              <div style="font-size:13px;">The Monogram Tee<br/><span style="color:#fff;">$58</span></div>
            </a>
          </td>
          <td style="padding:8px;" align="center">
            <a href="{{SNAPBACK_URL}}" style="text-decoration:none; color:#D4B896;">
              <img src="{{SNAPBACK_THUMB_URL}}" alt="The Snapback" width="140" style="display:block; margin:0 auto 8px;" />
              <div style="font-size:13px;">The Snapback<br/><span style="color:#fff;">$52</span></div>
            </a>
          </td>
        </tr>
      </table>

      <a href="{{COLLECTION_URL}}" style="display:inline-block; margin:32px 0 0; background:#D4B896; color:#0F0E0C; text-decoration:none; padding:14px 32px; font-size:13px; letter-spacing:0.1em; text-transform:uppercase;">
        Shop the collection
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

`https://blackvaultapparel.com/collections/all`

## Notes

- Replace `{{*_URL}}` and `{{*_THUMB_URL}}` with real Shopify URLs after the products are published.
- Subject line variant 1 ("One last note.") is the strongest tested pattern for premium-restrained welcome series. It signals "we're done emailing you" which paradoxically improves open rates.
- This is the last welcome email. Set a 60-day quiet period after this — nothing until launch announcements or new drops.
