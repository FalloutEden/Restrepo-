import "server-only";

import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
}

export const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Model to use for all agent calls. Override via CLAUDE_MODEL env var if your
// account doesn't have access to the default (Anthropic returns 400 invalid model
// id when an alias isn't enabled for the account/plan).
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL?.trim() || "claude-opus-4-1";
