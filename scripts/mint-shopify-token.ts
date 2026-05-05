// Mint a Shopify Admin API access token (shpat_...) via OAuth exchange.
// Use this when your app lives in Shopify Partner Dashboard and you only
// have client_id + client_secret — the modern path that replaced the
// "Develop apps in store admin" flow that's been deprecated.
//
// Run with:
//   node --env-file=.env.local --import tsx scripts/mint-shopify-token.ts
//
// Required env vars:
//   SHOPIFY_OAUTH_SHOP      — e.g. blackvaultapparel.myshopify.com (the store, not the partner account)
//   SHOPIFY_OAUTH_CLIENT_ID     — "API key" from your Partner Dashboard app's API credentials
//   SHOPIFY_OAUTH_CLIENT_SECRET — "API secret" from same place
//
// Before running:
//   1. In Partner Dashboard → your app → Configuration → URLs, add this to
//      "Allowed redirection URLs" (verbatim, including the port):
//          http://localhost:53682/auth/callback
//   2. Save.
//
// Then run this script. It opens your browser to the Shopify install page,
// you click "Install app" / approve, and the access token is printed back
// to this terminal.

import http from "node:http";
import { exec } from "node:child_process";
import { URL } from "node:url";

const SHOP = process.env.SHOPIFY_OAUTH_SHOP?.trim();
const CLIENT_ID = process.env.SHOPIFY_OAUTH_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.SHOPIFY_OAUTH_CLIENT_SECRET?.trim();

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing env vars. Set SHOPIFY_OAUTH_SHOP, SHOPIFY_OAUTH_CLIENT_ID, SHOPIFY_OAUTH_CLIENT_SECRET in .env.local first.");
  process.exit(1);
}

const SCOPES =
  "read_products,write_products,read_files,write_files,read_orders,read_themes,write_themes,read_content,write_content";
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;
const STATE = Math.random().toString(36).slice(2) + Date.now().toString(36);

const authUrl =
  `https://${SHOP}/admin/oauth/authorize?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&state=${STATE}`;

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/auth/callback") {
    res.writeHead(404).end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    res.writeHead(400, { "Content-Type": "text/html" }).end(`<h1>OAuth error</h1><pre>${errorParam}</pre>`);
    console.error("\nShopify returned an error:", errorParam);
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400).end("Missing code");
    return;
  }

  if (state !== STATE) {
    res.writeHead(400).end("State mismatch — possible CSRF. Aborting.");
    console.error("\nState mismatch (got " + state + ", expected " + STATE + ")");
    process.exit(1);
  }

  // Exchange the code for an access token
  try {
    const tokenResp = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code
      })
    });
    const data = (await tokenResp.json()) as { access_token?: string; scope?: string; error?: string };

    if (!tokenResp.ok || !data.access_token) {
      res
        .writeHead(500, { "Content-Type": "text/html" })
        .end(`<h1>Token exchange failed</h1><pre>${JSON.stringify(data, null, 2)}</pre>`);
      console.error("\nToken exchange failed:", JSON.stringify(data, null, 2));
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { "Content-Type": "text/html" }).end(
      `<html><body style="font-family:system-ui;padding:40px;max-width:600px"><h1>✓ Token minted</h1><p>Check your terminal — the access token has been printed there. You can close this tab.</p><p style="color:#666;font-size:12px">Granted scopes: ${data.scope ?? "(unknown)"}</p></body></html>`
    );

    console.log("\n=== ✓ ACCESS TOKEN MINTED ===");
    console.log(data.access_token);
    console.log("=============================\n");
    console.log(`Granted scopes: ${data.scope ?? "(unknown)"}\n`);
    console.log("Add these lines to .env.local:");
    console.log(`  SHOPIFY_BLACKVAULT_API_KEY=${data.access_token}`);
    console.log(`  SHOPIFY_BLACKVAULT_STORE_DOMAIN=${SHOP}`);
    console.log("\n(Or whatever brand env var names you prefer.)");

    server.close();
    process.exit(0);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.writeHead(500).end(msg);
    console.error("\nException during token exchange:", msg);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\n--- Shopify OAuth Token Mint ---\n`);
  console.log(`Local callback server: http://localhost:${PORT}${"/auth/callback"}`);
  console.log(`\nIf you haven't already, add this exact URL to your Partner Dashboard app's`);
  console.log(`"Allowed redirection URLs" list and save:`);
  console.log(`  ${REDIRECT_URI}`);
  console.log(`\nOpening browser to the Shopify install page now...`);
  console.log(`(If it doesn't open automatically, copy this URL into your browser:)`);
  console.log(`\n  ${authUrl}\n`);
  console.log(`Approve the app in Shopify. The token will print here when done.\n`);

  // Auto-open the browser. Cross-platform best-effort.
  const opener =
    process.platform === "win32"
      ? `start "" "${authUrl}"`
      : process.platform === "darwin"
        ? `open "${authUrl}"`
        : `xdg-open "${authUrl}"`;
  exec(opener, () => {
    /* ignore — user can paste the URL manually if auto-open fails */
  });
});

setTimeout(() => {
  console.error("\nTimed out after 5 minutes waiting for OAuth callback. Exiting.");
  process.exit(1);
}, 5 * 60 * 1000);
