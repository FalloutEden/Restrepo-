import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { claude } from "@/lib/claude";
import type { Brand } from "@/lib/brands";

// Smaller/faster model for product copy. Override via env if needed.
const COPY_MODEL = process.env.COPYWRITING_MODEL?.trim() || "claude-haiku-4-5";

export type DescriptionRewriteInput = {
  brand: Brand;
  rawTitle: string;
  rawDescription: string;
  category?: string;
};

export type DescriptionRewriteResult = {
  bodyHtml: string;
  // What model decided the listing's "promotional" title should be — sometimes
  // CJ titles are 80 chars of comma-soup. Caller can choose to apply or ignore.
  promotionalTitle: string;
};

// Strip anything Claude might wrap the response in — code fences, JSON envelope
// blurbs, "Here's the description:" preambles. We want pure HTML.
function unwrapModelResponse(raw: string): string {
  let text = raw.trim();
  // Strip ```html ... ``` fences
  text = text.replace(/^```(?:html|HTML)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  // Strip leading "Here is..." / "Here's..." preambles up to the first <p> or <ul>
  const firstTag = text.search(/<(p|ul|h\d|div)\b/i);
  if (firstTag > 0 && firstTag < 200) {
    text = text.slice(firstTag);
  }
  return text.trim();
}

// Defense in depth: even though Claude won't generate <script>, strip any
// active-content tags that could end up in body_html.
function sanitizeForShopifyBody(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

export async function rewriteProductDescription(
  input: DescriptionRewriteInput
): Promise<DescriptionRewriteResult> {
  const { brand, rawTitle, rawDescription, category } = input;

  const prompt = `You are writing product page copy for ${brand.name} — ${brand.tagline}.

Brand voice: ${brand.voice}
Target audience: ${brand.audience}

Below is a raw supplier-provided product spec sheet. Rewrite it as clean, customer-facing copy that fits ${brand.name}'s voice. The buyer should never feel like they're reading a translated overseas listing.

OUTPUT FORMAT (strict — return ONLY this, nothing else):
Line 1: A promotional title for the listing — short, scannable, customer-friendly. NO model numbers, NO comma-soup. 6–10 words. Wrap in <h3>...</h3>.
Line 2 onward: A clean HTML body that opens with ONE benefit-driven paragraph in <p>...</p> (2–3 sentences, lead with what the product does for the buyer, not specs), then a <ul> with 4–7 <li> bullets covering the most useful concrete features. Keep specific numbers (resolution, battery mAh, range, IP rating, storage size) — those build trust. Drop generic bullets ("high quality", "premium", "fashionable").

RULES:
- Use natural US English. No translated phrasing. No "kindly", "please be noted", "the said".
- Never mention: supplier, factory, OEM, China, AliExpress, dropship, MOQ, wholesale, source price, or any URL.
- No emojis. No marketing exclamation points. No "Now only $X!" pricing call-outs.
- Don't fabricate features that aren't in the spec sheet. If the sheet says "1080P", don't claim "4K".
- Don't open with "Welcome to..." or "Introducing..." — just lead with the benefit.

PRODUCT TITLE: ${rawTitle}
CATEGORY: ${category ?? "Unknown"}
RAW SPEC SHEET:
${rawDescription}`;

  const response = await claude.messages.create({
    model: COPY_MODEL,
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }]
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const cleaned = sanitizeForShopifyBody(unwrapModelResponse(text));

  // Pull the <h3> as the promotional title; the rest is the body.
  const titleMatch = cleaned.match(/<h3>([\s\S]*?)<\/h3>/i);
  const promotionalTitle = titleMatch?.[1].replace(/<[^>]+>/g, "").trim() ?? rawTitle;
  const bodyHtml = cleaned.replace(/<h3>[\s\S]*?<\/h3>\s*/i, "").trim();

  return { bodyHtml, promotionalTitle };
}
