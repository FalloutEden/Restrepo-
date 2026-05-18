"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { AgentTicker } from "@/components/welcome/AgentTicker";

// Post-checkout welcome page — the "agents working" surface. Replaces the
// old static "next steps" ordered list with a live, actionable starter
// experience:
//
//   - Personalized hero ("{brandName}'s Operator is now running")
//   - Bearer-token reveal (one-time, must save)
//   - "Your operator is starting on:" card echoing the firstTask the user
//     picked in the wizard's step 4
//   - Starter checklist — 4 actionable cards, each linking to a tenant-aware
//     route we just shipped tonight (Shopify connect, content drops, chat,
//     readiness check)
//   - Live activity ticker — polls /api/cerebro/heartbeat every 5s so the
//     user can see real signal that the brain is alive
//
// Data flow: the wizard stashes brandName + firstTask in localStorage
// alongside the bearer (see app/onboard/page.tsx submit handler) so this
// page renders without a backend roundtrip.

type StashedTenant = {
  bearerToken?: string;
  brandSlug?: string;
  brandName?: string;
  firstTask?: string;
};

function SuccessInner() {
  const params = useSearchParams();
  const tenantId = params.get("tenantId") ?? "";
  const isDev = params.get("dev") === "1";

  const [stash, setStash] = useState<StashedTenant>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    try {
      const raw = localStorage.getItem(`operator:tenant:${tenantId}`);
      if (raw) setStash(JSON.parse(raw) as StashedTenant);
    } catch {}
  }, [tenantId]);

  function copyToken() {
    if (!stash.bearerToken) return;
    navigator.clipboard.writeText(stash.bearerToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const brandLabel = stash.brandName?.trim() || "Your store";

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <p style={{ fontSize: 12, letterSpacing: "0.22em", color: "#A67843", marginBottom: 12, fontWeight: 700 }}>
        {isDev ? "DEVELOPMENT MODE" : "WELCOME ABOARD"}
      </p>

      <h1 style={{ fontSize: 38, fontWeight: 700, marginTop: 0, marginBottom: 14, letterSpacing: "-0.01em" }}>
        {isDev
          ? "Tenant created (no payment)"
          : `${brandLabel}'s Operator is now running.`}
      </h1>

      <p style={{ fontSize: 16, color: "rgba(244,241,236,0.7)", marginTop: 0, marginBottom: 36, lineHeight: 1.55 }}>
        {isDev
          ? "Stripe wasn't configured, so we skipped payment. Your tenant exists but the Operator is disabled until subscription is active."
          : "Stripe confirmed your subscription. Here's what's happening right now, and what your operator needs from you next."}
      </p>

      {/* First-task echo — the wizard step-4 answer, surfaced back to the user
          as the operator's current focus. */}
      {stash.firstTask && (
        <section
          style={{
            background: "rgba(166,120,67,0.08)",
            border: "1px solid rgba(166,120,67,0.35)",
            borderRadius: 12,
            padding: 24,
            marginBottom: 28
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#A67843", marginBottom: 8, fontWeight: 700 }}>
            YOUR OPERATOR IS STARTING ON
          </div>
          <p style={{ fontSize: 18, lineHeight: 1.5, margin: 0, color: "rgba(244,241,236,0.95)" }}>
            &ldquo;{stash.firstTask}&rdquo;
          </p>
          <p style={{ fontSize: 13, color: "rgba(244,241,236,0.55)", marginTop: 14, marginBottom: 0 }}>
            The operator picks this up the moment you open the dashboard. You can change direction in chat any time.
          </p>
        </section>
      )}

      {/* Bearer token reveal — one-time, save it somewhere. */}
      {stash.bearerToken && (
        <section
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(244,241,236,0.12)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 28
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "rgba(244,241,236,0.5)", marginBottom: 8, fontWeight: 700 }}>
            BEARER TOKEN — SAVE THIS ONCE, SHOWN ONLY HERE
          </div>
          <div
            style={{
              fontSize: 13,
              fontFamily: "'SF Mono', Menlo, monospace",
              marginTop: 4,
              wordBreak: "break-all",
              color: "rgba(244,241,236,0.85)"
            }}
          >
            {stash.bearerToken}
          </div>
          <button
            onClick={copyToken}
            style={{
              marginTop: 16,
              background: "#A67843",
              color: "#0F0E0C",
              padding: "8px 18px",
              border: "none",
              borderRadius: 6,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13
            }}
          >
            {copied ? "Copied ✓" : "Copy token"}
          </button>
          <p style={{ fontSize: 12, color: "rgba(244,241,236,0.5)", marginTop: 14, marginBottom: 0 }}>
            Save it in your password manager. You&apos;ll use this to authenticate API calls and to log in from a fresh browser.
          </p>
        </section>
      )}

      {/* Starter checklist — actionable prompts that link to tenant-aware
          routes. Each step is something the user can DO right now, not a
          static "wait for an email" list. */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 14px" }}>Your starter checklist</h2>
        <p style={{ fontSize: 14, color: "rgba(244,241,236,0.6)", marginTop: 0, marginBottom: 18 }}>
          Three small things and your store is real. Each one takes a few minutes — your operator helps you through it.
        </p>

        <ChecklistCard
          step={1}
          title="Connect your Shopify store"
          body="Paste your Shopify admin API token and store domain. We encrypt them — your operator reads them only when it needs to."
          ctaLabel="Connect Shopify →"
          ctaHref="/launch"
        />

        <ChecklistCard
          step={2}
          title="Drop in your first product photos"
          body="The content studio turns your photos into lifestyle images, short videos, and platform-native captions. You'll review everything before it ships."
          ctaLabel="Open content studio →"
          ctaHref="/content-studio"
        />

        <ChecklistCard
          step={3}
          title="Talk to your operator"
          body={
            stash.firstTask
              ? `Open the chat and the operator will start on the task you picked. You can also ask it anything: "What should I do today?" works.`
              : "Open the chat and ask the operator what it wants to do first. The wizard primed it with your brand basics."
          }
          ctaLabel="Open the operator →"
          ctaHref="/dashboard"
        />
      </section>

      {/* Live activity ticker — proof the brain is actually alive. */}
      <section
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(244,241,236,0.08)",
          borderRadius: 12,
          padding: 20,
          marginBottom: 28
        }}
      >
        <AgentTicker />
      </section>

      {/* Big CTA. */}
      <div style={{ marginBottom: 32 }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-block",
            background: "#A67843",
            color: "#0F0E0C",
            padding: "14px 28px",
            borderRadius: 8,
            fontWeight: 700,
            textDecoration: "none",
            fontSize: 15
          }}
        >
          Open my operator →
        </Link>
      </div>

      <div style={{ marginTop: 36, padding: 18, background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
        <p style={{ fontSize: 13, color: "rgba(244,241,236,0.55)", margin: 0 }}>
          Stuck? Email <a href="mailto:support@blackvault.studio" style={{ color: "#A67843" }}>support@blackvault.studio</a>.
        </p>
      </div>
    </div>
  );
}

function ChecklistCard(props: {
  step: number;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 18,
        padding: "18px 20px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(244,241,236,0.1)",
        borderRadius: 10,
        marginBottom: 10
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          background: "rgba(166,120,67,0.18)",
          color: "#A67843",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontFamily: "'SF Mono', Menlo, monospace",
          fontSize: 14
        }}
      >
        {props.step}
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(244,241,236,0.95)", marginBottom: 4 }}>
          {props.title}
        </div>
        <div style={{ fontSize: 13, color: "rgba(244,241,236,0.6)", lineHeight: 1.5 }}>
          {props.body}
        </div>
      </div>
      <Link
        href={props.ctaHref}
        style={{
          color: "#A67843",
          textDecoration: "none",
          fontSize: 13,
          fontWeight: 700,
          border: "1px solid rgba(166,120,67,0.4)",
          padding: "8px 14px",
          borderRadius: 6,
          whiteSpace: "nowrap"
        }}
      >
        {props.ctaLabel}
      </Link>
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
      <Suspense
        fallback={<div style={{ textAlign: "center", color: "rgba(244,241,236,0.5)" }}>Loading…</div>}
      >
        <SuccessInner />
      </Suspense>
    </main>
  );
}
