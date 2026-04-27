import "server-only";

import { openai, IMAGE_MODEL } from "@/lib/openai";

/**
 * Generate a product image using OpenAI gpt-image-1.
 * Returns a Buffer containing the PNG image data.
 */
export async function generateProductImage(prompt: string): Promise<{ buffer: Buffer; imageBase64: string }> {
  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt: prompt.slice(0, 4000), // gpt-image-1 prompt limit
    n: 1,
    size: "1024x1024",
    response_format: "b64_json"
  });

  const b64 = response.data?.[0]?.b64_json;

  if (!b64) {
    throw new Error("OpenAI image generation returned no data.");
  }

  const buffer = Buffer.from(b64, "base64");
  return { buffer, imageBase64: b64 };
}
