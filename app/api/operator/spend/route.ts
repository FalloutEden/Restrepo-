import { NextResponse } from "next/server";

import { getBudgetStatus, summarizeSpend, writeBudget, type SpendBudget } from "@/lib/spend-tracker";
import { resolveTenantContext } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // A tenant sees only its own spend + budget; the founder sees the
  // founder-scoped figures. Without scoping, a tenant could read founder
  // billing data and (via PATCH) disable the founder's spend ceiling.
  const { tenantId } = await resolveTenantContext(request);
  const [summary, budgetStatus] = await Promise.all([
    summarizeSpend({ tenantId }),
    getBudgetStatus(tenantId)
  ]);
  return NextResponse.json({ summary, budgetStatus });
}

export async function PATCH(request: Request) {
  const { tenantId } = await resolveTenantContext(request);
  let body: Partial<SpendBudget>;
  try {
    body = (await request.json()) as Partial<SpendBudget>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const monthlyCapUsd = typeof body.monthlyCapUsd === "number" ? Math.max(0, body.monthlyCapUsd) : 0;
  const warnAtPct =
    typeof body.warnAtPct === "number" ? Math.max(0, Math.min(100, body.warnAtPct)) : 80;
  await writeBudget({ monthlyCapUsd, warnAtPct }, tenantId);
  const status = await getBudgetStatus(tenantId);
  return NextResponse.json({ budgetStatus: status });
}
