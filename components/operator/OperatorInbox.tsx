"use client";

import { useState } from "react";

import type { HumanTask, Proposal } from "@/lib/operator-state";

type Props = {
  proposals: Proposal[];
  tasks: HumanTask[];
  onChange: () => void;
};

export function OperatorInbox({ proposals, tasks, onChange }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const decideProposal = async (id: string, decision: "approved" | "rejected") => {
    setBusyId(id);
    try {
      const notes = decision === "rejected" ? prompt("Rejection notes (optional):") || undefined : undefined;
      await fetch(`/api/operator/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes })
      });
    } finally {
      setBusyId(null);
      onChange();
    }
  };

  const resolveTask = async (id: string, status: "done" | "dismissed") => {
    setBusyId(id);
    try {
      await fetch(`/api/operator/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
    } finally {
      setBusyId(null);
      onChange();
    }
  };

  const empty = proposals.length === 0 && tasks.length === 0;
  if (empty) {
    return <p className="operator-empty">Nothing pending. Operator will queue items here when needed.</p>;
  }

  return (
    <div className="operator-inbox-list">
      {proposals.map((p) => {
        const monthly = p.estimatedMonthlyRevenueUsd;
        return (
          <article key={p.id} className="operator-inbox-item">
            <h3>{p.title}</h3>
            <p>{p.summary}</p>
            <p>
              <span className="operator-inbox-cost">${p.estimatedCostUsd.toFixed(2)} cost</span>
              {monthly ? (
                <>
                  {" · "}projected monthly net ${monthly.low}–${monthly.high}
                </>
              ) : null}
            </p>
            <p className="operator-meta">
              {p.briefPath ? `Brief saved: ${p.briefPath}` : "No brief written."}
              {p.roiCsvPath ? ` · ROI CSV: ${p.roiCsvPath}` : ""}
            </p>
            <div className="operator-button-row">
              <button
                type="button"
                className="operator-button"
                onClick={() => decideProposal(p.id, "approved")}
                disabled={busyId === p.id}
              >
                Approve
              </button>
              <button
                type="button"
                className="operator-button operator-button-secondary"
                onClick={() => decideProposal(p.id, "rejected")}
                disabled={busyId === p.id}
              >
                Reject
              </button>
            </div>
          </article>
        );
      })}

      {tasks.map((t) => (
        <article key={t.id} className="operator-inbox-item">
          <h3>{t.title}</h3>
          <p>{t.detail}</p>
          <p className="operator-meta">Why: {t.why}</p>
          <div className="operator-button-row">
            <button
              type="button"
              className="operator-button"
              onClick={() => resolveTask(t.id, "done")}
              disabled={busyId === t.id}
            >
              Mark done
            </button>
            <button
              type="button"
              className="operator-button operator-button-secondary"
              onClick={() => resolveTask(t.id, "dismissed")}
              disabled={busyId === t.id}
            >
              Dismiss
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
