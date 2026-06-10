import "server-only";

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";
import type { GeneratedPolicy, ShopifyPolicyType } from "@/lib/policies-generator";
import type { TenantContext } from "@/lib/tenant-context";

// Push generated policies into Shopify's built-in policy slots via the
// shopPolicyUpdate GraphQL mutation. The policies appear in the storefront
// at /policies/<type>/ and at checkout. Re-running this mutation overwrites
// the existing body in place — there is no separate "publish" step.

const SHOP_POLICY_UPDATE = /* GraphQL */ `
  mutation shopPolicyUpdate($shopPolicy: ShopPolicyInput!) {
    shopPolicyUpdate(shopPolicy: $shopPolicy) {
      shopPolicy {
        id
        type
        title
        body
        url
      }
      userErrors {
        field
        message
      }
    }
  }
`;

type ShopPolicyUpdateResponse = {
  shopPolicyUpdate: {
    shopPolicy: {
      id: string;
      type: ShopifyPolicyType;
      title: string;
      body: string;
      url?: string;
    } | null;
    userErrors: Array<{ field?: string[]; message: string }>;
  };
};

async function shopifyGraphQL<T>(
  creds: ShopifyCredentials,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch(
    `https://${creds.storeDomain}/admin/api/${creds.apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": creds.token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query, variables })
    }
  );

  const rawBody = await response.text();
  const parsed: { data?: T; errors?: unknown } = rawBody ? JSON.parse(rawBody) : {};

  if (!response.ok || parsed.errors) {
    const message =
      parsed.errors && typeof parsed.errors === "object"
        ? JSON.stringify(parsed.errors)
        : rawBody;
    throw new Error(`Shopify GraphQL request failed (${response.status}): ${message}`);
  }

  return parsed.data as T;
}

export type PolicyPushResult = {
  brandSlug: string;
  type: ShopifyPolicyType;
  ok: boolean;
  url?: string;
  error?: string;
};

export async function pushPolicy(
  brandSlug: string,
  policy: GeneratedPolicy,
  tenantCtx?: TenantContext
): Promise<PolicyPushResult> {
  const creds = resolveShopifyCredentials(brandSlug, tenantCtx);
  try {
    const data = await shopifyGraphQL<ShopPolicyUpdateResponse>(creds, SHOP_POLICY_UPDATE, {
      shopPolicy: { type: policy.type, body: policy.body }
    });
    const userError = data.shopPolicyUpdate.userErrors[0];
    if (userError) {
      return {
        brandSlug,
        type: policy.type,
        ok: false,
        error: userError.message
      };
    }
    return {
      brandSlug,
      type: policy.type,
      ok: true,
      url: data.shopPolicyUpdate.shopPolicy?.url
    };
  } catch (error) {
    return {
      brandSlug,
      type: policy.type,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown Shopify error"
    };
  }
}

export async function pushAllPolicies(
  brandSlug: string,
  policies: GeneratedPolicy[],
  tenantCtx?: TenantContext
): Promise<PolicyPushResult[]> {
  const results: PolicyPushResult[] = [];
  // Sequential, not parallel: Shopify GraphQL has tight rate limits and
  // five sequential calls take ~3s total — not worth the complexity of
  // parallel + backoff.
  for (const policy of policies) {
    results.push(await pushPolicy(brandSlug, policy, tenantCtx));
  }
  return results;
}
