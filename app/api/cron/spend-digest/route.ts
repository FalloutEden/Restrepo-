import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { listTenants } from "@/lib/tenancy";
import { sendEmail } from "@/lib/email";
import { audit } from "@/lib/audit";
import { buildTenantPaths, FOUNDER_TENANT_ID } from "@/lib/tenant-context";

// Weekly spend digest — runs Mondays 08:00 UTC.
//
// Emails the founder a roll-up of the previous 7 days of spend across
// every tenant + the founder/admin context. Companion to the spend-ceiling
// cron (which pauses individual tenants when they cross their cap) — this
// one is about giving the founder visibility into the shape of the spend
// curve over time.
//
// Post-BYOK migration: spend logs are per-tenant at .openclaw/tenants/<id>/
// operator/spend.jsonl, with the founder log at the legacy .openclaw/
// operator/spend.jsonl path. This cron walks every tenant directory + the
// founder log, then rolls them up.
//
// Cost: $0 (just outbound email + file reads).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SpendEntry = {
  ts: string;
  provider?: "anthropic" | "openai";
  kind?: string;
  model?: string;
  costUsd?: number;
  tenantId?: string;
};

const WINDOW_DAYS = 7;

function readOneSpendLog(fp: string, cutoff: number, defaultTenantId: string): SpendEntry[] {
  if (!fs.existsSync(fp)) return [];
  const lines = fs.readFileSync(fp, "utf8").split("\n").filter(Boolean);
  const out: SpendEntry[] = [];
  for (const ln of lines) {
    try {
      const e = JSON.parse(ln) as SpendEntry;
      const t = new Date(e.ts).getTime();
      if (!Number.isFinite(t) || t < cutoff) continue;
      // Back-fill tenantId on legacy untagged entries
      out.push({ ...e, tenantId: e.tenantId ?? defaultTenantId });
    } catch {}
  }
  return out;
}

function tenantsBase(): string {
  const onVercel = Boolean(process.env.VERCEL);
  const base = onVercel ? "/tmp/openclaw" : path.join(process.cwd(), ".openclaw");
  return path.join(base, "tenants");
}

function readRecentSpend(tenantIds: string[]): SpendEntry[] {
  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const out: SpendEntry[] = [];
  // Founder log (legacy path, lives at <base>/operator/spend.jsonl)
  out.push(...readOneSpendLog(buildTenantPaths(FOUNDER_TENANT_ID).spendLog, cutoff, FOUNDER_TENANT_ID));
  // Each tenant log
  for (const tid of tenantIds) {
    out.push(...readOneSpendLog(buildTenantPaths(tid).spendLog, cutoff, tid));
  }
  // Plus any tenant directory on disk that doesn't appear in the live
  // tenant list (e.g. recently canceled, or local-dev scratch tenants).
  // Defensive: ensures we never miss spend just because a tenant record
  // got cleaned up before the digest runs.
  const tBase = tenantsBase();
  if (fs.existsSync(tBase)) {
    for (const dirent of fs.readdirSync(tBase, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      if (tenantIds.includes(dirent.name)) continue;
      if (!/^[a-zA-Z0-9_]+$/.test(dirent.name)) continue;
      const fp = path.join(tBase, dirent.name, "operator", "spend.jsonl");
      out.push(...readOneSpendLog(fp, cutoff, dirent.name));
    }
  }
  return out;
}

type Row = { label: string; cost: number; calls: number };

function rollupBy<T extends keyof SpendEntry>(
  entries: SpendEntry[],
  key: T,
  fallback = "(untagged)"
): Row[] {
  const m = new Map<string, Row>();
  for (const e of entries) {
    const k = (e[key] as string | undefined) ?? fallback;
    const prev = m.get(k) ?? { label: k, cost: 0, calls: 0 };
    prev.cost += Number(e.costUsd ?? 0);
    prev.calls += 1;
    m.set(k, prev);
  }
  return Array.from(m.values()).sort((a, b) => b.cost - a.cost);
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function buildDigestHtml(args: {
  entries: SpendEntry[];
  tenantNames: Map<string, string>;
}): { subject: string; html: string; totalUsd: number } {
  const { entries, tenantNames } = args;
  const totalUsd = entries.reduce((a, e) => a + Number(e.costUsd ?? 0), 0);
  const byProvider = rollupBy(entries, "provider", "unknown");
  const byKind = rollupBy(entries, "kind", "internal");
  const byTenant = rollupBy(entries, "tenantId", "admin/internal").map((r) => ({
    ...r,
    label: r.label === "admin/internal" ? r.label : tenantNames.get(r.label) ?? r.label
  }));

  const row = (r: Row) =>
    `<tr><td style="padding:6px 12px">${r.label}</td><td style="padding:6px 12px;text-align:right">${formatUsd(r.cost)}</td><td style="padding:6px 12px;text-align:right;color:#888">${r.calls.toLocaleString()}</td></tr>`;
  const table = (rows: Row[]) =>
    rows.length === 0
      ? `<p style="color:#888;font-style:italic">No spend recorded.</p>`
      : `<table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #ebebeb;border-radius:8px;overflow:hidden">
           <thead><tr style="background:#f7f5f1">
             <th style="text-align:left;padding:8px 12px;font-weight:600">Bucket</th>
             <th style="text-align:right;padding:8px 12px;font-weight:600">Spend</th>
             <th style="text-align:right;padding:8px 12px;font-weight:600">Calls</th>
           </tr></thead>
           <tbody>${rows.map(row).join("")}</tbody>
         </table>`;

  const subject = `Operator weekly spend — ${formatUsd(totalUsd)} (${entries.length.toLocaleString()} calls)`;
  const html = `
<div style="font-family:-apple-system,sans-serif;color:#0F0E0C;max-width:680px;margin:0 auto;padding:32px">
  <p style="color:#888;font-size:12px;letter-spacing:.04em;text-transform:uppercase;margin:0">Black Vault · The Operator</p>
  <h1 style="font-size:24px;font-weight:700;margin:8px 0 24px">Weekly spend digest</h1>
  <p style="font-size:15px;line-height:1.5">
    Last ${WINDOW_DAYS} days: <strong>${formatUsd(totalUsd)}</strong> across <strong>${entries.length.toLocaleString()}</strong> API calls.
  </p>

  <h2 style="font-size:14px;font-weight:600;margin:24px 0 8px;color:#555">By provider</h2>
  ${table(byProvider)}

  <h2 style="font-size:14px;font-weight:600;margin:24px 0 8px;color:#555">By spend kind</h2>
  ${table(byKind)}

  <h2 style="font-size:14px;font-weight:600;margin:24px 0 8px;color:#555">By tenant</h2>
  ${table(byTenant)}

  <p style="color:#888;font-size:12px;margin-top:32px">
    Source: <code>.openclaw/operator/spend.jsonl</code> + per-tenant logs · generated by the Operator spend-digest cron
  </p>
</div>`;
  return { subject, html, totalUsd };
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenants = await listTenants();
  const entries = readRecentSpend(tenants.map((t) => t.id));
  const tenantNames = new Map(tenants.map((t) => [t.id, `${t.brand.name} (${t.brandSlug})`]));
  const { subject, html, totalUsd } = buildDigestHtml({ entries, tenantNames });

  const to = process.env.FOUNDER_ALERT_EMAIL?.trim();
  if (!to) {
    audit({
      action: "cron.skipped",
      actor: "spend-digest-cron",
      target: "founder-email",
      detail: { reason: "FOUNDER_ALERT_EMAIL not set", totalUsd, entryCount: entries.length },
      ok: false
    });
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: "FOUNDER_ALERT_EMAIL not set",
      previewSubject: subject,
      totalUsd,
      entryCount: entries.length
    });
  }

  try {
    await sendEmail({ to, subject, html });
    audit({
      action: "cron.run",
      actor: "spend-digest-cron",
      target: to,
      detail: { totalUsd, entryCount: entries.length, windowDays: WINDOW_DAYS },
      ok: true
    });
    return NextResponse.json({
      ok: true,
      sentTo: to,
      subject,
      totalUsd,
      entryCount: entries.length
    });
  } catch (e) {
    audit({
      action: "cron.failed",
      actor: "spend-digest-cron",
      target: to,
      detail: { error: e instanceof Error ? e.message : String(e) },
      ok: false
    });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
