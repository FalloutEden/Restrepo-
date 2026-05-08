# Klaviyo Flow Assembly — Paint-by-Numbers (when you're back)

State as of the pause:
- Klaviyo account live
- Shopify integration installed (auto-syncs products + customers)
- Domain authenticated (`send.blackvaultapparel.com` — DNS verified)
- API key wired to operator (Templates: Read only — couldn't push templates programmatically)
- 8 email templates pre-filled at [.openclaw/marketing/emails_filled/](.) — ready to copy-paste
- 0 flows built, 0 templates in Klaviyo library

Total time to land everything: **~45-60 min focused work**.

## Order of operations

Do these in order. Each one unblocks the next.

### Step 0 — Optional: upgrade Templates scope (saves 30 min later)

If you want me to push templates programmatically:
1. Klaviyo → Account → API Keys → click `bv-operator-server` → Edit
2. Change **Templates: Read** → **Templates: Full Access**
3. Save (key value doesn't change)
4. Tell me — I push 8 templates in 30 sec, then you skip Step 1 below entirely

If you skip Step 0, do Step 1 manually 8 times.

---

### Step 1 — Build templates in Klaviyo (~20 min if doing manually)

In Klaviyo → **Email** (left sidebar) → **Templates** → **Create Template** → **Code Editor**.

For each of the 8 files, do this once:

1. **Template name** (use these exact names so flow steps below find them):
   | File | Template name |
   |---|---|
   | `welcome-1.md` | `BV Welcome 1 — You're on the list` |
   | `welcome-2.md` | `BV Welcome 2 — Why we put GSM on every label` |
   | `welcome-3.md` | `BV Welcome 3 — The full collection` |
   | `abandoned-cart-1.md` | `BV Abandoned Cart 1 — Still in your bag` |
   | `abandoned-cart-2.md` | `BV Abandoned Cart 2 — Before we release it back` |
   | `browse-abandonment.md` | `BV Browse Abandonment` |
   | `post-purchase-thanks.md` | `BV Post-Purchase Thanks` |
   | `launch-announcement.md` | `BV Launch Announcement` |

2. Open the corresponding `.md` file in your editor
3. Copy the **HTML body block** (everything inside the triple-backtick `html` block — from `<table` to `</table>`)
4. Paste into Klaviyo's Code Editor
5. Click **Save**

Repeat 8 times.

---

### Step 2 — Welcome flow (~5 min)

1. **Flows → Create Flow → Create From Scratch**
2. Name: `Welcome Series`
3. Trigger: **List** → **Email List** (`Y7S9S2`)
4. Click **Create Flow**

In the canvas:

5. Click **+** below trigger → **Email**
   - Name: `Welcome 1`
   - Click **Create**, then in the editor: **Copy from Template** → pick `BV Welcome 1 — You're on the list`
   - **Subject:** `Welcome to the Vault.`
   - **A/B variants** (click "Add A/B Test"): `What you just signed up for.` and `Built to be Kept.`
   - **Preview text:** `No discount codes. No daily emails. Construction-first apparel.`
   - **From email:** `hello@send.blackvaultapparel.com` (the domain we verified)
   - **From name:** `Black Vault Apparel`
   - **Reply-to:** real inbox you check
   - **Save**
6. Below Welcome 1, click **+** → **Time Delay** → set to **48 hours**
7. Below the delay, click **+** → **Email**
   - Name: `Welcome 2`
   - Copy from `BV Welcome 2 — Why we put GSM on every label`
   - **Subject:** `What 10.3oz feels like.`
   - **Preview text:** `A walkthrough of how BV pieces are constructed — and why we tell you the spec instead of hiding it.`
   - **Save**
8. Below Welcome 2, click **+** → **Time Delay** → set to **3 days** (so total is 5 days from signup to Welcome 3)
9. Below the delay, click **+** → **Email**
   - Name: `Welcome 3`
   - Copy from `BV Welcome 3 — The full collection`
   - **Subject:** `One last note.`
   - **Preview text:** `The whole BV launch line — six pieces, each chosen to outlast the wardrobe around them.`
   - **Save**
10. Top-right of the flow canvas → toggle **Live**

✓ Welcome series done.

---

### Step 3 — Abandoned cart flow (~5 min)

1. **Flows → Create Flow → Create From Scratch**
2. Name: `Abandoned Checkout`
3. Trigger: **Metric** → **Started Checkout**
4. Click **Create Flow**

In canvas:

5. Click **+** below trigger → **Time Delay** → **1 hour**
6. Click **+** → **Email** named `Abandoned Cart 1`
   - Copy from `BV Abandoned Cart 1 — Still in your bag`
   - Subject: `Still in your cart.`
   - Preview: `Heavyweight cotton, embroidered monogram. Yours when you're ready.`
   - Save
7. Click **+** below Abandoned Cart 1 → **Time Delay** → **23 hours** (so total 24h)
8. Click **+** → **Email** named `Abandoned Cart 2`
   - Copy from `BV Abandoned Cart 2 — Before we release it back`
   - Subject: `One last note on your bag.`
   - Save
9. Toggle **Live**

✓ Abandoned cart done.

---

### Step 4 — Browse abandonment flow (~3 min)

Klaviyo's "Viewed Product" metric needs Klaviyo's onsite tracking script — Shopify integration installed it automatically when you connected.

1. **Flows → Create Flow → Create From Scratch**
2. Name: `Browse Abandonment`
3. Trigger: **Metric** → **Viewed Product**
4. **Filter:** Add filter → "What someone has not done" → **Started Checkout** → in the past 24 hours
5. Click **Create Flow**

In canvas:

6. **+** → **Time Delay** → **4 hours**
7. **+** → **Email** named `Browse Abandonment`
   - Copy from `BV Browse Abandonment`
   - Subject: dynamic — Klaviyo's `{{ event.viewed_product.title }}` syntax
   - Save
8. Toggle **Live**

✓ Browse abandonment done.

---

### Step 5 — Post-purchase flow (~3 min)

1. **Flows → Create Flow → Create From Scratch**
2. Name: `Post-Purchase`
3. Trigger: **Metric** → **Placed Order**
4. Click **Create Flow**

In canvas:

5. **+** → **Email** named `Post-Purchase Thanks`
   - Copy from `BV Post-Purchase Thanks`
   - **No delay** (fires immediately on order)
   - Subject: `Thanks. Your order's on it.`
   - Save
6. Toggle **Live**

✓ Post-purchase done.

---

### Step 6 — Signup popup form (~5 min)

1. **Sign-Up Forms → Create Form → Create New Form**
2. Name: `Newsletter Popup v1`
3. **Form Type:** Popup
4. **Behavior:** "Display when visitor goes to leave the page" (exit intent) for desktop; "Display after scroll" 50% for mobile
5. **Suppress:** "Don't show form to subscribers who already submitted" (any time); "Don't show again to dismissers for 14 days"
6. **Targeting:** Show on all pages except `/cart`, `/checkout`, `/admin`, `/launch`
7. Click **Create Form**

In the form editor:

8. **Switch to Code editor** (look for `</>` icon)
9. Open [.openclaw/marketing/emails_filled/signup-popup.md](signup-popup.md)
10. Copy the HTML block → paste into Code editor → Save
11. **Action on submit:**
    - Subscribe to list → **Email List** (`Y7S9S2`)
    - Set property `signup_source` = `popup_v1`
12. Top-right → toggle **Live**

✓ Popup live. The Welcome series will fire automatically when someone signs up.

---

### Step 7 — Test send (5 min)

Verify deliverability before pointing real traffic at it.

1. Open the Welcome 1 email in Klaviyo
2. Top-right → **Send Preview** → enter your real email
3. Check inbox + spam in 30 sec
4. Verify:
   - Lands in inbox not spam
   - Hero image renders (check on phone too)
   - "Shop the Collection" button is gold + clickable
   - Footer shows your address (CAN-SPAM)
   - Unsubscribe link works

If it lands in spam: domain auth is technically working but reputation is low (normal for new sender). Fix: send 2-3 test emails to friends with personal Gmails over the next 3 days, ask them to flag "Not spam" in Gmail. Reputation builds in ~7 days.

---

### Step 8 — Light up the popup on the live storefront

Already covered by step 6 — the popup form Klaviyo creates auto-injects via the tracking script the Shopify integration installed. Visit your storefront in incognito; popup should appear after exit-intent or 50% scroll.

If popup doesn't appear:
- Klaviyo dashboard → Sign-Up Forms → your form → **Edit** → **Targeting** → re-check "Active on all pages"
- Hard-refresh the storefront in incognito

---

## When all 8 steps are done

You have:
- 4 live email automations (welcome, abandoned cart, browse abandon, post-purchase)
- A working signup popup
- A verified test send

This covers ~80% of what email marketing does at scale for premium DTC. The remaining 20% is the launch announcement broadcast (1-time send to engaged list) + future SMS + future segmentation. All can come later.
