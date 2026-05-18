"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { authedFetch } from "@/lib/client-auth";

// Stripe Connect OAuth flow — fourth and last in the partner setup series
// after Namecheap, Shopify, and Klaviyo. Different from the others in one
// big way: Stripe handles signup + account configuration AND credential
// handoff in a single OAuth bounce. Tenant clicks "Connect with Stripe",
// lands on Stripe's hosted UI, signs in or creates an account, approves,
// and Stripe redirects them back to /api/stripe/connect/callback which
// verifies state, exchanges the code, writes stripeConnectAccountId into
// the encrypted vault, and bounces back to /setup/stripe?status=connected.
//
// What this component does:
//   - Reads ?status from the URL on mount to surface OAuth outcomes
//     (connected / denied / bad_state / exchange_failed / etc.)
//   - Polls /api/tenant/credentials on mount to know if the tenant is
//     already connected (badge state)
//   - Renders a "Connect with Stripe" button that calls
//     /api/stripe/connect/authorize, then window.location to the returned
//     URL. The server-side route generates the HMAC-signed state and the
//     authorize URL with the platform's CLIENT_ID.

type Configured = { stripeConnectAccountId?: boolean };

const STATUS_MESSAGES: Record<string, { tone: "ok" | "warn" | "fail"; title: string; body: string }> = {
  connected: {
    tone: "ok",
    title: "Stripe connected.",
    body: "Your operator can reference this account when it builds invoices, payment links, or marketplace integrations."
  },
  denied: {
    tone: "warn",
    title: "Stripe authorization cancelled.",
    body: "You closed the Stripe window or denied access. Nothing was saved — click Connect with Stripe again whenever you're ready."
  },
  bad_state: {
    tone: "fail",
    title: "We couldn't verify the Stripe bounce.",
    body: "The authorization state was missing, malformed, expired, or tampered with. Start the flow again from this page."
  },
  no_code: {
    tone: "fail",
    title: "Stripe didn't send an authorization code.",
    body: "Something went wrong on Stripe's side. Try again — if it keeps happening, contact support."
  },
  stripe_unconfigured: {
    tone: "fail",
    title: "Stripe isn't set up on this deployment.",
    body: "The platform needs STRIPE_SECRET_KEY + STRIPE_CONNECT_CLIENT_ID in Vercel env. Tell the operator owner."
  },
  exchange_failed: {
    tone: "fail",
    title: "Couldn't finish the Stripe handshake.",
    body: "Stripe rejected the authorization code. The link may have already been used or expired. Try connecting again."
  },
  vault_write_failed: {
    tone: "fail",
    title: "Saved the connection but couldn't store the account id.",
    body: "Your Stripe account is connected on Stripe's side, but we hit an error writing to your vault. Try clicking Connect again to overwrite the broken row."
  }
};

function StripeConnectInner() {
  const params = useSearchParams();
  const status = params.get("status");
  const [configured, setConfigured] = useState<Configured>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const [authorizeError, setAuthorizeError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const r = await authedFetch("/api/tenant/credentials", { cache: "no-store" });
      if (r.ok) {
        const data = (await r.json()) as { configured: Configured };
        setConfigured(data.configured ?? {});
      } else if (r.status !== 401) {
        setError(`Error ${r.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startAuthorize() {
    setAuthorizeError(null);
    setAuthorizing(true);
    try {
      const r = await authedFetch("/api/stripe/connect/authorize", { cache: "no-store" });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        setAuthorizeError(data.error ?? `Error ${r.status}`);
        setAuthorizing(false);
        return;
      }
      const data = (await r.json()) as { url: string };
      if (!data.url) {
        setAuthorizeError("Stripe authorize URL missing in response");
        setAuthorizing(false);
        return;
      }
      // Hand the browser to Stripe. Callback returns to /setup/stripe?status=…
      window.location.href = data.url;
    } catch (e) {
      setAuthorizeError(e instanceof Error ? e.message : "Failed to start authorization");
      setAuthorizing(false);
    }
  }

  const accountSet = configured.stripeConnectAccountId === true;
  const statusInfo = status ? STATUS_MESSAGES[status] : null;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* OAuth bounce result banner */}
      {statusInfo && (
        <div
          style={{
            background:
              statusInfo.tone === "ok"
                ? "rgba(110,220,150,0.1)"
                : statusInfo.tone === "warn"
                  ? "rgba(224,180,103,0.1)"
                  : "rgba(224,123,106,0.1)",
            border: `1px solid ${
              statusInfo.tone === "ok"
                ? "rgba(110,220,150,0.4)"
                : statusInfo.tone === "warn"
                  ? "rgba(224,180,103,0.4)"
                  : "rgba(224,123,106,0.4)"
            }`,
            color:
              statusInfo.tone === "ok"
                ? "#6EDC96"
                : statusInfo.tone === "warn"
                  ? "#E0B467"
                  : "#E07B6A",
            padding: "14px 18px",
            borderRadius: 10
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{statusInfo.title}</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>{statusInfo.body}</div>
        </div>
      )}

      <section
        style={{
          border: `1px solid ${accountSet ? "rgba(110,220,150,0.4)" : "rgba(166,120,67,0.35)"}`,
          borderRadius: 12,
          padding: 24,
          background: accountSet ? "rgba(110,220,150,0.06)" : "rgba(166,120,67,0.06)"
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            color: accountSet ? "#6EDC96" : "#A67843",
            fontWeight: 700,
            marginBottom: 8
          }}
        >
          {accountSet ? "✓ STRIPE CONNECTED" : "ONE CLICK · OAUTH HANDSHAKE"}
        </div>
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, color: "#D4B896" }}>
          {accountSet ? "Your Stripe account is on file." : "Connect with Stripe in one step."}
        </h2>
        <p style={{ marginTop: 0, marginBottom: 18, fontSize: 13, color: "rgba(244,241,236,0.7)", lineHeight: 1.55 }}>
          {accountSet
            ? "Stripe authorized this Operator deployment to act on your behalf. We never see your card data — Stripe holds that. To switch accounts, click the button below and authorize again."
            : "Click the button. Stripe opens, you sign in (or sign up — it's free), approve the connection. We never see your card data. We store only your account id so the operator knows whose payments to reference."}
        </p>

        {loading ? (
          <p style={{ color: "rgba(244,241,236,0.5)", fontSize: 14 }}>Loading…</p>
        ) : (
          <>
            {authorizeError && (
              <div
                style={{
                  background: "rgba(224,123,106,0.1)",
                  border: "1px solid rgba(224,123,106,0.4)",
                  color: "#E07B6A",
                  padding: "10px 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  marginBottom: 14
                }}
              >
                {authorizeError}
              </div>
            )}
            {error && (
              <div
                style={{
                  background: "rgba(224,123,106,0.1)",
                  border: "1px solid rgba(224,123,106,0.4)",
                  color: "#E07B6A",
                  padding: "10px 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  marginBottom: 14
                }}
              >
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => void startAuthorize()}
              disabled={authorizing}
              style={{
                background: "#635BFF",
                color: "#fff",
                border: "none",
                padding: "12px 22px",
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 14,
                cursor: authorizing ? "wait" : "pointer",
                width: "fit-content",
                boxShadow: "0 1px 0 rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.12)"
              }}
            >
              {authorizing ? "Opening Stripe…" : accountSet ? "Re-authorize Stripe" : "Connect with Stripe"}
            </button>
          </>
        )}
      </section>

      {!accountSet && (
        <section
          style={{
            border: "1px solid rgba(244,241,236,0.1)",
            borderRadius: 12,
            padding: 20,
            background: "rgba(255,255,255,0.02)",
            fontSize: 13,
            color: "rgba(244,241,236,0.6)",
            lineHeight: 1.55
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "rgba(244,241,236,0.45)", fontWeight: 700, marginBottom: 8 }}>
            WHAT HAPPENS WHEN YOU CLICK
          </div>
          <ol style={{ margin: "0 0 0 18px", padding: 0 }}>
            <li>We send you to <strong>connect.stripe.com</strong> with a signed identity token so Stripe knows which account to associate with you.</li>
            <li>You sign in (or sign up — free) and approve the connection.</li>
            <li>Stripe bounces you back here. We exchange the authorization code for your account id and store it in your encrypted vault.</li>
            <li>Done — your operator has Stripe access. No tokens for you to paste anywhere.</li>
          </ol>
        </section>
      )}
    </div>
  );
}

export function StripeConnect() {
  // useSearchParams must be wrapped in Suspense for the route to be statically
  // analyzable. The fallback shouldn't be visible because the parent route is
  // force-dynamic, but Next requires it for the type.
  return (
    <Suspense fallback={<p style={{ color: "rgba(244,241,236,0.5)", fontSize: 14 }}>Loading…</p>}>
      <StripeConnectInner />
    </Suspense>
  );
}
