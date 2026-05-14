import { NextResponse } from "next/server";

// Lightweight health endpoint. Used by Vercel cron + uptime monitors to
// confirm the app is alive. Doesn't hit any downstream services — just
// proves the Next.js runtime is responding.
//
// 200 OK + JSON. No auth. No PII.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "the-operator",
    runtime: "nodejs",
    timestamp: new Date().toISOString(),
    uptime: typeof process.uptime === "function" ? Math.floor(process.uptime()) : null
  });
}
