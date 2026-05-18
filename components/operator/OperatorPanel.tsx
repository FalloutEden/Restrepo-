"use client";

import { useCallback, useEffect, useState } from "react";

import { authedFetch } from "@/lib/client-auth";
import type { ActivityEntry, HumanTask, Proposal } from "@/lib/operator-state";
import type { OperatorState } from "@/lib/operator-state";
import { OperatorChat } from "@/components/operator/OperatorChat";
import { OperatorInbox } from "@/components/operator/OperatorInbox";
import { OperatorActivity } from "@/components/operator/OperatorActivity";
import { SpendCard } from "@/components/operator/SpendCard";

type StateResponse = {
  state: OperatorState;
  activity: ActivityEntry[];
  pendingProposals: Proposal[];
  recentDecisions: Proposal[];
  openTasks: HumanTask[];
  conversations: Array<{ id: string; messageCount: number; lastUpdated: string }>;
  error?: string;
};

export function OperatorPanel() {
  const [data, setData] = useState<StateResponse | null>(null);
  const [tickRunning, setTickRunning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await authedFetch("/api/operator/state", { cache: "no-store" });
      // 401 = unauthenticated dashboard view in production. Don't crash —
      // leave data null so the UI renders empty rather than reading
      // properties off an error envelope.
      if (!response.ok) return;
      const payload = (await response.json()) as StateResponse;
      if (!payload?.state) return;
      setData(payload);
    } catch (error) {
      console.error("Failed to load operator state", error);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 8000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleHuntNow = useCallback(async () => {
    setTickRunning(true);
    try {
      const response = await authedFetch("/api/operator/tick", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "tick failed" }));
        alert(`Tick failed: ${body.error ?? response.status}`);
      }
    } catch (error) {
      alert(`Tick error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTickRunning(false);
      void refresh();
    }
  }, [refresh]);

  return (
    <>
      <div className="operator-tick-bar">
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 14 }}>Autonomous initiative</strong>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            Last tick:{" "}
            {data?.state.lastTickAt
              ? new Date(data.state.lastTickAt).toLocaleString()
              : "never run"}
          </p>
        </div>
        <button
          type="button"
          className="operator-button"
          onClick={handleHuntNow}
          disabled={tickRunning}
        >
          {tickRunning ? "Hunting..." : "Hunt now"}
        </button>
      </div>

      <div className="operator-grid">
        <section className="operator-card">
          <h2>Chat</h2>
          <OperatorChat onTurnComplete={refresh} />
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <section className="operator-card">
            <h2>Approval inbox</h2>
            <OperatorInbox
              proposals={data?.pendingProposals ?? []}
              tasks={data?.openTasks ?? []}
              onChange={refresh}
            />
          </section>

          <section className="operator-card">
            <h2>Spend</h2>
            <SpendCard />
          </section>

          <section className="operator-card">
            <h2>Activity</h2>
            <OperatorActivity entries={data?.activity ?? []} />
          </section>
        </div>
      </div>
    </>
  );
}
