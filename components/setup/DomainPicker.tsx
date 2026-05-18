"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { authedFetch } from "@/lib/client-auth";

// Namecheap deep-link flow. Three states:
//
//   1. NO BRAND NAME YET — show a friendly "tell us your brand name first"
//      prompt with a link to /settings.
//   2. SHOPPING — show suggested domain names derived from the brand, each
//      with a "Search on Namecheap →" deep link that prefills the registrar
//      search. User leaves, buys, comes back.
//   3. CAPTURED — render the confirmed domain + an "edit" affordance.
//
// We don't actually verify the domain is registered or DNS-resolved here —
// we just store what the user tells us. The launch readiness checks (in a
// later iteration) will probe DNS and surface "your domain doesn't point at
// Shopify yet" if needed.

type Profile = {
  brandName?: string;
  domain?: string;
};

const TLDS = ["com", "shop", "store", "co", "io", "studio"] as const;

function slugifyForDomain(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);
}

function suggestNames(brand: string): string[] {
  const slug = slugifyForDomain(brand);
  if (!slug) return [];
  const out = new Set<string>();
  for (const tld of TLDS) out.add(`${slug}.${tld}`);
  out.add(`${slug}store.com`);
  out.add(`get${slug}.com`);
  out.add(`${slug}shop.com`);
  return Array.from(out);
}

function namecheapSearchUrl(domain: string): string {
  // Namecheap's registrar search accepts a `domain` query param and shows
  // alternatives if the exact match is unavailable. No affiliate code yet —
  // we can add one later without changing the UI.
  return `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`;
}

export function DomainPicker() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [customSearch, setCustomSearch] = useState("");
  const [capturedDomain, setCapturedDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const r = await authedFetch("/api/tenant/profile", { cache: "no-store" });
      if (r.status === 401) {
        setError("Sign in to manage your domain.");
        setLoading(false);
        return;
      }
      if (!r.ok) {
        setError(`Error ${r.status}`);
        setLoading(false);
        return;
      }
      const data = (await r.json()) as { profile: Profile | null };
      setProfile(data.profile ?? {});
      if (data.profile?.domain) setConfirmed(data.profile.domain);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const suggestions = useMemo(() => {
    const brand = profile?.brandName ?? "";
    return suggestNames(brand);
  }, [profile?.brandName]);

  async function saveDomain(value: string) {
    setSubmitError(null);
    const trimmed = value.trim();
    if (!trimmed) {
      setSubmitError("Paste the domain you bought.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await authedFetch("/api/tenant/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: trimmed })
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        setSubmitError(data.error ?? `Error ${r.status}`);
        setSubmitting(false);
        return;
      }
      const data = (await r.json()) as { profile: Profile };
      setConfirmed(data.profile.domain ?? trimmed);
      setCapturedDomain("");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p style={{ color: "rgba(244,241,236,0.5)", fontSize: 14 }}>Loading…</p>;
  }

  if (error) {
    return (
      <div
        style={{
          background: "rgba(224,123,106,0.1)",
          border: "1px solid rgba(224,123,106,0.4)",
          color: "#E07B6A",
          padding: "12px 16px",
          borderRadius: 8,
          fontSize: 14
        }}
      >
        {error}
      </div>
    );
  }

  // CAPTURED STATE
  if (confirmed) {
    return (
      <div
        style={{
          background: "rgba(110,220,150,0.08)",
          border: "1px solid rgba(110,220,150,0.4)",
          borderRadius: 12,
          padding: 24
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#6EDC96", fontWeight: 700, marginBottom: 8 }}>
          ✓ DOMAIN ON FILE
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'SF Mono', Menlo, monospace", marginBottom: 12 }}>
          {confirmed}
        </div>
        <p style={{ fontSize: 13, color: "rgba(244,241,236,0.6)", marginTop: 0, marginBottom: 16, lineHeight: 1.55 }}>
          Your operator knows this is your custom domain. When Shopify is connected, we&apos;ll
          walk you through pointing the DNS at your store.
        </p>
        <button
          type="button"
          onClick={() => setConfirmed(null)}
          style={{
            background: "transparent",
            color: "rgba(212,184,150,0.85)",
            border: "1px solid rgba(212,184,150,0.3)",
            padding: "8px 14px",
            borderRadius: 6,
            fontSize: 12,
            cursor: "pointer"
          }}
        >
          Use a different domain
        </button>
      </div>
    );
  }

  // NO BRAND NAME YET
  if (!profile?.brandName) {
    return (
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(244,241,236,0.12)",
          borderRadius: 12,
          padding: 24
        }}
      >
        <p style={{ fontSize: 15, color: "rgba(244,241,236,0.85)", marginTop: 0, marginBottom: 14 }}>
          We need your brand name to suggest domains. Pop into{" "}
          <a href="/settings" style={{ color: "#A67843" }}>Settings</a> and tell us, then come back here.
        </p>
      </div>
    );
  }

  // SHOPPING STATE
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section
        style={{
          border: "1px solid rgba(244,241,236,0.12)",
          borderRadius: 12,
          padding: 22,
          background: "rgba(255,255,255,0.02)"
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 17, color: "#D4B896" }}>
          Try one of these
        </h2>
        <p style={{ marginTop: 0, marginBottom: 18, fontSize: 13, color: "rgba(244,241,236,0.6)" }}>
          Clicking any of these opens Namecheap with the name pre-searched. If it&apos;s taken, Namecheap
          shows alternatives — pick one, buy it, then come back here and paste it below.
        </p>

        <div style={{ display: "grid", gap: 8 }}>
          {suggestions.map((domain) => (
            <a
              key={domain}
              href={namecheapSearchUrl(domain)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(244,241,236,0.12)",
                borderRadius: 8,
                color: "rgba(244,241,236,0.92)",
                textDecoration: "none",
                fontFamily: "'SF Mono', Menlo, monospace",
                fontSize: 14
              }}
            >
              <span>{domain}</span>
              <span style={{ color: "#A67843", fontSize: 12, fontWeight: 700 }}>Search on Namecheap →</span>
            </a>
          ))}
        </div>
      </section>

      <section
        style={{
          border: "1px solid rgba(244,241,236,0.12)",
          borderRadius: 12,
          padding: 22,
          background: "rgba(255,255,255,0.02)"
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 17, color: "#D4B896" }}>
          Or search a custom name
        </h2>
        <p style={{ marginTop: 0, marginBottom: 14, fontSize: 13, color: "rgba(244,241,236,0.6)" }}>
          Have a name in mind? Type it in and we&apos;ll open Namecheap straight to that search.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="my-cool-store.com"
            value={customSearch}
            onChange={(e) => setCustomSearch(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              padding: "10px 12px",
              fontSize: 14,
              fontFamily: "'SF Mono', Menlo, monospace",
              background: "rgba(0,0,0,0.35)",
              color: "#f0f0f0",
              border: "1px solid rgba(244,241,236,0.15)",
              borderRadius: 6,
              boxSizing: "border-box"
            }}
          />
          <a
            href={customSearch.trim() ? namecheapSearchUrl(customSearch.trim()) : "#"}
            target={customSearch.trim() ? "_blank" : undefined}
            rel="noopener noreferrer"
            onClick={(e) => {
              if (!customSearch.trim()) e.preventDefault();
            }}
            style={{
              background: customSearch.trim() ? "#A67843" : "rgba(166,120,67,0.3)",
              color: "#0F0E0C",
              padding: "10px 16px",
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 13,
              cursor: customSearch.trim() ? "pointer" : "not-allowed",
              textDecoration: "none",
              whiteSpace: "nowrap"
            }}
          >
            Search →
          </a>
        </div>
      </section>

      <section
        style={{
          border: "1px solid rgba(166,120,67,0.35)",
          borderRadius: 12,
          padding: 22,
          background: "rgba(166,120,67,0.06)"
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 17, color: "#D4B896" }}>
          Already bought one? Tell us.
        </h2>
        <p style={{ marginTop: 0, marginBottom: 14, fontSize: 13, color: "rgba(244,241,236,0.7)" }}>
          Paste your domain here so your operator knows what to use. We don&apos;t need access — just
          the name itself.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input
            type="text"
            placeholder="yourstore.com"
            value={capturedDomain}
            onChange={(e) => setCapturedDomain(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              padding: "10px 12px",
              fontSize: 14,
              fontFamily: "'SF Mono', Menlo, monospace",
              background: "rgba(0,0,0,0.35)",
              color: "#f0f0f0",
              border: "1px solid rgba(244,241,236,0.15)",
              borderRadius: 6,
              boxSizing: "border-box"
            }}
          />
          <button
            type="button"
            onClick={() => void saveDomain(capturedDomain)}
            disabled={submitting}
            style={{
              background: "#D4B896",
              color: "#0F0E0C",
              border: "none",
              padding: "10px 18px",
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 13,
              cursor: submitting ? "wait" : "pointer",
              whiteSpace: "nowrap"
            }}
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
        {submitError && (
          <p style={{ fontSize: 12, color: "#E07B6A", marginTop: 10, marginBottom: 0 }}>{submitError}</p>
        )}
      </section>
    </div>
  );
}
