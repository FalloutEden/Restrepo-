import "server-only";

import { openai, IMAGE_MODEL } from "@/lib/openai";

/**
 * Generate a product image using OpenAI gpt-image-1.
 * Returns a Buffer containing the PNG image data.
 *
 * Pass `transparent: true` for print-on-demand artwork — Printful prints whatever
 * is in the PNG including any background, so apparel designs need a transparent
 * canvas so the shirt color shows through.
 */
export async function generateProductImage(
  prompt: string,
  options: { transparent?: boolean } = {}
): Promise<{ buffer: Buffer; imageBase64: string }> {
  // gpt-image-1 always returns base64 — passing response_format is rejected with 400.
  const response = await openai.images.generate({
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
