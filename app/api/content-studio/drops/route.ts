import { NextResponse } from "next/server";

import { createDrop, listDrops } from "@/lib/content-studio/storage";
import { BRANDS } from "@/lib/brands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const drops = await listDrops();
  return NextResponse.json({
    count: drops.length,
    drops: drops.map((d) => ({
      id: d.id,
      productTitle: d.productTitle,
      brand: d.brandSlug,
      productId: d.productId,
      status: d.status,
      assetCount: d.assets.length,
      sourcePhotoCount: d.assets.filter((a) => a.kind === "source_photo").length,
      lifestyleImageCount: d.assets.filter((a) => a.kind === "lifestyle_image").length,
      videoCount: d.assets.filter((a) => a.kind === "video").length,
      postCount: d.posts.length,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt
    }))
  });
}

export async function POST(request: Request) {
  let body: { productTitle?: string; brand?: string; productId?: number; productHandle?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.productTitle?.trim()) {
    return NextResponse.json({ error: "Missing productTitle" }, { status: 400 });
  }
  if (!body.brand || !(body.brand in BRANDS)) {
    return NextResponse.json({ error: "Invalid brand" }, { status: 400 });
  }
  const drop = await createDrop({
    productTitle: body.productTitle.trim(),
    brandSlug: body.brand,
    productId: body.productId,
    productHandle: body.productHandle
  });
  return NextResponse.json({ drop });
}
