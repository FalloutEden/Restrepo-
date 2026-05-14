import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { listTenants, updateTenant } from "@/lib/tenancy";
import { sendEmail } from "@/lib/email";
import { audit } from "@/lib/audit";

// Spend ceiling enforcer — runs hourly via Vercel scheduler.
//
// For each tenant: sum their API spend for the current month from the
// shared spend tracker, compare against their config.spendBudgetUsdMonthly.
// If exceeded: set config.operatorEnabled = false AND email the tenant.
//
// We read from the same .openclaw/operator/spend.jsonl that lib/spend-tracker
// writes. Tenant attribution comes from the entry's `tenantId` field (added
// by the per-tenant operator-tools wrappers in Phase 4 — for now, untagged
// entries are treated as admin/global and don't count against any tenant).
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

function readSpend(): Map<string, number> {
  // Where spend log lives — same path as lib/spend-tracker.ts uses
  const spendPath = (() => {
    const onVercel = Boolean(process.env.VERCEL);
    const base = onVercel ? "/tmp/openclaw" : path.join(process.cwd(), ".openclaw");
    return path.join(base, "operator", "spend.jsonl");
  })();

  const byTenant = new Map<string, number>();
  if (!fs.existsSync(spendPath)) return byTenant;

  const cutoff = thisMonthStart();
  const lines = fs.readFileSync(spendPath, "utf8").split("\n").filter(Boolean);
  for (const ln of lines) {
    try {
      const e = JSON.parse(ln) as SpendEntry;
      if (!e.tenantId) continue;
      if (new Date(e.ts).getTime() < cutoff) continue;
      const cost = Number(e.costUsd ?? 0);
      if (cost <= 0) continue;
      byTenant.set(e.tenantId, (byTenant.get(e.tenantId) ?? 0) + cost);
    } catch {}
  }
  return byTenant;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const spendByTenant = readSpend();
  const tenants = await listTenants();

  const summary: Array<{
    tenantId: string;
    brandSlug: string;
    monthlyUsd: number;
    capUsd: number;
    action: "ok" | "warned" | "paused";
  }> = [];

  for (const t of tenants) {
    const monthlyUsd = spendByTenant.get(t.id) ?? 0;
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
