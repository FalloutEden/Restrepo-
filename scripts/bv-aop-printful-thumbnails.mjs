// Give each AOP product a real GARMENT thumbnail in Printful (they currently all
// show the same flat design file, so you can't tell them apart when ordering
// samples). Reuses the real mockups already generated on Shopify.
//
// SAFETY: thumbnail is cosmetic, but Printful's sync-product PUT can be finicky,
// so we first test the thumbnail-only PUT on the throwaway "API Smoke Test"
// product and ABORT if it changes the variant count — before touching anything
// real. Read-modify-verify on every product.
//
// Run: node scripts/bv-aop-printful-thumbnails.mjs
import fs from "node:fs";

function v(n){for(const l of fs.readFileSync(".env.local","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&m[1]===n)return m[2].trim();}return"";}
const PF_TOKEN=v("PRINTFUL_API_KEY"), PF_STORE=v("PRINTFUL_STORE_ID");
const SHOP_DOM=v("SHOPIFY_BLACKVAULT_STORE_DOMAIN"), SHOP_TOK=v("SHOPIFY_BLACKVAULT_API_KEY");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

async function pf(method, path, body){
  await sleep(1300); // ~1 QPS
  const r=await fetch(`https://api.printful.com${path}`,{method,headers:{Authorization:`Bearer ${PF_TOKEN}`,"X-PF-Store-Id":PF_STORE,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  const t=await r.text(); if(!r.ok) throw new Error(`PF ${method} ${path} ${r.status}: ${t.slice(0,200)}`);
  return t?JSON.parse(t):{};
}
async function shopGet(path){
  const r=await fetch(`https://${SHOP_DOM}/admin/api/2024-04/${path}`,{headers:{"X-Shopify-Access-Token":SHOP_TOK}});
  if(!r.ok) throw new Error(`Shopify ${path} ${r.status}`); return r.json();
}
const norm=(s)=>String(s).toLowerCase().replace(/[^a-z0-9]/g,"");

// 1. Shopify AOP -> real garment mockup URL
const sp=(await shopGet("products.json?limit=250&fields=id,title,images")).products||[];
const shopMock={};
for(const p of sp){ if(!/aop|all[- ]?over/i.test(p.title)) continue;
  const real=(p.images||[]).map(i=>i.src).find(s=>/all-over-print|front/i.test(s)&&!/preview|bv-aop/i.test(s));
  if(real) shopMock[norm(p.title)]=real;
}

// 2. Printful AOP sync products
const pl=(await pf("GET","/store/products?limit=100")).result||[];
const aop=pl.filter(p=>/aop|all[- ]?over/i.test(p.name));

// 3. SAFETY TEST on the smoke-test product
const smoke=pl.find(p=>/smoke test/i.test(p.name));
if(smoke){
  const before=(await pf("GET",`/store/products/${smoke.id}`)).result;
  const bn=(before.sync_variants||[]).length;
  const testUrl=Object.values(shopMock)[0];
  await pf("PUT",`/store/products/${smoke.id}`,{sync_product:{thumbnail:testUrl}});
  const after=(await pf("GET",`/store/products/${smoke.id}`)).result;
  const an=(after.sync_variants||[]).length;
  if(an!==bn){ console.error(`✗ ABORT: thumbnail PUT changed smoke-test variants ${bn}->${an}. Not touching real products.`); process.exit(1); }
  console.log(`✓ safety test passed (variants ${bn} preserved, thumbnail updatable)`);
} else {
  console.log("! no smoke-test product found; proceeding with per-product verify only");
}

// 4. Update each AOP product's thumbnail to its real garment mockup
let done=0, skipped=[];
for(const p of aop){
  const url=shopMock[norm(p.name)];
  if(!url){ skipped.push(p.name); continue; }
  const before=(await pf("GET",`/store/products/${p.id}`)).result;
  const bn=(before.sync_variants||[]).length;
  await pf("PUT",`/store/products/${p.id}`,{sync_product:{thumbnail:url}});
  const after=(await pf("GET",`/store/products/${p.id}`)).result;
  const an=(after.sync_variants||[]).length;
  const ok=an===bn;
  console.log(`${ok?"✓":"✗"} ${p.name}  variants ${bn}${ok?" preserved":"->"+an+" CHANGED!"}`);
  if(ok) done++;
}
console.log(`\nUpdated ${done}/${aop.length} AOP thumbnails.`);
if(skipped.length) console.log("No mockup yet (left as-is):", skipped.join(", "));
