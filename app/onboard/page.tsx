"use client";

import { useState } from "react";

// Multi-step onboarding wizard for The Operator (by Black Vault).
// Light technical aesthetic — different audience than BV apparel merch
// buyers. These are SaaS buyers; they want clarity not mood.

type FormState = {
  brandName: string;
  brandSlug: string;
  ownerEmail: string;
  voiceVibe: string;
  tagline: string;
};

const EMPTY: FormState = {
  brandName: "",
  brandSlug: "",
  ownerEmail: "",
  voiceVibe: "",
  tagline: ""
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function OnboardPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function validateStep1(): string | null {
    if (!form.brandName.trim()) return "Brand name is required.";
    const slug = slugify(form.brandSlug || form.brandName);
    if (slug.length < 3) return "Brand slug must be at least 3 chars (letters/numbers/-).";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.ownerEmail)) return "Owner email looks invalid.";
    return null;
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const slug = slugify(form.brandSlug || form.brandName);
      const r = await fetch("/api/onboard/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandSlug: slug,
          ownerEmail: form.ownerEmail.trim().toLowerCase(),
          brandName: form.brandName.trim(),
          voiceVibe: form.voiceVibe.trim() || undefined,
          tagline: form.tagline.trim() || undefined
        })
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? `Error ${r.status}`);
        setSubmitting(false);
        return;
      }
      try {
        localStorage.setItem(
          `operator:tenant:${data.tenantId}`,
          JSON.stringify({ bearerToken: data.bearerToken, brandSlug: data.brandSlug })
        );
      } catch {}
      if (data.stripe?.url) {
        window.location.href = data.stripe.url;
        return;
      }
      window.location.href = `/onboard/success?tenantId=${data.tenantId}&dev=1`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setSubmitting(false);
    }
  }

  const baseInput: React.CSSProperties = {
    width: "100%",
    padding: "13px 14px",
    background: "#fff",
    border: "1px solid #d8d8d8",
    borderRadius: 8,
    color: "#0F0E0C",
    fontSize: 15,
    fontFamily: "inherit",
    marginBottom: 16,
    boxSizing: "border-box"
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: "#666",
    display: "block",
    marginBottom: 6,
    letterSpacing: "0.06em",
    fontWeight: 600,
    textTransform: "uppercase"
  };
  const button: React.CSSProperties = {
    background: "#0F0E0C",
    color: "#fff",
    padding: "12px 24px",
    borderRadius: 8,
    border: "none",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit"
  };
  const buttonSecondary: React.CSSProperties = {
    ...button,
    background: "#fff",
    color: "#0F0E0C",
    border: "1px solid #d8d8d8"
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FAFAFA",
        color: "#0F0E0C",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif",
        padding: "40px 24px"
      }}
    >
      <div style={{ maxWidth: 540, margin: "0 auto" }}>
        <p style={{ fontSize: 12, letterSpacing: "0.15em", color: "#A67843", marginBottom: 8, fontWeight: 600 }}>
          STEP {step} OF 3
        </p>
        <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.01em" }}>
          {step === 1 && "Brand basics"}
          {step === 2 && "Voice & feel"}
          {step === 3 && "Review & launch"}
        </h1>
        <p style={{ fontSize: 15, color: "#666", marginBottom: 28 }}>
          {step === 1 && "Name the brand and pick a URL handle."}
          {step === 2 && "How should the agent write for you? Optional — sharper briefs make sharper answers."}
          {step === 3 && "Confirm everything, then we'll send you to Stripe."}
        </p>

        {error && (
          <div
            style={{
              padding: "12px 14px",
              background: "#fff5f5",
              border: "1px solid #ffd0d0",
              borderRadius: 8,
              color: "#a00",
              fontSize: 14,
              marginBottom: 16
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            background: "#fff",
            border: "1px solid #ebebeb",
            borderRadius: 12,
            padding: 28
          }}
        >
          {step === 1 && (
            <>
              <label style={labelStyle}>Brand name</label>
              <input
                type="text"
                placeholder="e.g. Stone & Steel Co"
                value={form.brandName}
                onChange={(e) => {
                  setField("brandName", e.target.value);
                  if (!form.brandSlug) setField("brandSlug", slugify(e.target.value));
                }}
                style={baseInput}
              />

              <label style={labelStyle}>Brand handle / URL slug</label>
              <input
                type="text"
                placeholder="stoneandsteelco"
                value={form.brandSlug}
                onChange={(e) => setField("brandSlug", e.target.value)}
                style={baseInput}
              />
              <p style={{ fontSize: 12, color: "#888", marginTop: -8, marginBottom: 20 }}>
                Lowercase letters, numbers, dashes. We&apos;ll use{" "}
                <code style={{ background: "#f4f1ec", padding: "2px 6px", borderRadius: 4 }}>
                  {slugify(form.brandSlug || form.brandName) || "<your-slug>"}
                </code>{" "}
                as your operator handle.
              </p>

              <label style={labelStyle}>Your email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={form.ownerEmail}
                onChange={(e) => setField("ownerEmail", e.target.value)}
                style={baseInput}
              />
            </>
          )}

          {step === 2 && (
            <>
              <label style={labelStyle}>Vibe (3 words, optional)</label>
              <input
                type="text"
                placeholder="dark, premium, masculine — or minimal, bright, playful"
                value={form.voiceVibe}
                onChange={(e) => setField("voiceVibe", e.target.value)}
                style={baseInput}
              />
              <p style={{ fontSize: 12, color: "#888", marginTop: -8, marginBottom: 20 }}>
                Guides the agent&apos;s tone in product copy and email flows. Skip if unsure.
              </p>

              <label style={labelStyle}>Tagline (optional)</label>
              <input
                type="text"
                placeholder="e.g. Built to be Kept"
                value={form.tagline}
                onChange={(e) => setField("tagline", e.target.value)}
                style={baseInput}
              />
            </>
          )}

          {step === 3 && (
            <div>
              {[
                ["Brand name", form.brandName],
                ["Brand handle", slugify(form.brandSlug || form.brandName)],
                ["Owner email", form.ownerEmail],
                [
                  "Vibe",
                  form.voiceVibe ||
                    "(not provided — agent will use neutral premium defaults)"
                ],
                ["Tagline", form.tagline || "(not provided)"]
              ].map(([k, v]) => (
                <div key={k} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #f0f0f0" }}>
                  <div style={{ fontSize: 11, color: "#888", letterSpacing: "0.06em", fontWeight: 600, textTransform: "uppercase" }}>
                    {k}
                  </div>
                  <div style={{ fontSize: 15, marginTop: 4, color: "#0F0E0C" }}>{v}</div>
                </div>
              ))}
              <p style={{ fontSize: 13, color: "#666", marginTop: 16 }}>
                Next: Stripe checkout for $499 setup + $99/month. After payment, your Operator
                activates and we email you a bearer token for API access.
              </p>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => (s - 1) as 1 | 2)}
              style={buttonSecondary}
              type="button"
              disabled={submitting}
            >
              Back
            </button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 1) {
                  const err = validateStep1();
                  if (err) {
                    setError(err);
                    return;
                  }
                  setError(null);
                }
                setStep((s) => (s + 1) as 2 | 3);
              }}
              style={button}
              type="button"
              disabled={submitting}
            >
              Continue →
            </button>
          ) : (
            <button onClick={submit} style={button} type="button" disabled={submitting}>
              {submitting ? "Setting up…" : "Pay & launch →"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
