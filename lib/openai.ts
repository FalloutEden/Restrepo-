import "server-only";

import OpenAI from "openai";

import { getActiveSpendKind, priceOpenAIImage, recordSpend } from "@/lib/spend-tracker";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY environment variable.");
}

const _openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Wrap images.generate and images.edit to record per-image spend. Default
// quality assumed "standard" since the codebase doesn't request HD; update
// the rate lookup in spend-tracker.ts if we move to medium/high tiers.
const _origGenerate = _openai.images.generate.bind(_openai.images);
const _origEdit = _openai.images.edit.bind(_openai.images);

_openai.images.generate = (async (...args: Parameters<typeof _origGenerate>) => {
  const capturedKind = getActiveSpendKind();
  const result = (await _origGenerate(...args)) as unknown;
  const r = result as { data?: Array<unknown> };
  const count = Array.isArray(r?.data) ? r.data.length : 1;
  void recordSpend({
    provider: "openai",
    kind: capturedKind,
    model: "gpt-image-1",
    imageCount: count,
    imageQuality: "standard",
    costUsd: priceOpenAIImage("standard", count)
  }).catch(() => undefined);
  return result;
}) as typeof _origGenerate;

_openai.images.edit = (async (...args: Parameters<typeof _origEdit>) => {
  const capturedKind = getActiveSpendKind();
  const result = (await _origEdit(...args)) as unknown;
  const r = result as { data?: Array<unknown> };
  const count = Array.isArray(r?.data) ? r.data.length : 1;
  void recordSpend({
    provider: "openai",
    kind: capturedKind,
    model: "gpt-image-1:edit",
    imageCount: count,
    imageQuality: "standard",
    costUsd: priceOpenAIImage("standard", count)
  }).catch(() => undefined);
  return result;
}) as typeof _origEdit;

export const openai = _openai;

// Model used exclusively for image generation
export const IMAGE_MODEL = "gpt-image-1";
