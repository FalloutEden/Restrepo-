import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OpenAI API key" }, { status: 500 });
    }

    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json({ error: "Missing mockup prompt" }, { status: 400 });
    }

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024"
    });

    const imageBase64 = response.data?.[0]?.b64_json;

    if (!imageBase64) {
      return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
    }

    return NextResponse.json({
      imageBase64,
      imageDataUrl: `data:image/png;base64,${imageBase64}`
    });
  } catch (error) {
    console.error("GENERATE IMAGE ERROR:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown image generation error"
      },
      { status: 500 }
    );
  }
}
