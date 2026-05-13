import { NextResponse } from "next/server";

import { rateLimitCheck, clientIdFromRequest } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

// Admin login endpoint. Verifies the posted secret against
// OPERATOR_AUTH_SECRET and sets the `x-operator-auth` cookie. Middleware
// admits subsequent requests that carry this cookie.
//
// Rate limited (5 attempts per IP per 10 minutes) to make brute force
// expensive. Audit-logged on success AND failure.
//
// Cookie is HttpOnly (JS can't read it) + Secure (HTTPS only in prod) +
// SameSite=Lax. 7-day max-age — re-login weekly.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIdFromRequest(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;

  const rl = rateLimitCheck("admin.login", ip, { windowMs: 600_000, max: 5 });
  if (!rl.allowed) {
    audit({ action: "rate_limit.triggered", actor: "anonymous", target: "/api/admin/login", ip, userAgent, ok: false });
    return NextResponse.json(
      { error: "Too many attempts. Wait 10 minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  let body: { secret?: string };
  try {
    body = (await req.json()) as { secret?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const expected = process.env.OPERATOR_AUTH_SECRET?.trim();
  if (!expected) {
    // Local-dev fallthrough — middleware leaves admin routes open when no
    // secret is set, so we just send the user along.
    return NextResponse.json({ ok: true, devMode: true });
  }

  const submitted = (body.secret ?? "").trim();
  if (submitted !== expected) {
    audit({ action: "auth.failed", actor: "anonymous", target: "admin.login", ip, userAgent, ok: false });
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  audit({ action: "auth.success", actor: "admin", target: "admin.login", ip, userAgent, ok: true });

  const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("x-operator-auth", expected, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7 // 7 days
  });
  return res;
}
