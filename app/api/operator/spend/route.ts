import { NextResponse } from "next/server";

import { getBudgetStatus, summarizeSpend, writeBudget, type SpendBudget } from "@/lib/spend-tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [summary, budgetStatus] = await Promise.all([summarizeSpend(), getBudgetStatus()]);
  return NextResponse.json({ summary, budgetStatus });
}

export async function PATCH(request: Request) {
  let body: Partial<SpendBudget>;
  try {
    body = (await request.json()) as Partial<SpendBudget>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const monthlyCapUsd = typeof body.monthlyCapUsd === "number" ? Math.max(0, body.monthlyCapUsd) : 0;
  const warnAtPct =
    typeof body.warnAtPct === "number" ? Math.max(0, Math.min(100, body.warnAtPct)) : 80;
  await writeBudget({ monthlyCapUsd, warnAtPct });
  const status = await getBudgetStatus();
  return NextResponse.json({ budgetStatus: status });
}
