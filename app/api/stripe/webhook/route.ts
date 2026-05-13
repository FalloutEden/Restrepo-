import { NextResponse } from "next/server";

import { verifyWebhook } from "@/lib/stripe";
import { getTenant, updateTenant, type SubscriptionStatus } from "@/lib/tenancy";
import { sendEmail, welcomeEmailHtml } from "@/lib/email";
import type Stripe from "stripe";

// Stripe webhook handler. Public — Stripe signs the payload; we verify
// inline via STRIPE_WEBHOOK_SECRET. Middleware exempts /api/stripe/webhook
// from bearer auth (Stripe doesn't carry our headers).
//
// Events we handle:
//   - checkout.session.completed → activate tenant (operatorEnabled=true)
//   - customer.subscription.updated → sync subscriptionStatus + period end
//   - customer.subscription.deleted → cancel tenant
//   - invoice.payment_failed → mark past_due
//
// Everything else: ack with 200 (Stripe expects 2xx to stop retrying).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mapStripeStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
      return "incomplete";
    case "paused":
      return "paused";
    default:
      return "incomplete";
  }
}

function tenantIdFromMetadata(metadata: Record<string, string> | null | undefined): string | null {
  if (!metadata) return null;
  return metadata.tenantId ?? null;
}

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const tenantId = tenantIdFromMetadata(session.metadata);
  if (!tenantId) {
    console.warn("[stripe webhook] checkout.session.completed without tenantId metadata");
    return;
  }
  const tenant = await getTenant(tenantId);
  if (!tenant) {
    console.warn(`[stripe webhook] tenant ${tenantId} not found`);
    return;
  }
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  const activated = await updateTenant(tenantId, {
    subscriptionStatus: "active",
    stripe: {
      ...tenant.stripe,
      customerId,
      subscriptionId
    },
    config: { ...tenant.config, operatorEnabled: true }
  });
  console.log(`[stripe webhook] activated tenant ${tenantId} after checkout`);

  // Fire-and-forget welcome email (failures logged but don't break the
  // webhook — tenant is already active in the DB)
  const origin = event.data.object && (event.data.object as Stripe.Checkout.Session).success_url
    ? new URL((event.data.object as Stripe.Checkout.Session).success_url ?? "").origin
    : "";
  const { subject, html } = welcomeEmailHtml({
    brandName: activated.brand.name,
    brandSlug: activated.brandSlug,
    tenantId: activated.id,
    bearerToken: activated.bearerToken,
    dashboardUrl: origin ? `${origin}/dashboard` : "/dashboard"
  });
  sendEmail({ to: activated.ownerEmail, subject, html }).catch((e) =>
    console.warn("[stripe webhook] welcome email failed:", e)
  );
}

async function handleSubscriptionUpdated(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const tenantId = tenantIdFromMetadata(sub.metadata);
  if (!tenantId) return;
  const tenant = await getTenant(tenantId);
  if (!tenant) return;
  const status = mapStripeStatus(sub.status);
  const priceId = sub.items.data[0]?.price.id;
  const currentPeriodEndUnix = (sub as unknown as { current_period_end?: number }).current_period_end;
  const currentPeriodEnd = currentPeriodEndUnix
    ? new Date(currentPeriodEndUnix * 1000).toISOString()
    : undefined;
  await updateTenant(tenantId, {
    subscriptionStatus: status,
    stripe: {
      ...tenant.stripe,
      subscriptionId: sub.id,
      priceId,
      currentPeriodEnd
    },
    config: {
      ...tenant.config,
      operatorEnabled: status === "active" || status === "trialing"
    }
  });
}

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const tenantId = tenantIdFromMetadata(sub.metadata);
  if (!tenantId) return;
  const tenant = await getTenant(tenantId);
  if (!tenant) return;
  await updateTenant(tenantId, {
    subscriptionStatus: "canceled",
    config: { ...tenant.config, operatorEnabled: false }
  });
}

async function handlePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const tenantId = tenantIdFromMetadata(invoice.metadata);
  if (!tenantId) return;
  const tenant = await getTenant(tenantId);
  if (!tenant) return;
  await updateTenant(tenantId, {
    subscriptionStatus: "past_due",
    config: { ...tenant.config, operatorEnabled: false }
  });
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = verifyWebhook(payload, signature);
  } catch (e) {
    console.warn("[stripe webhook] verify failed:", e instanceof Error ? e.message : "?");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.created":
        await handleSubscriptionUpdated(event);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event);
        break;
      default:
        // ack and move on
        break;
    }
  } catch (e) {
    console.error("[stripe webhook] handler error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
