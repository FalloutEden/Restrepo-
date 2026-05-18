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

// Copy is intentionally at a ~4th-grade reading level — short sentences,
// simple words, no jargon. The wizard is the first thing every new tenant
// sees; it needs to feel like a friendly checklist, not a corporate intake
// form. Field shape is unchanged — the operator system prompt still gets
// the same data it relied on before.
const STEP_TITLES: Record<Step, { eyebrow: string; title: string; sub: string }> = {
  1: {
    eyebrow: "STEP 1 OF 5 · LET'S START",
    title: "Name your store",
    sub: "Pick a name. Don't worry if it's not perfect — you can change it later."
  },
  2: {
    eyebrow: "STEP 2 OF 5 · THE LOOK",
    title: "How should it feel?",
    sub: "Tell us the vibe. If you're not sure, skip it — we can guess for you."
  },
  3: {
    eyebrow: "STEP 3 OF 5 · YOUR PEOPLE",
    title: "Who's it for?",
    sub: "Tell us who's going to buy your stuff. One sentence is plenty."
  },
  4: {
    eyebrow: "STEP 4 OF 5 · FIRST JOB",
    title: "What should we do first?",
    sub: "Your operator is ready to work. What's the first thing you want done?"
  },
  5: {
    eyebrow: "STEP 5 OF 5 · ALL SET",
    title: "Last look — does this look right?",
    sub: "Check your answers. If they look good, we'll set up your store."
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
        // Stash everything the success page needs to render the agents-working
        // experience without a backend roundtrip. Bearer + brandSlug are the
        // auth/identity essentials; brandName + firstTask let the success page
        // open with "{brandName}'s Operator is starting on: {firstTask}" instead
        // of a generic "Welcome aboard."
        localStorage.setItem(
          `operator:tenant:${data.tenantId}`,
          JSON.stringify({
            bearerToken: data.bearerToken,
            brandSlug: data.brandSlug,
            brandName: form.brandName.trim(),
            firstTask: form.firstTask.trim()
          })
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
        {/* Progress bar — 5 chunky pills, the current step glows gold, prior
            steps are solid. Reads at a glance: "I'm 2 of 5 done." */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 28,
            alignItems: "stretch"
          }}
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const done = n < step;
            const current = n === step;
            return (
              <div
                key={n}
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 999,
                  background: done
                    ? "#0F0E0C"
                    : current
                    ? "#A67843"
                    : "#ebebeb",
                  transition: "background 200ms ease",
                  boxShadow: current ? "0 0 0 3px rgba(166, 120, 67, 0.15)" : "none"
                }}
                aria-label={`Step ${n}${done ? " complete" : current ? " in progress" : ""}`}
              />
            );
          })}
        </div>

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
              <label style={labelStyle}>What's your store called?</label>
              <input
                type="text"
                placeholder="like Sunny's Shirts, or Stone & Steel"
                value={form.brandName}
                onChange={(e) => {
                  setField("brandName", e.target.value);
                  if (!form.brandSlug) setField("brandSlug", slugify(e.target.value));
                }}
                style={baseInput}
              />

              <label style={labelStyle}>Your store's nickname</label>
              <input
                type="text"
                placeholder="like sunnyshirts"
                value={form.brandSlug}
                onChange={(e) => setField("brandSlug", e.target.value)}
                style={baseInput}
              />
              <p style={{ fontSize: 12, color: "#888", marginTop: -8, marginBottom: 20 }}>
                This goes in your web link. Use small letters, numbers, and dashes. No spaces. We&apos;ll use{" "}
                <code style={{ background: "#f4f1ec", padding: "2px 6px", borderRadius: 4 }}>
                  {slugify(form.brandSlug || form.brandName) || "<your-nickname>"}
                </code>
                .
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
              <label style={labelStyle}>Pick 3 words that describe your store</label>
              <input
                type="text"
                placeholder="like fun, simple, bright — or dark, bold, premium"
                value={form.voiceVibe}
                onChange={(e) => setField("voiceVibe", e.target.value)}
                style={baseInput}
              />
              <p style={{ fontSize: 12, color: "#888", marginTop: -8, marginBottom: 20 }}>
                This helps your operator write product pages and emails in your style. Skip if you&apos;re not sure.
              </p>

              <label style={labelStyle}>A short sentence about your store (skip if not ready)</label>
              <input
                type="text"
                placeholder="like 'Built to last forever' or 'Coffee for sleepy people'"
                value={form.tagline}
                onChange={(e) => setField("tagline", e.target.value)}
                style={baseInput}
              />
            </>
          )}

          {step === 3 && (
            <>
              <label style={labelStyle}>Who's going to buy your stuff?</label>
              <textarea
                placeholder="like 'dog owners who like nice things' — or 'people who fix old cars' — one sentence is plenty"
                value={form.audience}
                onChange={(e) => setField("audience", e.target.value)}
                style={textareaInput}
              />
              <p style={{ fontSize: 12, color: "#888", marginTop: -8, marginBottom: 24 }}>
                Just tell us who they are. The operator uses this to write product pages and ads.
              </p>

              <label style={labelStyle}>Who ships the stuff to customers?</label>
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
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Printful does it</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    They print and ship for you. Just shirts, hats, posters, mugs. You never touch a box.
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
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>I ship it myself</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    You handle shipping. Or someone else who isn&apos;t Printful.
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#888", marginTop: 8, marginBottom: 0 }}>
                Most people pick the first one. You can hook up your Printful account later.
              </p>
            </>
          )}

          {step === 4 && (
            <>
              <label style={labelStyle}>What should your operator do first?</label>
              <textarea
                placeholder="like 'make me 8 cool black t-shirt designs for my store' — or 'look at my store and tell me what to fix this week'"
                value={form.firstTask}
                onChange={(e) => setField("firstTask", e.target.value)}
                style={textareaInput}
              />
              <p style={{ fontSize: 12, color: "#888", marginTop: -8, marginBottom: 8 }}>
                Pick one thing. Your operator starts on it the second you log in. You can change your mind any time.
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
                  Ideas you can copy
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Make 6 to 10 product designs in my style and add them to my store.</li>
                  <li>Look at my product pages and fix the 3 worst ones.</li>
                  <li>Build me an email that welcomes new customers.</li>
                  <li>Find 5 product ideas I&apos;d be good at and rank them.</li>
                </ul>
              </div>
            </>
          )}

          {step === 5 && (
            <div>
              {[
                ["Store name", form.brandName],
                ["Store nickname", slugify(form.brandSlug || form.brandName)],
                ["Your email", form.ownerEmail],
                [
                  "Vibe",
                  form.voiceVibe ||
                    "(skipped — we'll pick a clean default)"
                ],
                ["Short sentence", form.tagline || "(skipped)"],
                ["Who buys it", form.audience],
                ["Who ships it", form.fulfillment === "printful" ? "Printful does it" : "I ship it myself"],
                ["First job", form.firstTask]
              ].map(([k, v]) => (
                <div key={k} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #f0f0f0" }}>
                  <div style={{ fontSize: 11, color: "#888", letterSpacing: "0.06em", fontWeight: 600, textTransform: "uppercase" }}>
                    {k}
                  </div>
                  <div style={{ fontSize: 15, marginTop: 4, color: "#0F0E0C", whiteSpace: "pre-wrap" }}>{v}</div>
                </div>
              ))}
              <p style={{ fontSize: 13, color: "#666", marginTop: 16 }}>
                Next up: we&apos;ll send you to a safe payment page ($499 to start, then $99 a month).
                After you pay, your store opens up with your operator already working on your first job.
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
              {submitting ? "Setting up your store…" : "Set up my store →"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
