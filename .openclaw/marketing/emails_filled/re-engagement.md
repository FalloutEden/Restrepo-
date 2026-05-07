# Re-engagement (sends to anyone who hasn't opened a BV email in 60 days)

## Subject lines

1. `Still want these?`
2. `One last note before we let you go.`
3. `Going quiet. Here's the door.`

## Preview text

`Honest re-permission email. Stay or go — your call.`

## Body

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0E0C; color:#D4B896; font-family: Georgia, serif;">
  <tr>
    <td align="center" style="padding:48px 24px;">

      <h1 style="font-size:24px; line-height:1.3; margin:0 0 16px; max-width:520px;">
        Still want to hear from us?
      </h1>

      <p style="font-size:15px; max-width:480px; line-height:1.7; margin:0 0 24px;">
        We don't email a lot, and we noticed you haven't been opening what we send. No hard feelings — inboxes get crowded. If you'd still like to hear from us when something new is ready, just tap below.
      </p>

      <a href="{{KEEP_ME_URL}}" style="display:inline-block; background:#D4B896; color:#0F0E0C; text-decoration:none; padding:14px 32px; font-size:13px; letter-spacing:0.1em; text-transform:uppercase; margin:0 8px 16px;">
        Keep me on the list
      </a>

      <br/>

      <a href="{{UNSUBSCRIBE_URL}}" style="display:inline-block; color:rgba(212,184,150,0.7); text-decoration:underline; font-size:13px; padding:8px 16px; letter-spacing:0.08em;">
        unsubscribe
      </a>

      <p style="font-size:13px; color:rgba(212,184,150,0.5); margin:32px 0 0;">
        — Black Vault Apparel
      </p>

    </td>
  </tr>
</table>
```

## Why send this

Two reasons:
1. **Domain reputation.** Klaviyo/Shopify rate your sending domain on opens, clicks, complaints, and bounces. A dormant subscriber who never opens drags every metric down. Mailing them less or pruning them improves deliverability for the people who DO want to hear from you.
2. **Honesty matches brand voice.** "We noticed you haven't been opening" is BV-restrained: it states a fact, gives the door, doesn't beg. Begging-back ("we miss you! 20% off!") collapses premium positioning.

## Notes

- `{{KEEP_ME_URL}}` should be a Klaviyo "click to add tag" link (tag the contact `re-engaged`).
- After 14 days: anyone who didn't click "Keep me on the list" gets auto-suppressed (Klaviyo: profile filter → suppress). Don't delete; suppression keeps the record so they can resubscribe later.
