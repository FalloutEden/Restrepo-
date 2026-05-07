# SMS welcome (post-launch — only when you're ready to add SMS marketing)

SMS is a **separate consent + separate cost** from email. Launch with email-only. Add SMS only after the email list passes ~1000 active subscribers, and only via Klaviyo SMS or Postscript (NOT Shopify's native SMS, which is still raw in 2026).

## Why hold SMS until later

- Cold SMS converts 4–8× per send vs cold email — but at $0.01–0.03/send and a much lower opt-out tolerance. One bad blast tanks a list.
- Premium positioning has a higher SMS-fatigue floor than discount brands. BV's customer doesn't want texts about a 10% off code.
- TCPA compliance: every SMS marketing send needs explicit double-opt-in, a STOP keyword footer, and US-only sending unless you have local carrier registrations.

## When you're ready

### Required setup before sending

- [ ] Klaviyo SMS or Postscript account, billing card on file
- [ ] Shopify integration confirmed
- [ ] Brand A2P 10DLC registration (US carriers require this for marketing SMS — takes 5–15 business days, ~$50 one-time)
- [ ] Double-opt-in confirmation SMS on signup
- [ ] STOP / HELP keywords mapped (Klaviyo handles this automatically; verify in settings)

### Welcome SMS — single send, fires on email signup if SMS consent also given

```
Black Vault Apparel.

Three emails over the next week so you know exactly what we make. Then we go quiet.

Reply STOP to opt out.
blackvaultapparel.com
```

160-character SMS standard length. No emoji. No urgency.

### Order-confirmation SMS — fires after order placed (if SMS consent)

```
Order #{{order.name}} confirmed. Made-to-order, shipping in 5-7 business days. Tracking link sent when it leaves the line.

— Black Vault
```

### Restock SMS — fires when an out-of-stock variant the customer waitlisted comes back

```
{{product.title}} is back. {{variant.option1}} restocked.
{{product.url}}

— Black Vault. Reply STOP to opt out.
```

## Hard rules

- **Max 4 SMS per customer per month.** Above that, opt-outs spike.
- **Never send between 9 PM and 9 AM in the customer's timezone.** Klaviyo's "smart send time" handles this automatically.
- **No discount-only SMS.** Mixing in restock + brand-story texts keeps engagement healthier than discount-spam.
- **One CTA per SMS.** Always link to a specific product page or the homepage.
- **Test sends to your own number first.** Carrier filtering varies; some emoji and curly quotes get flagged as spam.
