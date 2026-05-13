"use client";

import { useCallback, useEffect, useState } from "react";

type SpendSummary = {
  totalUsd: number;
  byProvider: Record<string, number>;
  byKind: Record<string, number>;
  byModel: Record<string, number>;
  byDay: Array<{ day: string; usd: number }>;
  entryCount: number;
  today: number;
  last7Days: number;
  last30Days: number;
  lastEntryAt?: string;
};

type BudgetStatus = {
  budget: { monthlyCapUsd: number; warnAtPct: number };
  monthlyUsd: number;
  utilizationPct: number;
  warn: boolean;
  exceeded: boolean;
};

type Response = {
  summary: SpendSummary;
  budgetStatus: BudgetStatus;
};

function fmt(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function SpendCard() {
  const [data, setData] = useState<Response | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [capInput, setCapInput] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/operator/spend", { cache: "no-store" });
      // Bail on auth failures + any non-2xx — keeps the loading state, never
      // crashes trying to read .budget from an error envelope
      if (!r.ok) return;
      const d = (await r.json()) as Response;
      if (!d?.budgetStatus?.budget) return;
      setData(d);
      setCapInput(String(d.budgetStatus.budget.monthlyCapUsd));
    } catch {
      // ignore network/parse errors
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  const saveBudget = async () => {
    setBusy(true);
    try {
      const cap = Number(capInput) || 0;
      await fetch("/api/operator/spend", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyCapUsd: cap, warnAtPct: 80 })
      });
      await refresh();
      setEditingBudget(false);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <p className="operator-empty">Loading spend data…</p>;
  }

  const { summary, budgetStatus } = data;
  const capPct = budgetStatus.budget.monthlyCapUsd > 0 ? Math.min(100, budgetStatus.utilizationPct) : 0;
  const capColor = budgetStatus.exceeded
    ? "rgba(255, 130, 130, 1)"
    : budgetStatus.warn
      ? "rgba(255, 220, 130, 1)"
      : "rgba(170, 255, 200, 1)";

  // Top kinds for display
  const topKinds = Object.entries(summary.byKind)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 12
        }}
      >
        <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Today</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{fmt(summary.today)}</div>
        </div>
        <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>7 days</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{fmt(summary.last7Days)}</div>
        </div>
        <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>30 days</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{fmt(summary.last30Days)}</div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            Monthly cap: {budgetStatus.budget.monthlyCapUsd > 0 ? fmt(budgetStatus.budget.monthlyCapUsd) : "off"}
          </span>
          <button
            type="button"
            onClick={() => setEditingBudget((v) => !v)}
            style={{
              background: "transparent",
              border: 0,
              color: "rgba(110,150,230,0.85)",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "inherit"
            }}
          >
            {editingBudget ? "Cancel" : "Edit"}
          </button>
        </div>
        {budgetStatus.budget.monthlyCapUsd > 0 ? (
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              borderRadius: 4,
              height: 6,
              overflow: "hidden"
            }}
          >
            <div
              style={{
                width: `${capPct}%`,
                height: "100%",
                background: capColor,
                transition: "width 200ms"
              }}
            />
          </div>
        ) : null}
        {budgetStatus.warn || budgetStatus.exceeded ? (
          <p
            style={{
              fontSize: 12,
              marginTop: 4,
              color: budgetStatus.exceeded ? "salmon" : "rgba(255,220,130,1)"
            }}
          >
            {budgetStatus.exceeded ? "⚠ Monthly cap exceeded" : "⚠ Approaching monthly cap"} — {fmt(budgetStatus.monthlyUsd)} of {fmt(budgetStatus.budget.monthlyCapUsd)}
          </p>
        ) : null}
        {editingBudget ? (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                padding: "6px 8px",
                color: "white",
                fontSize: 13,
                fontFamily: "inherit"
              }}
              placeholder="Monthly cap in USD (0 = off)"
            />
            <button
              type="button"
              onClick={saveBudget}
              disabled={busy}
              style={{
                background: "rgba(110,150,230,0.85)",
                border: 0,
                color: "white",
                padding: "6px 12px",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13
              }}
            >
              Save
            </button>
          </div>
        ) : null}
      </div>

      {topKinds.length > 0 ? (
        <>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Top spend by kind (all-time)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {topKinds.map(([kind, usd]) => (
              <div key={kind} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "rgba(255,255,255,0.75)" }}>{kind}</span>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>{fmt(usd)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
        <span>{summary.entryCount} call{summary.entryCount === 1 ? "" : "s"} tracked</span>
        <span>Total: {fmt(summary.totalUsd)}</span>
      </div>
    </>
  );
}
