import type { NextConfig } from "next";
import path from "path";

// Security headers — defense in depth.
// - Strict-Transport-Security: force HTTPS once seen, including subdomains.
//   Browsers cache this for 2 years; once set, downgrade attacks blocked.
// - X-Content-Type-Options: prevents MIME sniffing.
// - X-Frame-Options: prevents clickjacking via iframe.
// - Referrer-Policy: limit referer leakage.
// - Permissions-Policy: disable browser APIs we don't need.
// - CSP: restrict where scripts/styles/images/etc. load from. Stripe Checkout
//   redirects fully off-site so we don't need to allowlist their iframe.
//
// Note: deliberately NOT setting CSP via meta tag — using header so it
// applies to ALL responses, not just HTML. Stricter.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Allow Stripe.js for any inline checkout (we currently redirect, but
      // future-proofing). Allow Next.js inline scripts (hashed by build).
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://app.pageview.app",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://cdn.shopify.com https://files.cdn.printful.com https://printful-upload.s3-accelerate.amazonaws.com https://*.stripe.com",
      "font-src 'self' data:",
      // Stripe iframe + Vercel preview deploys
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "connect-src 'self' https://api.stripe.com https://api.printful.com https://api.anthropic.com https://api.openai.com https://api.klaviyo.com",
      "form-action 'self' https://checkout.stripe.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'"
    ].join("; ")
  }
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      dompurify$: path.resolve("node_modules/dompurify/dist/purify.cjs.js")
    };
    return config;
  }
};

export default nextConfig;
