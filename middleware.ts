import { NextResponse, type NextRequest } from "next/server";

// Edge middleware — gates the API surface.
//
// Two auth modes (route handlers can be either or both):
//   1. ADMIN — OPERATOR_AUTH_SECRET bearer (or x-operator-auth cookie).
//      This is YOU, the SaaS operator. Full access.
//   2. TENANT — btk_<...> bearer per-merchant. Resolved fully inside
//      route handlers via lib/auth.ts (middleware runs in edge runtime
//      and can't read tenant files). Middleware just lets the prefix
//      through; the handler does the real check.
//
// Webhooks are ALWAYS exempt — Shopify + Stripe can't carry our bearer
// header, and those routes verify HMAC inline.

const PUBLIC_PREFIXES = [
  "/api/webhooks/", // HMAC-protected, must remain reachable
  "/api/stripe/webhook", // Stripe signs payloads; verified inline
  "/api/onboard/start", // Public signup endpoint — no auth required to start
  "/api/admin/login", // Owner's login endpoint — verifies secret inline
  "/api/health", // Health endpoint — pinged by uptime monitors + Vercel cron
  "/api/cron/", // Vercel cron endpoints — verify CRON_SECRET inline
  "/api/cerebro/heartbeat" // Live brain heartbeat — read-only, no secrets exposed; polled client-side from the dashboard (incl. customer surfaces in future)
];

export const config = {
  matcher: ["/api/:path*"]
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return NextResponse.next();
  }

  const expected = process.env.OPERATOR_AUTH_SECRET?.trim();
  const onVercel = Boolean(process.env.VERCEL);

  if (!expected) {
    if (onVercel) {
      return NextResponse.json(
        {
          error:
            "Operator API disabled. Set OPERATOR_AUTH_SECRET in Vercel project env (use `openssl rand -hex 32`) to enable."
        },
        { status: 503 }
      );
    }
    return NextResponse.next();
  }

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice("bearer ".length).trim()
    : "";
  const cookie = request.cookies.get("x-operator-auth")?.value?.trim() ?? "";

  // 1. Admin bearer match — full access
  if (bearer === expected || cookie === expected) return NextResponse.next();

  // 2. Tenant bearer prefix — let through, route handler validates
  //    against tenancy.ts. Edge runtime can't do the file lookup itself.
  if (bearer.startsWith("btk_")) return NextResponse.next();

  return NextResponse.json(
    {
      error:
        "Unauthorized. Provide Authorization: Bearer <admin secret> OR a tenant bearer (btk_…)."
    },
    { status: 401 }
  );
}
