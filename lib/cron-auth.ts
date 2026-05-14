import "server-only";

import type { NextRequest } from "next/server";

// Cron endpoint authentication.
//
// Vercel cron sends requests with `Authorization: Bearer <CRON_SECRET>`.
// We verify it matches our env var before doing any work. Without this,
// anyone who guesses /api/cron/* URLs could trigger our crons.
//
// On Vercel: CRON_SECRET env var is required.
// On local dev: optional — falls open so developers can hit the endpoints
// from their browser for testing without setup.
//
// Setup: in Vercel dashboard → Settings → Environment Variables:
//   CRON_SECRET=<openssl rand -hex 32>
// Vercel auto-injects this into cron requests; you don't need to set it
// anywhere else.

export function isAuthorizedCron(req: Request | NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const onVercel = Boolean(process.env.VERCEL);

  // Local dev — no auth required, lets you curl the endpoint
  if (!expected && !onVercel) return true;

  // Production without CRON_SECRET set — block to prevent abuse
  if (!expected) return false;

  const header = req.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice("bearer ".length).trim()
    : "";

  // Also accept x-vercel-cron header (older Vercel cron format)
  const vercelCronHeader = req.headers.get("x-vercel-cron");
  if (vercelCronHeader) return true;

  return bearer === expected;
}
