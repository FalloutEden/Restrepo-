import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { listTenants, updateTenant } from "@/lib/tenancy";
import { sendEmail } from "@/lib/email";
import { audit } from "@/lib/audit";
import { buildTenantPaths } from "@/lib/tenant-context";

// Spend ceiling enforcer — runs hourly via Vercel scheduler.
//
// For each tenant: sum their API spend for the current month from their
// per-tenant spend log, compare against their config.spendBudgetUsdMonthly.
// If exceeded: set config.operatorEnabled = false AND email the tenant.
//
// After the 2026-05-14 BYOK migration, each tenant's spend lives at
//   .openclaw/tenants/<tenantId>/operator/spend.jsonl
// (or /tmp/openclaw/tenants/<tenantId>/operator/spend.jsonl on Vercel).
// The founder's spend stays at the legacy .openclaw/operator/spend.jsonl
// path but doesn't trigger a cap — the founder has no monthly tenant cap.
//
// Failure mode: if a tenant's email is missing, we still pause them but
// log a warning. They'll figure it out when they try to use the operator.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SpendEntry = {
  ts: string;
  costUsd?: number;
  tenantId?: string;
};

function thisMonthStart(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

/** Read one tenant's monthly spend from their per-tenant spend log.
 *  Returns 0 if no log exists yet (new tenant, never billed). */
function readTenantMonthlySpend(tenantId: string): number {
  const spendPath = buildTenantPaths(tenantId).spendLog;
  if (!fs.existsSync(spendPath)) return 0;

  const cutoff = thisMonthStart();
  let total = 0;
  const lines = fs.readFileSync(spendPath, "utf8").split("\n").filter(Boolean);
  for (const ln of lines) {
    try {
      const e = JSON.parse(ln) as SpendEntry;
      if (new Date(e.ts).getTime() < cutoff) continue;
      const cost = Number(e.costUsd ?? 0);
      if (cost <= 0) continue;
      total += cost;
    } catch {}
  }
  return total;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenants = await listTenants();

  const summary: Array<{
    tenantId: string;
    brandSlug: string;
    monthlyUsd: number;
    capUsd: number;
    action: "ok" | "warned" | "paused";
  }> = [];

  for (const t of tenants) {
    // Each tenant's spend lives in their own log file post-BYOK migration.
    // Reading per-tenant means deleting a tenant's spend log doesn't break
    // anyone else's enforcement, and the cap math is naturally isolated.
    const monthlyUsd = readTenantMonthlySpend(t.id);
    const capUsd = Number(t.config.spendBudgetUsdMonthly ?? 0);
    if (capUsd <= 0) {
      summary.push({ tenantId: t.id, brandSlug: t.brandSlug, monthlyUsd, capUsd: 0, action: "ok" });
      continue;
    }
    if (monthlyUsd < capUsd * 0.8) {
      summary.push({ tenantId: t.id, brandSlug: t.brandSlug, monthlyUsd, capUsd, action: "ok" });
      continue;
    }
    if (monthlyUsd < capUsd) {
      // Approaching cap — could send a warning email here; for v1 just log
      summary.push({ tenantId: t.id, brandSlug: t.brandSlug, monthlyUsd, capUsd, action: "warned" });
      continue;
    }

    // Cap exceeded — pause and notify
    if (t.config.operatorEnabled) {
      await updateTenant(t.id, {
        config: { ...t.config, operatorEnabled: false }
      });
      audit({
        action: "tenant.subscription_changed",
        actor: "spend-ceiling-cron",
        target: t.id,
        detail: { monthlyUsd, capUsd, paused: true },
        ok: true
      });
      if (t.ownerEmail) {
        const subject = `Your Operator was paused — monthly spend cap reached`;
        const html = `
<div style="font-family:-apple-system,sans-serif;color:#0F0E0C;max-width:560px;margin:0 auto;padding:32px">
  <h1 style="font-size:22px;font-weight:700">Your Operator is paused</h1>
  <p>Hey ${t.brand.name} — your operator hit the monthly spend cap you set.</p>
  <p>
    Spend this month: <strong>$${monthlyUsd.toFixed(2)}</strong><br/>
    Cap: <strong>$${capUsd.toFixed(2)}</strong>
  </p>
  <p>
    The operator stops running automated tasks until either:<br/>
    1. The next billing cycle resets (1st of next month), or<br/>
    2. You raise the cap from your dashboard.
  </p>
  <p style="margin-top:24px">
    <a href="https://blackvault.studio/dashboard" style="background:#0F0E0C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Open dashboard →</a>
  </p>
  <p style="color:#888;font-size:13px;margin-top:32px">
    The Operator · a Black Vault product · Reply to this email for support
  </p>
</div>`;
        sendEmail({ to: t.ownerEmail, subject, html }).catch((e) =>
          console.warn(`[spend-ceiling] tenant email failed for ${t.id}:`, e)
        );
      }
      summary.push({ tenantId: t.id, brandSlug: t.brandSlug, monthlyUsd, capUsd, action: "paused" });
    } else {
      summary.push({ tenantId: t.id, brandSlug: t.brandSlug, monthlyUsd, capUsd, action: "paused" });
    }
  }

  return NextResponse.json({
    ok: true,
    tenantsChecked: tenants.length,
    actions: summary,
    pausedThisRun: summary.filter((s) => s.action === "paused").length
  });
}
