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
            <a href="https://blackvaultapparel.com/products/the-heavyweight-hoodie" style="text-decoration:none; color:#D4B896;">
              <img src="https://cdn.shopify.com/s/files/1/0674/3991/9202/files/bv-7623581728866-on-bg_3dd809ff-a08e-4239-aa4a-8f182fc59972.png?v=1778172684" alt="The Heavyweight Hoodie" width="140" style="display:block; margin:0 auto 8px;" />
              <div style="font-size:13px;">The Hoodie<br/><span style="color:#fff;">$168</span></div>
            </a>
          </td>
          <td style="padding:8px;" align="center">
            <a href="https://blackvaultapparel.com/products/the-crewneck" style="text-decoration:none; color:#D4B896;">
              <img src="https://cdn.shopify.com/s/files/1/0674/3991/9202/files/bv-7623582023778-on-bg_57378eae-38bc-4519-a291-fa67ff5dcb16.png?v=1778172524" alt="The Crewneck" width="140" style="display:block; margin:0 auto 8px;" />
              <div style="font-size:13px;">The Crewneck<br/><span style="color:#fff;">$88</span></div>
            </a>
          </td>
          <td style="padding:8px;" align="center">
            <a href="https://blackvaultapparel.com/products/the-long-sleeve" style="text-decoration:none; color:#D4B896;">
              <img src="https://cdn.shopify.com/s/files/1/0674/3991/9202/files/bv-7623582089314-on-bg_aac92098-aeea-47ff-a3c8-f71ebe1be2cd.png?v=1778172855" alt="The Long Sleeve" width="140" style="display:block; margin:0 auto 8px;" />
              <div style="font-size:13px;">The Long Sleeve<br/><span style="color:#fff;">$84</span></div>
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:8px;" align="center">
            <a href="https://blackvaultapparel.com/products/the-vault-tee" style="text-decoration:none; color:#D4B896;">
              <img src="https://cdn.shopify.com/s/files/1/0674/3991/9202/files/bv-7623581597794-on-bg_4278ae72-62d3-4ad7-9b6a-aebadfc3a6a7.png?v=1778173237" alt="The Vault Tee" width="140" style="display:block; margin:0 auto 8px;" />
              <div style="font-size:13px;">The Vault Tee<br/><span style="color:#fff;">$54</span></div>
            </a>
          </td>
          <td style="padding:8px;" align="center">
            <a href="https://blackvaultapparel.com/products/the-monogram-tee" style="text-decoration:none; color:#D4B896;">
              <img src="https://cdn.shopify.com/s/files/1/0674/3991/9202/files/bv-7623581532258-on-bg_5100e269-c308-4a59-8033-f9d3939186b1.png?v=1778172890" alt="The Monogram Tee" width="140" style="display:block; margin:0 auto 8px;" />
              <div style="font-size:13px;">The Monogram Tee<br/><span style="color:#fff;">$58</span></div>
            </a>
          </td>
          <td style="padding:8px;" align="center">
            <a href="https://blackvaultapparel.com/products/the-snapback" style="text-decoration:none; color:#D4B896;">
              <img src="https://cdn.shopify.com/s/files/1/0674/3991/9202/files/bv-7629068730466-on-bg_b887fe5a-4034-45a4-9437-68a8914cd07f.png?v=1778173141" alt="The Snapback" width="140" style="display:block; margin:0 auto 8px;" />
              <div style="font-size:13px;">The Snapback<br/><span style="color:#fff;">$52</span></div>
            </a>
          </td>
        </tr>
      </table>

      <a href="https://blackvaultapparel.com/collections/all" style="display:inline-block; margin:32px 0 0; background:#D4B896; color:#0F0E0C; text-decoration:none; padding:14px 32px; font-size:13px; letter-spacing:0.1em; text-transform:uppercase;">
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
