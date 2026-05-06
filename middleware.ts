import { NextResponse, type NextRequest } from "next/server";

// Edge middleware — gates the API surface with optional bearer auth.
//
// Behavior:
//   - If OPERATOR_AUTH_SECRET env var is unset, requests pass through (so
//     local dev and the existing in-app UI keep working). The deployment
//     remains as open as it was before.
//   - If OPERATOR_AUTH_SECRET is set in production env, /api/* requests
//     must carry `Authorization: Bearer <secret>` OR a matching
//     `x-operator-auth` cookie. Anything else returns 401.
//   - The Shopify webhook handler is ALWAYS exempt — Shopify can't carry
//     our bearer header, and the route already verifies HMAC inline.
//
// To enable: set OPERATOR_AUTH_SECRET in Vercel project env vars (use
// `openssl rand -hex 32` to generate). Then the in-app UI can either:
//   - Be served behind a one-time login that sets the cookie, OR
//   - Have its fetch calls include the bearer header from a server-component
//     context (so the secret never reaches client JS).
//
// Deferring full session/user auth until SaaS multi-tenancy is wired —
// for now this closes the open API surface that the security audit flagged.

const PUBLIC_PREFIXES = [
  "/api/webhooks/" // HMAC-protected, must remain reachable from Shopify
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
  if (!expected) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice("bearer ".length).trim()
    : "";
  const cookie = request.cookies.get("x-operator-auth")?.value?.trim() ?? "";

  if (bearer === expected || cookie === expected) return NextResponse.next();

  return NextResponse.json(
    { error: "Unauthorized. Set Authorization: Bearer <OPERATOR_AUTH_SECRET> or x-operator-auth cookie." },
    { status: 401 }
  );
}
