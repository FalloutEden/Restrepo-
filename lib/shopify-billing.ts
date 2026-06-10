import "server-only";

// Shopify Billing — a recurring app subscription with a free trial, via the
// Admin GraphQL appSubscriptionCreate mutation. The merchant approves a single
// $20/mo plan; Shopify bills it on their existing Shopify invoice and (under
// the dev's first $1M lifetime) takes 0% rev share.
//
// IMPORTANT: test mode. appSubscriptionCreate(test:true) creates a non-charging
// subscription for development/dev-stores. We default to test mode everywhere
// EXCEPT genuine Vercel production, so local/dev installs never trigger a real
// charge. Override with SHOPIFY_BILLING_TEST=1 to force test mode in prod too.

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2024-04";
const PRICE_USD = Number(process.env.SHOPIFY_APP_PRICE_USD || "20");
const TRIAL_DAYS = Number(process.env.SHOPIFY_APP_TRIAL_DAYS || "14");
const PLAN_NAME = process.env.SHOPIFY_APP_PLAN_NAME || "The Operator — Monthly";

export function billingConfig() {
  return { priceUsd: PRICE_USD, trialDays: TRIAL_DAYS, planName: PLAN_NAME };
}

/** Real charges only in genuine Vercel production. Everywhere else (local dev,
 *  preview, or SHOPIFY_BILLING_TEST=1) uses Shopify's non-charging test mode. */
export function billingTestMode(): boolean {
  if (process.env.SHOPIFY_BILLING_TEST === "1") return true;
  return !(process.env.VERCEL === "1" && process.env.NODE_ENV === "production");
}

async function billingGraphQL<T>(
  shop: string,
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const r = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  const text = await r.text();
  const parsed: { data?: T; errors?: unknown } = text ? JSON.parse(text) : {};
  if (!r.ok || parsed.errors) {
    throw new Error(`Shopify billing GraphQL ${r.status}: ${text.slice(0, 200)}`);
  }
  return parsed.data as T;
}

export type SubscriptionStatus =
  | "ACTIVE"
  | "FROZEN"
  | "PENDING"
  | "CANCELLED"
  | "DECLINED"
  | "EXPIRED"
  | "none";

/** Current app subscription status for the shop (ACTIVE covers the trial too). */
export async function getActiveSubscription(
  shop: string,
  token: string
): Promise<{ status: SubscriptionStatus; id?: string }> {
  const data = await billingGraphQL<{
    currentAppInstallation?: { activeSubscriptions?: Array<{ id: string; status: SubscriptionStatus }> };
  }>(shop, token, `query { currentAppInstallation { activeSubscriptions { id status } } }`, {});
  const sub = data?.currentAppInstallation?.activeSubscriptions?.[0];
  return sub ? { status: sub.status, id: sub.id } : { status: "none" };
}

const CREATE_MUTATION = /* GraphQL */ `
  mutation appSubscriptionCreate(
    $name: String!, $returnUrl: URL!, $trialDays: Int, $test: Boolean,
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, trialDays: $trialDays, test: $test, lineItems: $lineItems) {
      appSubscription { id status }
      confirmationUrl
      userErrors { field message }
    }
  }
`;

/** Create the recurring subscription and return the URL the merchant must visit
 *  to approve it. */
export async function createAppSubscription(
  shop: string,
  token: string,
  returnUrl: string
): Promise<string> {
  const data = await billingGraphQL<{
    appSubscriptionCreate: {
      confirmationUrl?: string;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(shop, token, CREATE_MUTATION, {
    name: PLAN_NAME,
    returnUrl,
    trialDays: TRIAL_DAYS,
    test: billingTestMode(),
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: PRICE_USD, currencyCode: "USD" },
            interval: "EVERY_30_DAYS"
          }
        }
      }
    ]
  });
  const res = data.appSubscriptionCreate;
  const err = res.userErrors?.[0];
  if (err) throw new Error(`appSubscriptionCreate: ${err.message}`);
  if (!res.confirmationUrl) throw new Error("appSubscriptionCreate returned no confirmationUrl");
  return res.confirmationUrl;
}
