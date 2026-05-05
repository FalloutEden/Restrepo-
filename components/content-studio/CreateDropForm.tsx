"use client";

import { useState } from "react";

type Props = {
  onCreated: (id: string) => void;
  disabled?: boolean;
};

const BRANDS = [
  { slug: "black-vault-apparel", label: "Black Vault Apparel" },
  { slug: "locklayer", label: "LockLayer" }
];

export function CreateDropForm({ onCreated, disabled }: Props) {
  const [productTitle, setProductTitle] = useState("");
  const [brand, setBrand] = useState(BRANDS[0].slug);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!productTitle.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/content-studio/drops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productTitle: productTitle.trim(), brand })
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Create failed (${r.status})`);
      }
      const data = (await r.json()) as { drop: { id: string } };
      setProductTitle("");
      onCreated(data.drop.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="cs-form-row">
        <input
          className="cs-input"
          type="text"
          placeholder="Product title (e.g. The Vault Tee)"
          value={productTitle}
          onChange={(e) => setProductTitle(e.target.value)}
          disabled={submitting || disabled}
        />
        <select
          className="cs-select"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          disabled={submitting || disabled}
          style={{ flex: "0 0 auto", minWidth: 160 }}
        >
          {BRANDS.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="cs-button"
        onClick={submit}
        disabled={submitting || disabled || !productTitle.trim()}
      >
        {submitting ? "Creating..." : "Create drop"}
      </button>
      {error ? <p style={{ color: "salmon", fontSize: 12, marginTop: 6 }}>{error}</p> : null}
    </div>
  );
}
