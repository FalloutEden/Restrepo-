import "server-only";

import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY environment variable.");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Model used exclusively for image generation
export const IMAGE_MODEL = "gpt-image-1";
