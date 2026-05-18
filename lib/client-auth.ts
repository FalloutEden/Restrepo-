"use client";

// Tenant-aware fetch wrapper. The shared client helper every operator panel
// uses for API calls, so that:
//
//   - Founder (browser has the x-operator-auth cookie): cookie flows
//     automatically with same-origin fetch; nothing else is added.
//   - Real tenant (browser has a btk_ bearer in localStorage from completed
//     onboarding): we auto-attach `Authorization: Bearer btk_...` so the
//     middleware lets the request through and resolveTenantContext on the
//     server returns the tenant's scope.
//
// Without this layer every panel ships with hand-rolled `fetch("/api/...")`
// calls that work for the founder but 401 for tenants. The onboarding flow
// (app/onboard/page.tsx) stores the bearer under `operator:tenant:<tenantId>`
// in localStorage; this module reads from there.
//
// MULTI-TENANT BROWSERS
//
// Today we assume one tenant per browser session — the operator is a "your
// own store" tool, not a multi-account console. If a localStorage has more
// than one `operator:tenant:*` key, we pick the first one and document the
// gap. When/if multi-account becomes a real use case, replace `readActive
// Tenant()` with an explicit "currently active tenant" pointer.

const TENANT_KEY_PREFIX = "operator:tenant:";

type StoredTenant = {
  bearerToken: string;
  brandSlug: string;
};

function readActiveTenant(): StoredTenant | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(TENANT_KEY_PREFIX)) continue;
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<StoredTenant>;
      if (typeof parsed.bearerToken === "string" && parsed.bearerToken.startsWith("btk_")) {
        return {
          bearerToken: parsed.bearerToken,
          brandSlug: typeof parsed.brandSlug === "string" ? parsed.brandSlug : ""
        };
      }
    }
  } catch {
    // localStorage can throw in private-browsing modes / strict CSP / sandboxed
    // iframes — just fall through to "no tenant bearer."
  }
  return null;
}

/** True iff localStorage has a usable tenant bearer. Use this when a panel
 *  needs to decide between "show founder UI" vs "show tenant UI." */
export function hasTenantBearer(): boolean {
  return readActiveTenant() !== null;
}

/** Same shape as window.fetch but auto-attaches Authorization when a tenant
 *  bearer is present. Existing Authorization headers are NEVER overridden —
 *  callers can still force a specific bearer if they want. */
export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const tenant = readActiveTenant();
  if (!tenant) return fetch(input, init);
  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${tenant.bearerToken}`);
  }
  return fetch(input, { ...init, headers });
}
