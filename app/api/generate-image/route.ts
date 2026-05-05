import { NextResponse } from "next/server";
import { openai, IMAGE_MODEL } from "@/lib/openai";

export const runtime = "nodejs";

type GenerateImageRequest = {
  prompt: string;
  size?: "1024x1024" | "1024x1792" | "1792x1024";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateImageRequest;
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const response = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      size: body.size ?? "1024x1024"
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "No image returned from OpenAI." }, { status: 502 });
    }

    return NextResponse.json({ imageBase64: b64 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
