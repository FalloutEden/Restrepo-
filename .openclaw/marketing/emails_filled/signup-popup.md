# Klaviyo signup popup — exit-intent + scroll-trigger

The single highest-ROI lead capture for premium DTC. A non-aggressive signup popup typically converts 1.5–4% of new visitors to email subscribers. At BV's expected traffic (1k–5k visitors/day at launch + ad lift), that's 15–200 new subscribers/day.

## Posture

**Restrained, not desperate.** The form below is a single-line email field, no sliders, no "Sign up for 10% off" header, no urgency timers. We don't promise discount, we promise restraint — "we send three emails over the next week so you know exactly what BV is, then we get out of your inbox until something is ready for you."

If Klaviyo's library only has aggressive templates, build it as a custom HTML form (Klaviyo supports paste-in HTML for popups).

## Trigger logic

Two trigger paths in Klaviyo's "Display Rules" panel:

1. **Exit intent** (desktop): show when cursor crosses the top edge of the viewport
2. **Scroll trigger** (mobile + desktop fallback): show after 50% scroll OR 30 seconds on page, whichever comes first

Suppress on these conditions (Klaviyo: Targeting):
- ☐ user already submitted (any time)
- ☐ user dismissed in last 14 days
- ☐ on cart, checkout, account, or any /admin path
- ☐ on the /launch page (admin-only)

## Form HTML (paste into Klaviyo custom form)

```html
<style>
  .bv-signup {
    background: #0F0E0C;
    color: #D4B896;
    font-family: Georgia, 'Times New Roman', serif;
    padding: 48px 32px;
    max-width: 480px;
    border: 1px solid rgba(212,184,150,0.18);
    text-align: center;
  }
  .bv-signup h2 {
    font-size: 24px;
    line-height: 1.3;
    margin: 0 0 16px;
    letter-spacing: 0.02em;
  }
  .bv-signup p {
    font-size: 14px;
    line-height: 1.6;
    margin: 0 0 24px;
    color: rgba(212,184,150,0.85);
  }
  .bv-signup input[type="email"] {
    width: 100%;
    padding: 14px 16px;
    background: transparent;
    border: 1px solid rgba(212,184,150,0.4);
    color: #fff;
    font-family: Georgia, serif;
    font-size: 15px;
    margin-bottom: 12px;
    box-sizing: border-box;
  }
  .bv-signup input[type="email"]::placeholder { color: rgba(212,184,150,0.5); }
  .bv-signup button {
    width: 100%;
    padding: 14px;
    background: #D4B896;
    color: #0F0E0C;
    border: none;
    font-family: 'Helvetica Neue', sans-serif;
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .bv-signup .footnote {
    font-size: 11px;
    color: rgba(212,184,150,0.5);
    margin-top: 16px;
    line-height: 1.5;
  }
</style>

<div class="bv-signup">
  <h2>The Black Vault list.</h2>
  <p>Three emails over the next week so you know exactly what we make. Then we go quiet until the next thing is ready.</p>
  <form>
    <input type="email" name="email" placeholder="Your email" required />
    <button type="submit">Join the list</button>
    <div class="footnote">No discount codes. No daily emails. Built to be Kept.</div>
  </form>
</div>
```

## Klaviyo wiring (after pasting the HTML)

1. **Form behavior:**
   - **On submit:** add subscriber to list `bv-master`, set property `signup_source = popup_v1`
   - **Success state:** swap the `<h2>` to "You're on the list." and hide the form. (Klaviyo: Form → Edit → Set up a "thank you" view.)
   - **Trigger welcome flow:** the existing `welcome-1.md` flow's trigger should be `subscribed to bv-master` so the welcome series fires automatically.

2. **A/B test (optional, week 2+):**
   - **Variant B:** swap `<h2>` to `Built to be Kept.` to test brand-line headline vs. "The Black Vault list."

## Mobile optimization

- Klaviyo's mobile rendering will inject a fullscreen modal by default. Override with custom CSS to limit to 90% width and add 32px safe-area padding.
- On mobile, suppress the popup if the viewport is in landscape (assumes accidental orientation; rotate-back UX kills conversion).

## Hard rules

- **No discount codes ever in this popup.** The whole point is restrained-premium positioning. A discount in the popup undoes the brand voice in everything else.
- **Don't add a phone-number field.** SMS marketing is a separate consent — bundling it with email signup tanks email conversion 30–50% in 2026 testing across DTC fashion.
- **Keep the form to email only.** No first-name, no last-name, no "tell us about yourself." Premium = friction-free.
- **Don't re-trigger.** Once dismissed, 14-day suppression is the right floor. Aggressive re-show looks cheap.
