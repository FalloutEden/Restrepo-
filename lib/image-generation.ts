import "server-only";

import { resolveOpenAIClient, IMAGE_MODEL } from "@/lib/openai";
import { generateGeminiImage } from "@/lib/gemini-image";
import type { TenantContext } from "@/lib/tenant-context";

/** Which image generator to use. The operator offers the merchant the choice —
 *  we don't limit them to one. "openai" = gpt-image-1, "google" = Nano Banana 2
 *  (gemini-3.1-flash-image), which renders text far more reliably. */
export type ImageProvider = "openai" | "google";

export type GenerateImageOptions = {
  transparent?: boolean;
  /** Defaults to "openai" to preserve existing founder/BV behavior. */
  provider?: ImageProvider;
};

/**
 * Generate a product image with the chosen provider.
 * Returns a Buffer containing the PNG image data.
 *
 * Pass `transparent: true` for print-on-demand artwork — Printful prints whatever
 * is in the PNG, so apparel designs need a transparent canvas.
 *
 * Tenant-aware: pass tenantCtx so the call bills the merchant's own key for the
 * chosen provider. AI generators can still mangle fine detail/text — callers
 * should surface a "review before publishing" warning to the merchant.
 */
export async function generateProductImage(
  prompt: string,
  options: GenerateImageOptions = {},
  tenantCtx?: TenantContext
): Promise<{ buffer: Buffer; imageBase64: string }> {
  if (options.provider === "google") {
    return generateGeminiImage(prompt, { transparent: options.transparent }, tenantCtx);
  }

  // Default: OpenAI gpt-image-1. Always returns base64 — passing response_format is rejected with 400.
  const response = await resolveOpenAIClient(tenantCtx).images.generate({
    model: IMAGE_MODEL,
    prompt: prompt.slice(0, 4000),
    n: 1,
    size: "1024x1024",
    ...(options.transparent ? { background: "transparent", output_format: "png" } : {})
  });

  const b64 = response.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error("OpenAI image generation returned no data.");
  }

  const buffer = Buffer.from(b64, "base64");
  return { buffer, imageBase64: b64 };
}
