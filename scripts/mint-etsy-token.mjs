// One-command Etsy OAuth token minter (PKCE) — like mint-shopify-token.mjs.
// Captures the redirect on localhost, exchanges the code, and writes
// ETSY_ACCESS_TOKEN + ETSY_REFRESH_TOKEN into .env.local. Needed for PRIVATE /
// listing-management endpoints (the GthicPrintables "AI drafts -> you activate"
// automation). Public shop stats don't need this; listing creation does.
//
// PREREQUISITE: in your Etsy app (etsy.com/developers) add this exact Callback URL:
//     http://localhost:3456/callback
//
// Run: node scripts/mint-etsy-token.mjs
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

const PORT = 3456;
const REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPES = "listings_r listings_w listings_d transactions_r shops_r";

function envVal(n) {
  for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] === n) { let s = m[2].trim(); if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1); return s; }
  }
  return "";
}
function writeEnv(updates) {
  let lines = fs.readFileSync(".env.local", "utf8").split(/\r?\n/);
  for (const [k, v] of Object.entries(updates)) {
    const i = lines.findIndex((l) => l.startsWith(k + "="));
    if (i >= 0) lines[i] = `${k}=${v}`;
    else lines.push(`${k}=${v}`);
  }
  fs.writeFileSync(".env.local", lines.join("\n"));
}

const keystring = envVal("ETSY_API_KEYSTRING");
const secret = envVal("ETSY_SHARED_SECRET");
if (!keystring) { console.error("Missing ETSY_API_KEYSTRING in .env.local"); process.exit(1); }

const verifier = crypto.randomBytes(32).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
const state = crypto.randomBytes(8).toString("hex");

const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${encodeURIComponent(SCOPES)}&client_id=${keystring}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const code = u.searchParams.get("code");
  if (!code) { res.writeHead(u.pathname.includes("callback") ? 400 : 404); res.end("waiting for Etsy code…"); return; }
  try {
    const body = new URLSearchParams({ grant_type: "authorization_code", client_id: keystring, redirect_uri: REDIRECT, code, code_verifier: verifier });
    const r = await fetch("https://api.etsy.com/v3/public/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "x-api-key": secret ? `${keystring}:${secret}` : keystring },
      body
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) throw new Error(`${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    writeEnv({ ETSY_ACCESS_TOKEN: j.access_token, ETSY_REFRESH_TOKEN: j.refresh_token || "" });
    const userId = String(j.access_token).split(".")[0];
    console.log(`TOKEN_OK user_id=${userId} scopes=${SCOPES} expires_in=${j.expires_in}`);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h2>✓ Etsy token captured. You can close this tab.</h2>");
    setTimeout(() => process.exit(0), 400);
  } catch (e) {
    console.error("EXCHANGE_FAILED", e.message);
    res.writeHead(500); res.end("exchange failed: " + e.message);
    setTimeout(() => process.exit(1), 400);
  }
});
server.listen(PORT, () => {
  console.log(`LISTENING on ${REDIRECT}`);
  console.log(`AUTHORIZE_URL ${authUrl}`);
});
