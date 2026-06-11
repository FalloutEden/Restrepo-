// Mint a Shopify Admin API access token with ZERO copy-paste.
//
// Starts a localhost listener, prints an authorize URL, and captures the OAuth
// redirect automatically — exchanges the code and writes SHOPIFY_BLACKVAULT_API_KEY
// + SHOPIFY_BLACKVAULT_STORE_DOMAIN into .env.local. Replaces the fiddly
// PowerShell flow (paste-the-redirect-URL) that kept breaking.
//
// One-time setup: add this redirect to your Dev Dashboard app's
// "Allowed redirection URLs":   http://localhost:53682/callback
//
// Reads SHOPIFY_APP_API_KEY + SHOPIFY_APP_API_SECRET from .env.local.
// Usage:  node scripts/mint-shopify-token.mjs [shop.myshopify.com]
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";

const FILE = ".env.local";
function envFrom(name) {
  for (const line of fs.readFileSync(FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] === name) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    }
  }
  return "";
}

const clientId = envFrom("SHOPIFY_APP_API_KEY");
const clientSecret = envFrom("SHOPIFY_APP_API_SECRET");
const shop = (process.argv[2] || "black-vault-apparel.myshopify.com").trim().toLowerCase();
const PORT = 53682;
// Must match a redirect URL whitelisted in the Dev Dashboard app.
const redirectUri = `http://localhost:${PORT}/auth/callback`;
const scopes = "read_products,write_products,read_files,write_files,read_orders";
const state = crypto.randomBytes(8).toString("hex");

if (!clientId || !clientSecret) {
  console.error("✗ Need SHOPIFY_APP_API_KEY and SHOPIFY_APP_API_SECRET in .env.local first.");
  process.exit(1);
}

function setLine(arr, key, val) {
  let found = false;
  const out = arr.map((l) => {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] === key) { found = true; return `${key}=${val}`; }
    return l;
  });
  if (!found) out.push(`${key}=${val}`);
  return out;
}

const params = new URLSearchParams({ client_id: clientId, scope: scopes, redirect_uri: redirectUri, state });
const authUrl = `https://${shop}/admin/oauth/authorize?${params.toString()}`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const code = u.searchParams.get("code");
  // Tolerant: handle any path as long as Shopify sent a `code` (so a /callback
  // vs /auth/callback mismatch can't break it). Ignore noise like /favicon.ico.
  if (!code) { res.writeHead(u.pathname.includes("callback") ? 400 : 404); res.end("waiting for Shopify code…"); return; }
  try {
    const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`exchange ${r.status}: ${text.slice(0, 200)}`);
    const body = JSON.parse(text);
    if (!body.access_token) throw new Error("no access_token: " + text.slice(0, 200));

    let lines = fs.readFileSync(FILE, "utf8").split(/\r?\n/);
    lines = setLine(lines, "SHOPIFY_BLACKVAULT_API_KEY", body.access_token);
    lines = setLine(lines, "SHOPIFY_BLACKVAULT_STORE_DOMAIN", shop);
    fs.writeFileSync(FILE, lines.join("\n"));

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1 style='font-family:sans-serif'>✓ Token captured. You can close this tab.</h1>");
    console.log(`TOKEN_OK shop=${shop} scopes=${body.scope} len=${body.access_token.length}`);
    setTimeout(() => { server.close(); process.exit(0); }, 400);
  } catch (e) {
    res.writeHead(500); res.end("error: " + (e instanceof Error ? e.message : "unknown"));
    console.error("EXCHANGE_FAIL " + (e instanceof Error ? e.message : e));
    setTimeout(() => process.exit(1), 400);
  }
});

server.listen(PORT, () => {
  console.log("LISTENING on " + redirectUri);
  console.log("AUTHORIZE_URL " + authUrl);
});
