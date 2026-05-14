import "server-only";

// Post-hoc validator for operator responses.
//
// Background: 2026-05-14 cold-start pentest caught the operator narrating
// "File exported. Drop it into your Obsidian vault and run `graphify .`"
// inside the same response where both cerebro_query and search_cj_products
// had errored. Full dossier: .openclaw/research/operator-gaps-2026-05-14.md.
//
// This guard is layer 2 of a two-layer defense (layer 1 is the system-prompt
// rules added in lib/operator-agent.ts). When layer 1 fails — model still
// emits an action-completed phrase the tool transcript can't justify — this
// catches it, logs an audit entry, and surfaces the warning to the caller.
//
// We intentionally do NOT rewrite the model's text. Rewriting is risky
// (changes meaning, doubles cost if we re-prompt) and silent (the user
// never sees the original failure). Logging + warning lets us iterate the
// prompt rules until layer-2 catches drop to zero.

export type ToolCallTraceEntry = {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
};

export type HallucinatedClaim = {
  label: string;
  snippet: string;
  reason: "no-tool-exists" | "no-tool-succeeded";
  expectedTools: string[];
  matchedTools: string[];
};

// A "claim pattern" pairs a regex that detects a side-effect claim with the
// list of tools that could legitimately have produced that side effect.
// Empty satisfiedBy = no tool can justify this phrase, so it is always
// hallucination if it appears.
type ClaimPattern = {
  label: string;
  pattern: RegExp;
  satisfiedBy: string[];
};

// Negative-lookbehind helpers — these phrases turn a verb future-tense /
// hypothetical, which is legitimate even without a tool result.
// "I'll save..." | "going to save..." | "if you want, save..." | "can save..."
const FUTURE_OR_HYPOTHETICAL =
  "(?:i\\s*['’]?ll|i\\s+will|i'd|i\\s+would|going\\s+to|gonna|let\\s+me|i\\s+can|we\\s+can|if\\s+you\\s+want|want\\s+me\\s+to|should\\s+i|happy\\s+to|ready\\s+to|able\\s+to|plan\\s+to|propose\\s+to)";

// Compose a pattern that matches a verb in past tense, NOT preceded by a
// future/hypothetical phrase within ~10 words. Past-tense + definitive period
// or sentence boundary is the strong hallucination signal.
function pastTenseClaim(verbRegex: string, contextRegex = ""): RegExp {
  // (?:^|...)  → start or any character (we'll check what's before)
  // The negative lookbehind isn't fully supported in older JS engines for
  // variable-length patterns, so we use a forward filter instead:
  //   - require the verb
  //   - in a post-check, ensure no future/hypothetical phrase appears in
  //     the 60 chars before the match
  // For the pattern itself, just match the verb + optional context.
  const ctx = contextRegex ? `\\s*\\w*\\s*${contextRegex}` : "";
  return new RegExp(`\\b${verbRegex}\\b${ctx}`, "i");
}

const CLAIM_PATTERNS: ClaimPattern[] = [
  // No tool exists for these — always hallucination if claimed past-tense.
  {
    label: "claimed-graphify-trigger",
    pattern: /\b(?:ran|triggered|executed|invoked)\s+graphify\b|\bgraphify\s+update(?:\s+ran|d|\s+done)?\b|\bingested\s+(?:into|to)\s+(?:cerebro|the\s+brain|graphify)\b/i,
    satisfiedBy: [] // operator has no graphify tool
  },
  {
    label: "claimed-deploy",
    pattern: /\b(?:pushed|deployed|shipped|released)\s+(?:to|the)\s+(?:vercel|production|prod|main|github)\b/i,
    satisfiedBy: [] // operator has no deploy tool
  },
  {
    label: "claimed-domain-action",
    pattern: /\b(?:registered|bought|purchased|acquired)\s+(?:the\s+|your\s+|a\s+)?domain\b|\bset\s+up\s+(?:the\s+|your\s+)?dns\b|\bconfigured\s+(?:the\s+|your\s+)?dns\b/i,
    satisfiedBy: [] // human-only
  },
  {
    label: "claimed-payments-kyc",
    pattern: /\b(?:submitted|completed|finished|filed)\s+(?:the\s+|your\s+)?(?:payments?\s+)?kyc\b|\bset\s+up\s+shopify\s+payments\b/i,
    satisfiedBy: [] // human-only
  },
  {
    label: "claimed-file-export",
    pattern: /\bfile\s+(?:exported|written\s+to\s+disk|saved\s+to\s+disk|written\s+out|exported\s+to)\b|\b(?:exported|wrote|created|generated)\s+(?:a\s+|the\s+)?(?:file|markdown|dossier|brief|document|md)\b/i,
    // The operator can produce structured-doc files via these tools.
    // If neither succeeded in this turn, "exported a file" is fabrication.
    satisfiedBy: ["propose_action", "generate_policies", "publish_policies", "create_content_drop", "generate_content_drop_run", "request_human_input"]
  },
  {
    label: "claimed-email-sent",
    pattern: /\b(?:email\s+sent|sent\s+(?:the\s+|an?\s+|you\s+(?:an?\s+|the\s+)?)email|emailed\s+(?:you|the\s+merchant|the\s+founder))\b/i,
    satisfiedBy: [] // operator has no email tool today
  },
  // Tool-backed claims — legitimate IFF the matching tool succeeded.
  {
    label: "claimed-listing-published",
    pattern: /\b(?:published|made\s+live|pushed\s+live|listed)\s+(?:the\s+|a\s+|\d+\s+)?(?:listing|listings|product|products|draft|drafts)\b/i,
    satisfiedBy: ["publish_listing", "attach_all_to_online_store"]
  },
  {
    label: "claimed-listing-deleted",
    pattern: /\b(?:deleted|removed|trashed)\s+(?:the\s+|a\s+|\d+\s+)?(?:listing|listings|draft|drafts|product|products)\b/i,
    satisfiedBy: ["delete_listing"]
  },
  {
    label: "claimed-product-created",
    pattern: /\b(?:created|materialized|built\s+out)\s+(?:a\s+|the\s+|\d+\s+|new\s+)?(?:draft|drafts|product|products|listing|listings)\b/i,
    satisfiedBy: ["materialize_product"]
  },
  {
    label: "claimed-note-saved",
    pattern: /\b(?:saved|recorded|stored)\s+(?:a\s+|the\s+)?(?:note|memory|notes)\b/i,
    satisfiedBy: ["record_note"]
  },
  {
    label: "claimed-proposal-submitted",
    pattern: /\b(?:submitted|filed|created|opened)\s+(?:a\s+|the\s+)?proposal\b/i,
    satisfiedBy: ["propose_action"]
  },
  {
    label: "claimed-webhook-registered",
    pattern: /\b(?:registered|installed|wired\s+up)\s+(?:the\s+|a\s+)?webhook\b/i,
    satisfiedBy: ["bootstrap_store"]
  },
  {
    label: "claimed-policies-published",
    pattern: /\b(?:published|pushed|wrote\s+up)\s+(?:the\s+|your\s+|new\s+)?polic(?:y|ies)\b/i,
    satisfiedBy: ["publish_policies", "generate_policies", "bootstrap_store"]
  }
];

/** Did this tool call succeed? Conservative: anything that looks like an error
 *  in the result shape counts as failure. */
function toolSucceeded(entry: ToolCallTraceEntry): boolean {
  const r = entry.result;
  if (r == null) return false;
  if (typeof r !== "object") return true;
  const rec = r as Record<string, unknown>;
  if ("error" in rec && rec.error) return false;
  if ("ok" in rec && rec.ok === false) return false;
  return true;
}

/** Look backward up to ~60 chars from a match for future/hypothetical phrasing
 *  that would make the claim a non-claim. */
function isFutureOrHypothetical(text: string, matchIndex: number): boolean {
  const lookback = text.slice(Math.max(0, matchIndex - 80), matchIndex);
  return new RegExp(FUTURE_OR_HYPOTHETICAL, "i").test(lookback);
}

/** Walk the final text, flag every side-effect claim that isn't backed by a
 *  successful tool call in this turn. */
export function detectHallucinatedClaims(
  finalText: string,
  toolCallTrace: ToolCallTraceEntry[]
): HallucinatedClaim[] {
  if (!finalText || finalText.trim().length === 0) return [];

  const successfulToolNames = new Set(toolCallTrace.filter(toolSucceeded).map((t) => t.name));
  const out: HallucinatedClaim[] = [];

  for (const claim of CLAIM_PATTERNS) {
    // Use a global regex clone so we can iterate every match in the text.
    const re = new RegExp(claim.pattern.source, claim.pattern.flags.includes("g") ? claim.pattern.flags : claim.pattern.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(finalText)) !== null) {
      const snippet = m[0];
      if (isFutureOrHypothetical(finalText, m.index)) continue;

      const matched = claim.satisfiedBy.filter((name) => successfulToolNames.has(name));
      const justified = matched.length > 0;

      if (!justified) {
        out.push({
          label: claim.label,
          snippet,
          reason: claim.satisfiedBy.length === 0 ? "no-tool-exists" : "no-tool-succeeded",
          expectedTools: claim.satisfiedBy,
          matchedTools: matched
        });
      }
      // Prevent infinite loop on zero-width matches
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }

  return out;
}

/** Format a human-readable summary suitable for an audit detail field or
 *  log line. Keeps each claim to one line so a 5-claim turn fits in a
 *  reasonable JSONL row. */
export function summarizeHallucination(claims: HallucinatedClaim[]): string {
  return claims
    .map(
      (c) =>
        `[${c.label}] "${c.snippet.slice(0, 80)}" — ${c.reason}${
          c.expectedTools.length > 0 ? ` (needed any of: ${c.expectedTools.join(", ")})` : ""
        }`
    )
    .join("\n");
}
