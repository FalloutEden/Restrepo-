import "server-only";

// Simple in-memory rate limiter. Good enough for early-stage Project Elsa
// where we don't have horizontal scale. When we deploy to Vercel with
// multiple regions, each region gets its own limiter — that's fine; the
// goal is to make abuse non-trivial, not absolute.
//
// Strategy: sliding window. Each (key, window) gets a circular buffer
// of recent timestamps. New request checks count within window.
//
// For Vercel functions, modules are cached across warm invocations within
// the same instance — good enough. Cold starts reset, which is fine for
// rate-limiting purposes (abusers don't get reset on demand).

type Window = {
  windowMs: number;
  max: number;
  hits: Map<string, number[]>;
};

const windows = new Map<string, Window>();

function getWindow(name: string, windowMs: number, max: number): Window {
  let w = windows.get(name);
  if (!w) {
    w = { windowMs, max, hits: new Map() };
    windows.set(name, w);
  }
  return w;
}

export function rateLimitCheck(
  bucketName: string,
  key: string,
  opts: { windowMs: number; max: number }
): { allowed: boolean; remaining: number; resetMs: number } {
  const w = getWindow(bucketName, opts.windowMs, opts.max);
  const now = Date.now();
  const cutoff = now - w.windowMs;
  const arr = (w.hits.get(key) ?? []).filter((t) => t > cutoff);
  if (arr.length >= w.max) {
    const oldest = arr[0];
    return { allowed: false, remaining: 0, resetMs: oldest + w.windowMs - now };
  }
  arr.push(now);
  w.hits.set(key, arr);
  // Best-effort GC — prevent the map growing unbounded
  if (w.hits.size > 10_000) {
    for (const [k, ts] of w.hits) {
      if (ts.length === 0 || ts[ts.length - 1] < cutoff) w.hits.delete(k);
    }
  }
  return { allowed: true, remaining: w.max - arr.length, resetMs: 0 };
}

/**
 * Extract a stable client identifier from the request. In order:
 *   1. X-Forwarded-For (first IP) — what Vercel sends
 *   2. CF-Connecting-IP — Cloudflare style
 *   3. "unknown" — last resort
 */
export function clientIdFromRequest(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  return "unknown";
}
