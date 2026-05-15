import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/email";
import { audit } from "@/lib/audit";

// Health monitor cron — runs every 5 min via Vercel scheduler.
//
// Pings critical endpoints (our own /api/health, plus the third-party APIs
// the SaaS depends on). On failure, sends one email per incident to
// FOUNDER_ALERT_EMAIL and writes an audit log entry.
//
// Dedup: in-memory recent-failures map prevents re-emailing the same outage
// every 5 min. Same component must fail 3 consecutive checks before re-alerting.
//
// Set:
//   FOUNDER_ALERT_EMAIL=karli@blackvault.studio  (or your real inbox)

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckResult = {
  name: string;
  url: string;
  ok: boolean;
  status?: number;
  ms: number;
  error?: string;
};

// In-memory failure tracker — survives within a warm Vercel instance.
// Cold starts reset, which is fine: an outage that lasts past a cold start
// will re-alert (we'd want to know it's still down).
const recentFailures = new Map<string, { count: number; lastAlertAt: number }>();

const ALERT_AFTER_FAILURES = 3; // 3x 5min = ~15 min downtime before alert
const ALERT_DEDUP_MS = 60 * 60 * 1000; // re-alert after 1 hour at most

async function ping(name: string, url: string, init?: RequestInit): Promise<CheckResult> {
  const start = Date.now();
  try {
    const r = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
      headers: { ...(init?.headers ?? {}), "User-Agent": "OperatorHealthMonitor/1.0" }
    });
    // Reachability check: any 2xx/3xx/4xx response means the host is up. Only
    // network errors / 5xx / timeouts indicate the dependency is down. Status
    // pages sometimes return 302 (redirect to statuspage.io) or 404 (URL
    // changed). Those aren't outages — they're just URL churn. Don't false-alarm
    // the founder over them.
    const ok = r.status > 0 && r.status < 500;
    return { name, url, ok, status: r.status, ms: Date.now() - start };
  } catch (e) {
    return {
      name,
      url,
      ok: false,
      ms: Date.now() - start,
      error: e instanceof Error ? e.message : "unknown"
    };
  }
}

function selfBaseUrl(req: Request): string {
  const fromHeader = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (fromHeader) return `${proto}://${fromHeader}`;
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const base = selfBaseUrl(req);

  // Status-page URLs are the roots, not /api/v2/status.json — those JSON
  // endpoints were Statuspage.io's old convention and Stripe + Anthropic
  // both retired theirs. The roots are stable.
  const checks = await Promise.all([
    ping("self", `${base}/api/health`),
    ping("stripe", "https://status.stripe.com"),
    ping("shopify", "https://www.shopifystatus.com"),
    ping("anthropic", "https://status.anthropic.com")
  ]);

  const failed = checks.filter((c) => !c.ok);
  const newlyAlerting: string[] = [];

  for (const f of failed) {
    const tracker = recentFailures.get(f.name) ?? { count: 0, lastAlertAt: 0 };
    tracker.count += 1;
    const now = Date.now();
    const shouldAlert =
      tracker.count >= ALERT_AFTER_FAILURES &&
      now - tracker.lastAlertAt > ALERT_DEDUP_MS;
    if (shouldAlert) {
      tracker.lastAlertAt = now;
      newlyAlerting.push(f.name);
    }
    recentFailures.set(f.name, tracker);
  }

  // Reset counters for components that came back healthy
  for (const c of checks) {
    if (c.ok) recentFailures.delete(c.name);
  }

  if (newlyAlerting.length > 0) {
    const alertEmail = process.env.FOUNDER_ALERT_EMAIL?.trim();
    const subject = `🚨 The Operator — ${newlyAlerting.length} service(s) failing`;
    const html = `
<h2 style="font-family:-apple-system,sans-serif;color:#8B0000">Health monitor alert</h2>
<p style="font-family:-apple-system,sans-serif;color:#333">
The following services have failed 3+ consecutive checks:
</p>
<ul style="font-family:'SF Mono',Menlo,monospace;font-size:13px;color:#333">
${failed
  .filter((f) => newlyAlerting.includes(f.name))
  .map((f) => `<li><strong>${f.name}</strong>: ${f.status ?? "—"} after ${f.ms}ms ${f.error ? `(${f.error})` : ""}<br/><span style="color:#888">${f.url}</span></li>`)
  .join("")}
</ul>
<p style="font-family:-apple-system,sans-serif;color:#666;font-size:13px">
Time: ${new Date().toISOString()}<br/>
Will not re-alert for the same component for 1 hour.
</p>
<p style="font-family:-apple-system,sans-serif;color:#666;font-size:12px">
The Operator · Health monitor
</p>`;

    if (alertEmail) {
      sendEmail({ to: alertEmail, subject, html }).catch((e) =>
        console.warn("[health] alert send failed:", e)
      );
    } else {
      console.warn("[health] FOUNDER_ALERT_EMAIL not set — skipping email alert");
    }

    audit({
      action: "admin.action",
      actor: "health-monitor-cron",
      target: newlyAlerting.join(","),
      detail: { failed: failed.map((f) => ({ name: f.name, status: f.status, ms: f.ms, error: f.error })) },
      ok: false
    });
  }

  return NextResponse.json({
    ok: failed.length === 0,
    checks,
    failed: failed.map((f) => f.name),
    newlyAlerting
  });
}
