import { NextResponse } from "next/server";

import { createTenant } from "@/lib/tenancy";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe";
import { rateLimitCheck, clientIdFromRequest } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

// Public endpoint — no auth — the visitor doesn't have auth yet.
// Creates a draft tenant + a Stripe Checkout session.
//
// Rate limited (5 attempts per IP per hour) to prevent signup abuse.
// Audit-logged.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StartBody = {
  brandSlug: string;
  ownerEmail: string;
  brandName: string;
  voiceVibe?: string;
  tagline?: string;
};

function getOrigin(req: Request): string {
  const fromHeader = req.headers.get("origin");
  if (fromHeader) return fromHeader;
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function isValidEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

export async function POST(req: Request) {
  const ip = clientIdFromRequest(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;

  // Rate limit: 5 attempts per IP per hour
  const rl = rateLimitCheck("onboard.start", ip, { windowMs: 3600_000, max: 5 });
  if (!rl.allowed) {
    audit({ action: "rate_limit.triggered", actor: "anonymous", target: "/api/onboard/start", ip, userAgent, ok: false });
    return NextResponse.json(
      { error: "Too many attempts. Wait an hour and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  let body: StartBody;
  try {
    body = (await req.json()) as StartBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const brandSlug = slugify(body.brandSlug ?? "");
  const ownerEmail = (body.ownerEmail ?? "").trim().toLowerCase();
  const brandName = (body.brandName ?? "").trim();

  if (!brandSlug || brandSlug.length < 3) {
    return NextResponse.json({ error: "brandSlug must be at least 3 chars after slugification" }, { status: 400 });
  }
  if (!isValidEmail(ownerEmail)) {
    return NextResponse.json({ error: "ownerEmail invalid" }, { status: 400 });
  }
  if (!brandName) {
    return NextResponse.json({ error: "brandName required" }, { status: 400 });
  }

  // Create tenant in incomplete state — webhook activates after payment
  let tenant;
  try {
    tenant = await createTenant({
      brandSlug,
      ownerEmail,
      brandName,
      voiceVibe: body.voiceVibe,
      tagline: body.tagline
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create tenant" },
      { status: 409 }
    );
  }

  audit({
    action: "tenant.created",
    actor: ownerEmail,
    target: tenant.id,
    ip,
    userAgent,
    detail: { brandSlug, brandName },
    ok: true
  });

  if (!isStripeConfigured()) {
    return NextResponse.json({
      tenantId: tenant.id,
      bearerToken: tenant.bearerToken,
      brandSlug: tenant.brandSlug,
      stripe: null,
      note: "STRIPE_SECRET_KEY not set — tenant created in incomplete state. Set Stripe keys to enable checkout."
    });
  }

  const origin = getOrigin(req);
  const session = await createCheckoutSession({
    tenantId: tenant.id,
    customerEmail: ownerEmail,
    includeSetup: true,
    successUrl: `${origin}/onboard/success?tenantId=${tenant.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/onboard?canceled=1&tenantId=${tenant.id}`
  });

  return NextResponse.json({
    tenantId: tenant.id,
    bearerToken: tenant.bearerToken,
    brandSlug: tenant.brandSlug,
    stripe: { sessionId: session.id, url: session.url }
  });
}
