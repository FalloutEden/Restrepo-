import "server-only";

import type { RuntimeStartupReport } from "@/lib/dataset-models";

export const EXPECTED_AGENT_COUNT = 8;

const DEPENDENCY_CHECKS = [
  {
    envVar: "ANTHROPIC_API_KEY",
    label: "Anthropic (Claude)",
    severity: "fatal" as const,
    message: "Missing ANTHROPIC_API_KEY. Required to run any agent — every step uses Claude."
  },
  {
    envVar: "OPENAI_API_KEY",
    label: "OpenAI (image generation)",
    severity: "fatal" as const,
    message: "Missing OPENAI_API_KEY. Required for product image generation."
  },
  {
    envVar: "SHOPIFY_API_KEY",
    label: "Shopify",
    severity: "fatal" as const,
    message: "Missing SHOPIFY_API_KEY. Required to create draft products in your store."
  },
  {
    envVar: "PRINTFUL_API_KEY",
    label: "Printful",
    severity: "warning" as const,
    message: "Missing PRINTFUL_API_KEY. Print-on-demand fulfillment will be unavailable."
  },
  {
    envVar: "ZENDROP_API_KEY",
    label: "Zendrop",
    severity: "warning" as const,
    message: "Missing ZENDROP_API_KEY. Dropshipping fulfillment will be unavailable."
  }
];

export function buildRuntimeStartupReport(configuredAgentCount: number): RuntimeStartupReport {
  const checks = DEPENDENCY_CHECKS.map((check) => ({
    ...check,
    present: Boolean(process.env[check.envVar]?.trim())
  }));

  const errors = checks.filter((check) => !check.present && check.severity === "fatal").map((check) => check.message);
  const warnings = checks.filter((check) => !check.present && check.severity === "warning").map((check) => check.message);

  // At least one fulfillment source must be configured for autonomous runs to produce anything sellable.
  const printfulPresent = checks.find((c) => c.envVar === "PRINTFUL_API_KEY")?.present;
  const zendropPresent = checks.find((c) => c.envVar === "ZENDROP_API_KEY")?.present;
  if (!printfulPresent && !zendropPresent) {
    errors.push("No fulfillment source configured. Set PRINTFUL_API_KEY or ZENDROP_API_KEY (or both) to run.");
  }

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
