import { NextResponse } from "next/server";

import { createTenant } from "@/lib/tenancy";
import { patchTenantProfile } from "@/lib/tenant-profile";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe";
import { rateLimitCheck, clientIdFromRequest } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

// Public endpoint — no auth — the visitor doesn't have auth yet.
// Creates a draft tenant + seeds the brand profile + a Stripe Checkout
// session.
//
// The wizard captures audience + voice + fulfillment + first task so
// the operator's system prompt (which reads the brand profile every
// turn) lands fully primed — no "11 idle agents, idk what to do" gap
// after the merchant pays.
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
  audience?: string;
  fulfillment?: "printful" | "manual";
  firstTask?: string;
};

// Marker prefix the operator system prompt scans for in profile.notes
// to find a wizard-supplied first task. Keep in sync with wherever the
// operator reads it (lib/operator-agent.ts surfaces profile.notes
// verbatim today).
const FIRST_TASK_PREFIX = "FIRST_TASK:";

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

  // Seed the brand profile from the wizard answers. The operator system
  // prompt reads this at every turn; without it the operator would have
  // to re-ask audience/voice/fulfillment via chat after the merchant
  // pays. We tolerate missing fields (older clients, retries) — anything
  // missing falls back to chat-based intake the way it did before.
  try {
    const audience = (body.audience ?? "").trim();
    const voice = (body.voiceVibe ?? "").trim();
    const fulfillment = body.fulfillment === "manual" ? "manual" : "printful";
    const firstTask = (body.firstTask ?? "").trim();
    const notes: string[] = [];
    if (firstTask) notes.push(`${FIRST_TASK_PREFIX} ${firstTask}`);
    await patchTenantProfile(
      {
        brandName,
        tagline: (body.tagline ?? "").trim() || undefined,
        audience: audience || undefined,
        voice: voice || undefined,
        fulfillment,
        notes
      },
      tenant.id
    );
  } catch (e) {
    // Non-fatal: tenant exists, payment can still proceed; operator will
    // fall back to chat intake. Log and move on.
    audit({
      action: "admin.action",
      actor: ownerEmail,
      target: tenant.id,
      ip,
      userAgent,
      detail: { step: "profile_seed_failed", message: e instanceof Error ? e.message : "unknown" },
      ok: false
    });
  }

  audit({
    action: "tenant.created",
    actor: ownerEmail,
    target: tenant.id,
    ip,
    userAgent,
    detail: { brandSlug, brandName, hasFirstTask: Boolean((body.firstTask ?? "").trim()) },
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
