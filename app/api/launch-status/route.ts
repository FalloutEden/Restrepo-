import { NextResponse } from "next/server";

import { getLaunchStatus, getLaunchStatusForAllBrands } from "@/lib/launch-status";
import { BRANDS } from "@/lib/brands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only readiness check the merchant can hit to see what's blocking launch.
// Same checks the operator runs via the get_launch_status tool.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const brand = url.searchParams.get("brand")?.trim();

  if (brand) {
    if (!(brand in BRANDS)) {
      return NextResponse.json({ error: `Unknown brand: ${brand}` }, { status: 400 });
    }
    const report = await getLaunchStatus(brand);
    return NextResponse.json(report);
  }

  const reports = await getLaunchStatusForAllBrands();
  return NextResponse.json({ reports });
}
