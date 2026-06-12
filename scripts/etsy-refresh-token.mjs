// Refresh the Etsy OAuth access token (they expire after 1 hour). Uses the stored
// refresh token; writes the new ETSY_ACCESS_TOKEN + ETSY_REFRESH_TOKEN to .env.local.
// The fulfillment engine calls this whenever a 401 "expired" comes back.
// Run: node scripts/etsy-refresh-token.mjs
import fs from "node:fs";
function envVal(n){for(const l of fs.readFileSync(".env.local","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&m[1]===n){let s=m[2].trim();if(s.startsWith('"')&&s.endsWith('"'))s=s.slice(1,-1);return s;}}return "";}
function writeEnv(updates){let lines=fs.readFileSync(".env.local","utf8").split(/\r?\n/);for(const[k,val]of Object.entries(updates)){const i=lines.findIndex((l)=>l.startsWith(k+"="));if(i>=0)lines[i]=`${k}=${val}`;else lines.push(`${k}=${val}`);}fs.writeFileSync(".env.local",lines.join("\n"));}

const key=envVal("ETSY_API_KEYSTRING"), sec=envVal("ETSY_SHARED_SECRET"), refresh=envVal("ETSY_REFRESH_TOKEN");
if(!refresh){console.error("Missing ETSY_REFRESH_TOKEN — run mint-etsy-token.mjs first.");process.exit(1);}
const body=new URLSearchParams({grant_type:"refresh_token",client_id:key,refresh_token:refresh});
const r=await fetch("https://api.etsy.com/v3/public/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","x-api-key":sec?`${key}:${sec}`:key},body});
const j=await r.json();
if(!r.ok||!j.access_token){console.error("REFRESH_FAILED",r.status,JSON.stringify(j).slice(0,200));process.exit(1);}
writeEnv({ETSY_ACCESS_TOKEN:j.access_token, ETSY_REFRESH_TOKEN:j.refresh_token||refresh});
console.log(`✓ refreshed — user_id=${String(j.access_token).split(".")[0]} expires_in=${j.expires_in}s`);
