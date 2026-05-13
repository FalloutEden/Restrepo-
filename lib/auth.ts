import "server-only";

import type { NextRequest } from "next/server";
import { getTenantByBearer, isTenantActive, type Tenant } from "@/lib/tenancy";

// Auth resolution for route handlers. Middleware already format-gates the
// Authorization header; this helper does the real lookup (file or Postgres,
// per tenancy.ts) and returns a structured AuthContext.

export type AuthContext =
  | { kind: "admin" }
  | { kind: "tenant"; tenant: Tenant }
  | { kind: "anonymous" };

export function getBearerFromRequest(req: Request | NextRequest): string {
  const header = req.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ")
    ? header.slice("bearer ".length).trim()
    : "";
}

export async function resolveAuth(req: Request | NextRequest): Promise<AuthContext> {
  const expected = process.env.OPERATOR_AUTH_SECRET?.trim();
  const bearer = getBearerFromRequest(req);

  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieAdmin = expected && cookieHeader.includes(`x-operator-auth=${expected}`);

  if (expected && (bearer === expected || cookieAdmin)) {
    return { kind: "admin" };
  }

  if (bearer.startsWith("btk_")) {
    const tenant = await getTenantByBearer(bearer);
    if (tenant) return { kind: "tenant", tenant };
    return { kind: "anonymous" };
  }

  if (!expected) return { kind: "admin" };

  return { kind: "anonymous" };
}

export async function requireTenant(req: Request | NextRequest): Promise<Tenant> {
  const ctx = await resolveAuth(req);
  if (ctx.kind === "tenant") return ctx.tenant;
  if (ctx.kind === "admin") {
    throw new Error(
      "Admin caller invoked a tenant-scoped route — pass ?tenant=<id> or use a btk_ token."
    );
  }
  throw new Error("Unauthorized — tenant bearer required.");
}

export async function requireActiveTenant(req: Request | NextRequest): Promise<Tenant> {
  const tenant = await requireTenant(req);
  if (!isTenantActive(tenant)) {
    throw new Error(
      `Tenant ${tenant.id} is not active (status=${tenant.subscriptionStatus}, operatorEnabled=${tenant.config.operatorEnabled}).`
    );
  }
  return tenant;
}

export async function requireAdmin(req: Request | NextRequest): Promise<void> {
  const ctx = await resolveAuth(req);
  if (ctx.kind !== "admin") {
    throw new Error("Unauthorized — admin bearer required.");
  }
}
