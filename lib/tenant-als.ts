import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { FOUNDER_TENANT_ID } from "@/lib/tenant-context";

// Request-scoped tenant identity. Lets storage modules (and the AI pipelines
// they fan out to) read "which tenant is this work for?" without threading
// the id through every function signature.
//
// HOW IT WORKS
//
// 1. API route resolves the tenant context from the incoming request, then
//    wraps the rest of its handler in `runWithTenant(tenantId, async () => …)`.
// 2. Any code inside that callback — including code awaited several layers
//    deep — calls `getCurrentTenantId()` to read the active tenant id.
// 3. Multiple concurrent requests stay isolated; AsyncLocalStorage is
//    per-async-context, not a global.
//
// FALLBACK SEMANTICS
//
// If a code path reads the current tenant id WITHOUT ever being wrapped,
// `getCurrentTenantId()` returns FOUNDER_TENANT_ID. That preserves legacy
// founder-CLI scripts (smoke tests, dev scripts) which run outside a Next.js
// request context. It also means a forgotten wrap in an API route silently
// writes/reads founder paths — a soft-fail rather than a hard error.
//
// To make missing wraps loud during development, the API route shape we
// document is:
//
//   export async function GET(req: Request) {
//     const ctx = await resolveTenantContext(req);
//     return runWithTenant(ctx.tenantId, async () => {
//       // …read/write content-studio storage here, no tenantId arg needed
//     });
//   }
//
// If you skip the runWithTenant wrap, the route will quietly serve founder
// data to whoever called it. Don't do that on a tenant-exposed endpoint.

const tenantStore = new AsyncLocalStorage<string>();

export function runWithTenant<T>(tenantId: string, fn: () => Promise<T> | T): Promise<T> {
  return Promise.resolve(tenantStore.run(tenantId, fn));
}

export function getCurrentTenantId(): string {
  return tenantStore.getStore() ?? FOUNDER_TENANT_ID;
}
