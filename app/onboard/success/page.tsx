"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// Post-checkout landing. Shows the merchant their bearer token (one-time
// reveal — they should save it) + next steps. Read tenantId from query
// param + bearerToken from localStorage (set during wizard submit).

function SuccessInner() {
  const params = useSearchParams();
  const tenantId = params.get("tenantId") ?? "";
  const isDev = params.get("dev") === "1";
  const [bearerToken, setBearerToken] = useState<string | null>(null);
  const [brandSlug, setBrandSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    try {
      const raw = localStorage.getItem(`operator:tenant:${tenantId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { bearerToken: string; brandSlug: string };
        setBearerToken(parsed.bearerToken);
        setBrandSlug(parsed.brandSlug);
      }
    } catch {}
  }, [tenantId]);

  function copyToken() {
    if (!bearerToken) return;
    navigator.clipboard.writeText(bearerToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <p style={{ fontSize: 13, letterSpacing: "0.2em", color: "#A67843", marginBottom: 16 }}>
        {isDev ? "DEVELOPMENT MODE" : "WELCOME ABOARD"}
      </p>
      <h1 style={{ fontSize: 40, fontWeight: 700, marginBottom: 16 }}>
        {isDev ? "Tenant created (no payment)" : "Your Operator is online."}
      </h1>
      <p style={{ fontSize: 17, color: "rgba(244,241,236,0.7)", marginBottom: 40 }}>
        {isDev
          ? "Stripe wasn't configured, so we skipped payment. Your tenant exists but the Operator is disabled until subscription is active."
          : "Stripe confirmed your subscription. Your Operator is now running. Save the bearer token below — it's how you authenticate to it."}
      </p>

      {tenantId && (
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(244,241,236,0.1)",
            borderRadius: 12,
            padding: 24,
            marginBottom: 24
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "rgba(244,241,236,0.5)" }}>TENANT ID</div>
          <div style={{ fontSize: 17, fontFamily: "monospace", marginTop: 4 }}>{tenantId}</div>
          {brandSlug && (
            <>
              <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "rgba(244,241,236,0.5)", marginTop: 16 }}>
                BRAND HANDLE
              </div>
              <div style={{ fontSize: 17, fontFamily: "monospace", marginTop: 4 }}>{brandSlug}</div>
            </>
          )}
        </div>
      )}

      {bearerToken && (
        <div
          style={{
            background: "rgba(166,120,67,0.08)",
            border: "1px solid rgba(166,120,67,0.4)",
            borderRadius: 12,
            padding: 24,
            marginBottom: 24
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#A67843" }}>
            BEARER TOKEN — SAVE THIS ONCE; SHOWN ONLY HERE
          </div>
          <div style={{ fontSize: 14, fontFamily: "monospace", marginTop: 8, wordBreak: "break-all" }}>
            {bearerToken}
          </div>
          <button
            onClick={copyToken}
            style={{
              marginTop: 16,
              background: "#A67843",
              color: "#0F0E0C",
              padding: "10px 20px",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            {copied ? "Copied ✓" : "Copy token"}
          </button>
        </div>
      )}

      <div style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Next steps</h2>
        <ol style={{ paddingLeft: 20, color: "rgba(244,241,236,0.8)", lineHeight: 1.7 }}>
          <li>Save the bearer token in a password manager — you&apos;ll use it in API calls and the operator UI</li>
          <li>Watch your inbox for the build kickoff email (within 1 hour)</li>
          <li>Reply with: your Shopify trial URL, your Printful account email, and any logo files you have</li>
          <li>Your store will be live within 48 hours of receiving those</li>
          <li>In the meantime, you can log in to your operator at <Link href="/dashboard" style={{ color: "#A67843" }}>/dashboard</Link></li>
        </ol>
      </div>

      <div style={{ marginTop: 48, padding: 24, background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
        <p style={{ fontSize: 14, color: "rgba(244,241,236,0.6)", margin: 0 }}>
          Trouble? Email <a href="mailto:support@blackvault.studio" style={{ color: "#A67843" }}>support@blackvault.studio</a>
        </p>
      </div>
    </div>
  );
}

export default function OnboardSuccessPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0F0E0C",
        color: "#F4F1EC",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "60px 24px"
      }}
    >
      <Suspense fallback={<div style={{ textAlign: "center", color: "rgba(244,241,236,0.5)" }}>Loading…</div>}>
        <SuccessInner />
      </Suspense>
    </main>
  );
}
