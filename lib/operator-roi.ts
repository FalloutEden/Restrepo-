// Build the markdown brief + CSV ROI sheet that ships alongside every
// spend-bound proposal. Pure formatting — no I/O. The state layer owns where
// the files land on disk.

export type RoiBriefInput = {
  id: string;
  title: string;
  summary: string;
  action: string;
  rationale?: string;
  assumptions: string[];
  estimatedCostUsd: number;
  unitCostUsd?: number;
  retailPriceUsd?: number;
  projectedWeeklyVolume: { low: number; mid: number; high: number } | null;
  paybackWeeks?: number;
  humanFootwork: string[];
};

export function buildRoiBrief(input: RoiBriefInput): { briefMarkdown: string; roiCsv: string } {
  const margin =
    input.retailPriceUsd && input.unitCostUsd
      ? Math.max(0, input.retailPriceUsd - input.unitCostUsd)
      : 0;
  const marginPct =
    input.retailPriceUsd && margin > 0 ? (margin / input.retailPriceUsd) * 100 : 0;

  const weeks = input.projectedWeeklyVolume;
  const monthly = weeks
    ? {
        low: Math.round(weeks.low * margin * 4.33),
        mid: Math.round(weeks.mid * margin * 4.33),
        high: Math.round(weeks.high * margin * 4.33)
      }
    : null;

  const briefMarkdown = [
    `# ${input.title}`,
    `_Proposal ${input.id} — generated ${new Date().toISOString()}_`,
    "",
    "## Summary",
    input.summary,
    "",
    "## Proposed action",
    input.action,
    input.rationale ? `\n**Rationale:** ${input.rationale}` : "",
    "",
    "## Numbers",
    `- Estimated cost: **$${input.estimatedCostUsd.toFixed(2)}**`,
    input.unitCostUsd ? `- Unit cost: $${input.unitCostUsd.toFixed(2)}` : "",
    input.retailPriceUsd ? `- Retail price: $${input.retailPriceUsd.toFixed(2)}` : "",
    margin > 0 ? `- Per-unit margin: $${margin.toFixed(2)} (${marginPct.toFixed(1)}%)` : "",
    weeks ? `- Projected weekly volume — low ${weeks.low}, mid ${weeks.mid}, high ${weeks.high}` : "",
    monthly ? `- Projected monthly net (margin × volume × 4.33) — low $${monthly.low}, mid $${monthly.mid}, high $${monthly.high}` : "",
    typeof input.paybackWeeks === "number" ? `- Estimated payback: ${input.paybackWeeks} weeks at mid-volume` : "",
    "",
    input.assumptions.length > 0 ? "## Assumptions" : "",
    ...input.assumptions.map((a) => `- ${a}`),
    "",
    input.humanFootwork.length > 0 ? "## Needs from you" : "",
    ...input.humanFootwork.map((h) => `- ${h}`),
    ""
  ]
    .filter((line) => line !== "")
    .join("\n");

  const csvLines: string[] = [];
  csvLines.push("metric,low,mid,high");
  if (weeks) {
    csvLines.push(`weekly_units,${weeks.low},${weeks.mid},${weeks.high}`);
  }
  if (monthly) {
    csvLines.push(`monthly_net_usd,${monthly.low},${monthly.mid},${monthly.high}`);
  }
  csvLines.push(`unit_cost_usd,${input.unitCostUsd ?? ""},${input.unitCostUsd ?? ""},${input.unitCostUsd ?? ""}`);
  csvLines.push(`retail_price_usd,${input.retailPriceUsd ?? ""},${input.retailPriceUsd ?? ""},${input.retailPriceUsd ?? ""}`);
  csvLines.push(`per_unit_margin_usd,${margin || ""},${margin || ""},${margin || ""}`);
  csvLines.push(`estimated_cost_usd,${input.estimatedCostUsd},${input.estimatedCostUsd},${input.estimatedCostUsd}`);
  csvLines.push(`payback_weeks,,${input.paybackWeeks ?? ""},`);
  const roiCsv = csvLines.join("\n");

  return { briefMarkdown, roiCsv };
}
