"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// /admin/incidents — founder-facing list of recent security + ops events
// Pulls /api/admin/incidents every 30s. Light SaaS theme to match dashboard.
// Requires admin auth (cookie set via /admin/login).

type Incident = {
  ts: string;
  action: string;
  actor: string;
  target?: string;
  ip?: string;
  ok?: boolean;
  detail?: Record<string, unknown>;
};

const ACTION_STYLES: Record<string, { color: string; label: string }> = {
  "rate_limit.triggered": { color: "#A67843", label: "Rate-limit hit" },
  "auth.failed": { color: "#8B0000", label: "Auth failed" },
  "auth.success": { color: "#0F0E0C", label: "Admin login" },
  "tenant.created": { color: "#1a6e2a", label: "Tenant created" },
  "tenant.subscription_changed": { color: "#A67843", label: "Tenant subscription" },
  "tenant.canceled": { color: "#8B0000", label: "Tenant canceled" },
  "tenant.bearer_rotated": { color: "#A67843", label: "Token rotated" },
  "admin.action": { color: "#444", label: "System action" }
};

function fmtAction(a: string): { color: string; label: string } {
  return ACTION_STYLES[a] ?? { color: "#444", label: a };
}

function fmtTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch {
    return ts;
  }
}

export default function IncidentsPage() {
  const [data, setData] = useState<{ incidents: Incident[]; total: number; fetchedAt?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const r = await fetch("/api/admin/incidents?limit=200", { cache: "no-store" });
      if (r.status === 401) {
        setError("Not authenticated. Visit /admin/login first.");
        return;
      }
      if (!r.ok) {
        setError(`Error ${r.status}`);
        return;
      }
      const d = (await r.json()) as { incidents: Incident[]; total: number; fetchedAt: string };
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    }
  }

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#fafafa",
        color: "#0F0E0C",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif",
        padding: "32px 24px"
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <Link href="/dashboard" style={{ color: "#555", textDecoration: "none", fontSize: 14 }}>
            ← Dashboard
          </Link>
          <span style={{ fontSize: 12, color: "#888" }}>
            {data?.fetchedAt ? `Refreshed ${fmtTime(data.fetchedAt)}` : "—"}
          </span>
        </nav>

        <p style={{ fontSize: 12, letterSpacing: "0.18em", color: "#A67843", marginBottom: 8, fontWeight: 700 }}>
          OWNER VIEW · INCIDENT LOG
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
          Incidents
        </h1>
        <p style={{ fontSize: 15, color: "#666", marginBottom: 32 }}>
          Security-relevant events and system actions across all tenants. Auto-refreshes every 30 seconds.
        </p>

        {error && (
          <div
            style={{
              padding: "12px 16px",
              background: "#fff5f5",
              border: "1px solid #ffd0d0",
              borderRadius: 8,
              color: "#8B0000",
              fontSize: 14,
              marginBottom: 16
            }}
          >
            {error}
          </div>
        )}

        {data && data.incidents.length === 0 && (
          <div
            style={{
              padding: 32,
              background: "#fff",
              border: "1px solid #ebebeb",
              borderRadius: 12,
              textAlign: "center",
              color: "#666"
            }}
          >
            <p style={{ fontSize: 15, margin: 0 }}>No incidents in the recent window. Quiet day.</p>
          </div>
        )}

        {data && data.incidents.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#fafafa", borderBottom: "1px solid #ebebeb" }}>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, color: "#666", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Time
                  </th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, color: "#666", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Action
                  </th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, color: "#666", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Actor
                  </th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, color: "#666", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Target
                  </th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, color: "#666", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    IP
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.incidents.map((inc, i) => {
                  const meta = fmtAction(inc.action);
                  return (
                    <tr
                      key={`${inc.ts}-${i}`}
                      style={{
                        borderBottom: "1px solid #f4f4f4",
                        background: inc.ok === false ? "rgba(255,0,0,0.02)" : undefined
                      }}
                    >
                      <td style={{ padding: "10px 16px", fontFamily: "'SF Mono', Menlo, monospace", color: "#666", whiteSpace: "nowrap" }}>
                        {fmtTime(inc.ts)}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 8px",
                            borderRadius: 4,
                            background: `${meta.color}15`,
                            color: meta.color,
                            fontSize: 12,
                            fontWeight: 600
                          }}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", color: "#0F0E0C" }}>{inc.actor}</td>
                      <td style={{ padding: "10px 16px", fontFamily: "'SF Mono', Menlo, monospace", color: "#555", fontSize: 12 }}>
                        {inc.target ?? "—"}
                      </td>
                      <td style={{ padding: "10px 16px", fontFamily: "'SF Mono', Menlo, monospace", color: "#888", fontSize: 12 }}>
                        {inc.ip ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ marginTop: 24, fontSize: 12, color: "#888" }}>
          Showing {data?.total ?? 0} incidents from the last 200 audit entries. For full audit
          access, read <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 4 }}>.openclaw/audit.jsonl</code>.
        </p>
      </div>
    </main>
  );
}
