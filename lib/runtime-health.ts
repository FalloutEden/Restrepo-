import "server-only";

import type { RuntimeStartupReport } from "@/lib/dataset-models";

export const EXPECTED_AGENT_COUNT = 8;

const DEPENDENCY_CHECKS = [
  {
    envVar: "OPENAI_API_KEY",
    label: "OpenAI",
    severity: "fatal" as const,
    message: "Required for server-side reasoning and orchestration."
  },
  {
    envVar: "FIVERR_API_KEY",
    label: "Fiverr",
    severity: "warning" as const,
    message: "Missing Fiverr integration key. Live Fiverr validation and future outbound steps remain unavailable."
  },
  {
    envVar: "SHOPIFY_API_KEY",
    label: "Shopify",
    severity: "warning" as const,
    message: "Missing Shopify integration key. Live Shopify validation and future outbound steps remain unavailable."
  },
  {
    envVar: "ETSY_API_KEY",
    label: "Etsy",
    severity: "warning" as const,
    message: "Missing Etsy integration key. Live Etsy validation and future outbound steps remain unavailable."
  },
  {
    envVar: "PRINT_ON_DEMAND_API_KEY",
    label: "Print on Demand",
    severity: "warning" as const,
    message: "Missing print-on-demand integration key. Live POD validation and future outbound steps remain unavailable."
  }
];

export function buildRuntimeStartupReport(configuredAgentCount: number): RuntimeStartupReport {
  const checks = DEPENDENCY_CHECKS.map((check) => ({
    ...check,
    present: Boolean(process.env[check.envVar]?.trim())
  }));

  const errors = checks.filter((check) => !check.present && check.severity === "fatal").map((check) => check.message);
  const warnings = checks.filter((check) => !check.present && check.severity === "warning").map((check) => check.message);

  if (configuredAgentCount !== EXPECTED_AGENT_COUNT) {
    errors.push(
      `Agent orchestrator mismatch: expected ${EXPECTED_AGENT_COUNT} enabled agents, found ${configuredAgentCount}.`
    );
  }

  return {
    ready: errors.length === 0,
    fatal: errors.length > 0,
    expectedAgentCount: EXPECTED_AGENT_COUNT,
    configuredAgentCount,
    checks,
    errors,
    warnings
  };
}
