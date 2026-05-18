import { NextResponse } from "next/server";

import { getLaunchStatus, getLaunchStatusForAllBrands, getTenantLaunchStatus } from "@/lib/launch-status";
import { BRANDS } from "@/lib/brands";
import { resolveTenantContext } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two audiences:
//   - FOUNDER (admin cookie/bearer or local dev): all brands by default, or a
//     specific brand via ?brand=<slug>. Includes deployment-infrastructure
//     checks (env vars, operator-auth-secret, Printful auto-confirm).
//   - TENANT (btk_ bearer): exactly one report — their own store. Only the
//     4 store-level checks; deployment checks skipped.
// Anonymous callers get founder mode (back-compat). When/if /launch ever
// needs to be hardened against drive-by readers, gate this behind an auth
// check at the API edge. For now it's read-only and the cron health-check
// already shape-tests these endpoints.

export async function GET(request: Request) {
  const ctx = await resolveTenantContext(request);

  if (!ctx.isFounder) {
    const report = await getTenantLaunchStatus(ctx);
    return NextResponse.json({ viewerKind: "tenant", report });
  }

  // Founder path — current behavior preserved.
  const url = new URL(request.url);
  const brand = url.searchParams.get("brand")?.trim();

  if (brand) {
    if (!(brand in BRANDS)) {
      return NextResponse.json({ error: `Unknown brand: ${brand}` }, { status: 400 });
    }
    const report = await getLaunchStatus(brand);
    return NextResponse.json({ viewerKind: "admin", report });
  }

  const reports = await getLaunchStatusForAllBrands();
  return NextResponse.json({ viewerKind: "admin", reports });
}
