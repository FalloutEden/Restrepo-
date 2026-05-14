"use client";

import { useState } from "react";

// Multi-step onboarding wizard for The Operator (by Black Vault).
// Light technical aesthetic — different audience than BV apparel merch
// buyers. These are SaaS buyers; they want clarity not mood.
//
// Why 5 steps (not 3): the operator system prompt reads the tenant
// brand profile (lib/tenant-profile.ts) at every chat turn. Without
// audience + voice + fulfillment captured up-front, the merchant lands
// on the dashboard and the operator has to ask everything via chat —
// that's the "11 idle agents, idk what to do" experience the user
// flagged. Capture it here, ship the merchant a primed operator.

type Step = 1 | 2 | 3 | 4 | 5;

type FormState = {
  brandName: string;
  brandSlug: string;
  ownerEmail: string;
  voiceVibe: string;
  tagline: string;
  audience: string;
  fulfillment: "printful" | "manual";
  firstTask: string;
};

const EMPTY: FormState = {
  brandName: "",
  brandSlug: "",
  ownerEmail: "",
  voiceVibe: "",
  tagline: "",
  audience: "",
  fulfillment: "printful",
  firstTask: ""
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const STEP_TITLES: Record<Step, { eyebrow: string; title: string; sub: string }> = {
  1: {
    eyebrow: "STEP 1 OF 5",
    title: "Brand basics",
    sub: "Name the brand and pick a URL handle."
  },
  2: {
    eyebrow: "STEP 2 OF 5",
    title: "Voice & feel",
    sub: "How should the agent write for you? Optional — sharper briefs make sharper answers."
  },
  3: {
    eyebrow: "STEP 3 OF 5",
    title: "Audience & fulfillment",
    sub: "Who buys this, and how do orders ship? The operator uses this in every product page and email it writes."
  },
  4: {
    eyebrow: "STEP 4 OF 5",
    title: "First task",
    sub: "What do you want the operator to do FIRST? It will start on this the moment you land on your dashboard."
  },
  5: {
    eyebrow: "STEP 5 OF 5",
    title: "Review & launch",
    sub: "Confirm everything, then we'll send you to Stripe."
  }
};

export default function OnboardPage() {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function validateStep(target: Step): string | null {
    if (target === 1) {
      if (!form.brandName.trim()) return "Brand name is required.";
      const slug = slugify(form.brandSlug || form.brandName);
      if (slug.length < 3) return "Brand slug must be at least 3 chars (letters/numbers/-).";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.ownerEmail)) return "Owner email looks invalid.";
    }
    if (target === 3) {
      if (!form.audience.trim() || form.audience.trim().length < 6) {
        return "Tell us who this is for in one short sentence — even a rough first guess.";
      }
    }
    if (target === 4) {
      if (!form.firstTask.trim() || form.firstTask.trim().length < 6) {
        return "Give the operator one concrete first task. You can change direction in chat anytime.";
      }
    }
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
          tagline: form.tagline.trim() || undefined,
          audience: form.audience.trim(),
          fulfillment: form.fulfillment,
          firstTask: form.firstTask.trim()
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
  const textareaInput: React.CSSProperties = {
    ...baseInput,
    minHeight: 92,
    resize: "vertical",
    fontFamily: "inherit"
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
  const radioCard = (selected: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "16px 18px",
    border: selected ? "2px solid #0F0E0C" : "1px solid #d8d8d8",
    borderRadius: 8,
    cursor: "pointer",
    background: selected ? "#FAFAFA" : "#fff",
    transition: "all 120ms ease",
    fontSize: 14
  });

  const stepCopy = STEP_TITLES[step];

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
          {stepCopy.eyebrow}
        </p>
        <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.01em" }}>
          {stepCopy.title}
        </h1>
        <p style={{ fontSize: 15, color: "#666", marginBottom: 28 }}>
          {stepCopy.sub}
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
            <>
              <label style={labelStyle}>Who buys this?</label>
              <textarea
                placeholder="e.g. design-conscious dog owners 28-50 who buy premium gear; or, builders and tradespeople in their 30s-50s who hate cheap merch"
                value={form.audience}
                onChange={(e) => setField("audience", e.target.value)}
                style={textareaInput}
              />
              <p style={{ fontSize: 12, color: "#888", marginTop: -8, marginBottom: 24 }}>
                One short sentence. The operator uses this verbatim in product copy and ad targeting.
              </p>

              <label style={labelStyle}>Fulfillment</label>
              <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setField("fulfillment", "printful")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setField("fulfillment", "printful");
                    }
                  }}
                  style={radioCard(form.fulfillment === "printful")}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Printful</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    Print-on-demand. Apparel, posters, accessories. Auto-ships from Printful warehouses.
                  </div>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setField("fulfillment", "manual")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setField("fulfillment", "manual");
                    }
                  }}
                  style={radioCard(form.fulfillment === "manual")}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Manual</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    You ship orders yourself or use a non-integrated supplier. Operator skips fulfillment automation.
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#888", marginTop: 8, marginBottom: 0 }}>
                You can connect Printful credentials later from your dashboard. Most merchants start here.
              </p>
            </>
          )}

          {step === 4 && (
            <>
              <label style={labelStyle}>First task for the operator</label>
              <textarea
                placeholder="e.g. Build me 8 premium black t-shirt drafts ready for Shopify; or, audit my Shopify store and tell me the 3 highest-impact things to fix this week"
                value={form.firstTask}
                onChange={(e) => setField("firstTask", e.target.value)}
                style={textareaInput}
              />
              <p style={{ fontSize: 12, color: "#888", marginTop: -8, marginBottom: 8 }}>
                One concrete ask. The operator picks this up the moment you land on your dashboard — no idle screen.
              </p>
              <div
                style={{
                  marginTop: 18,
                  padding: 14,
                  background: "#FAFAFA",
                  border: "1px solid #ebebeb",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#555"
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6, color: "#0F0E0C" }}>
                  Examples that work well
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Build 6-10 product drafts in our brand voice and put them in my Shopify drafts.</li>
                  <li>Audit my current product pages and rewrite the weakest 3.</li>
                  <li>Set up a Klaviyo welcome flow + abandoned cart sequence.</li>
                  <li>Find 5 print-on-demand niches I&apos;m a good fit for and rank them.</li>
                </ul>
              </div>
            </>
          )}

          {step === 5 && (
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
                ["Tagline", form.tagline || "(not provided)"],
                ["Audience", form.audience],
                ["Fulfillment", form.fulfillment === "printful" ? "Printful (POD)" : "Manual"],
                ["First task", form.firstTask]
              ].map(([k, v]) => (
                <div key={k} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #f0f0f0" }}>
                  <div style={{ fontSize: 11, color: "#888", letterSpacing: "0.06em", fontWeight: 600, textTransform: "uppercase" }}>
                    {k}
                  </div>
                  <div style={{ fontSize: 15, marginTop: 4, color: "#0F0E0C", whiteSpace: "pre-wrap" }}>{v}</div>
                </div>
              ))}
              <p style={{ fontSize: 13, color: "#666", marginTop: 16 }}>
                Next: Stripe checkout for $499 setup + $99/month. After payment, your Operator
                activates with all of this context already loaded — it picks up your first task
                the moment you land on your dashboard.
              </p>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1) as Step)}
              style={buttonSecondary}
              type="button"
              disabled={submitting}
            >
              Back
            </button>
          ) : (
            <span />
          )}
          {step < 5 ? (
            <button
              onClick={() => {
                const err = validateStep(step);
                if (err) {
                  setError(err);
                  return;
                }
                setError(null);
                setStep((s) => Math.min(5, s + 1) as Step);
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
