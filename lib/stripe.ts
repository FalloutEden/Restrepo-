import "server-only";

import Stripe from "stripe";

// Stripe integration for the hosted operator SaaS.
//
// We expose:
//   - getStripe() — lazy-initialized SDK client. Uses test keys by default;
//     production swaps in live keys when STRIPE_SECRET_KEY starts with sk_live_.
//   - The pricing model:
//       * One-time setup fee ($499) — STRIPE_PRICE_SETUP
//       * Recurring monthly ($99/mo) — STRIPE_PRICE_MONTHLY
//     Both are Stripe Price IDs created in the Stripe dashboard. They live
//     in env so we can switch test vs live without code changes.
//   - createCheckoutSession() — generates a hosted Stripe Checkout URL for
//     the onboarding wizard. Embeds tenantId in metadata so the webhook
//     handler can activate the right merchant.
//   - verifyWebhook() — validates the Stripe-Signature header.
//
// Test mode setup (do this in the Stripe dashboard before going live):
//   1. Sign in to dashboard.stripe.com → switch to Test mode (toggle top-right)
//   2. Products → Add product → "Brand Setup" → one-time, $499 → copy price ID
//      → set STRIPE_PRICE_SETUP=price_…
//   3. Products → Add product → "Managed Brand Monthly" → recurring monthly,
//      $99 → copy price ID → set STRIPE_PRICE_MONTHLY=price_…
//   4. API keys → Reveal test secret → set STRIPE_SECRET_KEY=sk_test_…
//   5. Webhooks → Add endpoint → https://your-domain/api/stripe/webhook
//      → select events: checkout.session.completed, customer.subscription.updated,
//        customer.subscription.deleted, invoice.paid, invoice.payment_failed
//      → copy signing secret → set STRIPE_WEBHOOK_SECRET=whsec_…

let _client: Stripe | null = null;

// Stripe API version. We pin to the Managed Payments preview because the
// Project Elsa SaaS flow uses managed_payments[enabled]=true on checkout
// sessions, which is gated on this version. If we ever stop using
// Managed Payments, drop this back to undefined (SDK default).
//
// Source: Stripe Managed Payments blueprint (2026-02-25.preview)
const STRIPE_API_VERSION = "2026-02-25.preview";

export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. For local dev, create test keys in the Stripe dashboard and add to .env.local."
    );
  }
  // Cast through unknown — SDK's apiVersion type is a string-literal union
  // and doesn't include preview versions. The string is valid at the API
  // level; we just need to bypass the type check.
  _client = new Stripe(key, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiVersion: STRIPE_API_VERSION as any
  });
  return _client;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function isStripeLiveMode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  return key.startsWith("sk_live_");
}

export type CreateCheckoutInput = {
  tenantId: string;
  customerEmail: string;
  successUrl: string; // where to redirect after payment
  cancelUrl: string; // where to redirect on abandonment
  /** If true, includes both the one-time setup + monthly subscription. */
  includeSetup?: boolean;
};

export async function createCheckoutSession(input: CreateCheckoutInput) {
  const stripe = getStripe();
  const monthlyPriceId = process.env.STRIPE_PRICE_MONTHLY?.trim();
  if (!monthlyPriceId) {
    throw new Error(
      "STRIPE_PRICE_MONTHLY env var not set. Create the monthly price in Stripe dashboard."
    );
  }
  const setupPriceId = process.env.STRIPE_PRICE_SETUP?.trim();

  const lineItems: Array<{ price: string; quantity: number }> = [];
  if (input.includeSetup && setupPriceId) {
    lineItems.push({ price: setupPriceId, quantity: 1 });
  }
  lineItems.push({ price: monthlyPriceId, quantity: 1 });

  // Managed Payments: simpler payment-method handling, auto-tax,
  // statement-descriptor inheritance. Requires the preview API version
  // already set on the Stripe client. See blueprint:
  // /v1/checkout/sessions with managed_payments[enabled]=true
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: lineItems,
    customer_email: input.customerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { tenantId: input.tenantId },
    subscription_data: {
      metadata: { tenantId: input.tenantId }
    }
  };
  // managed_payments is preview-API; cast through unknown so types compile
  // until the SDK ships official types for it.
  (params as unknown as Record<string, unknown>).managed_payments = { enabled: true };

  const session = await stripe.checkout.sessions.create(params);
  return session;
}

/**
 * Verify a Stripe webhook payload. Throws if the signature doesn't match
 * or if STRIPE_WEBHOOK_SECRET isn't set.
 */
export function verifyWebhook(payload: string, signature: string): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }
  return stripe.webhooks.constructEvent(payload, signature, secret);
}
