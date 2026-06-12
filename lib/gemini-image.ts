import "server-only";

import { getActiveSpendKind, priceGoogleImage, recordSpend } from "@/lib/spend-tracker";
import { FOUNDER_TENANT_ID, type TenantContext } from "@/lib/tenant-context";

// Google "Nano Banana 2" image generation via the Gemini API.
//
// Model: gemini-3.1-flash-image (Nano Banana 2). Notably strong at precise text
// rendering — the weakness that made gpt-image-1 unsafe for catalog art — so
// it's offered as a first-class image option alongside OpenAI and merchant
// upload. Tenant-aware: a merchant's own Gemini key comes from the vault (no
// env fallback); the founder falls back to GEMINI_API_KEY / GOOGLE_API_KEY.
//
// REST shape per https://ai.google.dev/gemini-api/docs/image-generation :
//   POST .../v1/models/gemini-3.1-flash-image:generateContent
//   header x-goog-api-key: <key>
//   body { contents:[{parts:[{text}]}], generationConfig:{responseModalities:["TEXT","IMAGE"]} }
//   image bytes at candidates[0].content.parts[].inlineData.data (base64 PNG)

const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
// Image-generation models live on the v1beta endpoint (verified 2026-06-11:
// v1 404s for this model, v1beta returns the image).
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

function resolveGeminiKey(tenantCtx?: TenantContext): string {
  if (tenantCtx && !tenantCtx.isFounder) return tenantCtx.requireSecret("googleApiKey");
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!key) throw new Error("Missing GEMINI_API_KEY (or GOOGLE_API_KEY) in environment.");
  return key;
}

export async function generateGeminiImage(
  prompt: string,
  options: { transparent?: boolean } = {},
  tenantCtx?: TenantContext
): Promise<{ buffer: Buffer; imageBase64: string }> {
  const key = resolveGeminiKey(tenantCtx);
  // Gemini has no explicit transparent-background flag; request it in-prompt.
  const fullPrompt = options.transparent
    ? `${prompt}\n\nRender the subject on a fully transparent background (alpha channel), with no backdrop, scene, or shadow.`
    : prompt;

  const res = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt.slice(0, 4000) }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini image generation failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    }>;
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const b64 = parts.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) {
    throw new Error("Gemini returned no image data.");
  }

  void recordSpend({
    provider: "google",
    kind: getActiveSpendKind(),
    model: GEMINI_IMAGE_MODEL,
    imageCount: 1,
    costUsd: priceGoogleImage(1),
    tenantId: tenantCtx?.tenantId ?? FOUNDER_TENANT_ID
  }).catch(() => undefined);

  return { buffer: Buffer.from(b64, "base64"), imageBase64: b64 };
}
