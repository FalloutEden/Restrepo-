#!/usr/bin/env node
/**
 * Black Vault design → product pipeline (the reusable tool).
 *
 * Takes design files and turns them into a live-ready, fulfillment-linked product:
 *   vectorize (optional) → host on Shopify CDN → Printful mockups → Shopify draft
 *   product → Printful fulfillment link → (optional) publish.
 *
 * Built 2026-06-11 from the proven BV Insignia run. Works for the API-manageable
 * (Manual/native) Printful stores — i.e. Black Vault, NOT the Etsy store.
 *
 * USAGE:  node scripts/design-pipeline.mjs <config.json>
 *
 * CONFIG (see scripts/pipeline-examples/bv-insignia.json):
 * {
 *   "title": "Black Vault — Insignia Tee",
 *   "blankMatch": "3001",            // substring to find the Printful catalog blank
 *   "color": "Black",                // garment color (variant filter + mockup)
 *   "price": "44.00",
 *   "tags": "Black Vault, premium",
 *   "vendor": "Black Vault",
 *   "productType": "T-Shirt",
 *   "placements": [
 *     { "design": ".openclaw/bv-designs/print/emblem-flat-a-5000.png",
 *       "placement": "front", "mode": "chest-left", "widthFactor": 0.26,
 *       "vectorize": true, "color": "#C9A24B" },
 *     { "design": ".openclaw/bv-designs/print/backprint-flat-5000.png",
 *       "placement": "back", "mode": "center", "widthFactor": 0.9,
 *       "vectorize": true, "color": "#C9A24B" }
 *   ],
 *   "publish": false                 // true => active + Online Store
 * }
 *
 * Placement modes: "center" (centered) | "chest-left" (small upper, wearer's left).
 * Set "vectorize": false for detailed/illustration art (trace only suits flat 2-color).
 */
import fs from "node:fs";
import sharp from "sharp";
import potrace from "potrace";

function env(n){for(const l of fs.readFileSync(".env.local","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&m[1]===n){let s=m[2].trim();if(s.startsWith('"')&&s.endsWith('"'))s=s.slice(1,-1);return s;}}return"";}
const DOM=env("SHOPIFY_BLACKVAULT_STORE_DOMAIN"), STOK=env("SHOPIFY_BLACKVAULT_API_KEY");
const PFT=env("PRINTFUL_API_KEY"), PFS=env("PRINTFUL_STORE_ID");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const trace=(buf,opts)=>new Promise((res,rej)=>potrace.trace(buf,opts,(e,svg)=>e?rej(e):res(svg)));

async function gql(q,va){const r=await fetch(`https://${DOM}/admin/api/2024-04/graphql.json`,{method:"POST",headers:{"X-Shopify-Access-Token":STOK,"Content-Type":"application/json"},body:JSON.stringify({query:q,variables:va})});const j=await r.json();if(j.errors)throw new Error("GQL "+JSON.stringify(j.errors).slice(0,160));return j.data;}
async function shopREST(method,path,body){const r=await fetch(`https://${DOM}/admin/api/2024-04/${path}`,{method,headers:{"X-Shopify-Access-Token":STOK,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw new Error(`Shopify ${path} ${r.status}: ${JSON.stringify(j).slice(0,160)}`);return j;}
async function pf(method,path,body){await sleep(1300);const r=await fetch(`https://api.printful.com${path}`,{method,headers:{Authorization:`Bearer ${PFT}`,"X-PF-Store-Id":PFS,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});const t=await r.text();if(!r.ok)throw new Error(`PF ${method} ${path} ${r.status}: ${t.slice(0,200)}`);return t?JSON.parse(t):{};}

/** Trace a flat 2-color design to SVG + a 5000px transparent PNG (≥500 DPI). */
export async function vectorize(srcPath, color="#C9A24B", outBase){
  const pre=await sharp(srcPath).grayscale().normalise().negate().toBuffer();
  const svg=await trace(pre,{color,background:"transparent",threshold:128,turdSize:30,optTolerance:0.4});
  const png=await sharp(Buffer.from(svg)).resize({width:5000}).png().toBuffer();
  if(outBase){fs.writeFileSync(`${outBase}.svg`,svg);fs.writeFileSync(`${outBase}-5000.png`,png);}
  return {svg, png};
}
/** Upload a buffer to Shopify Files and return its CDN URL. */
export async function hostOnShopify(filename, buffer){
  const d=await gql(`mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}`,{input:[{filename,mimeType:"image/png",httpMethod:"POST",resource:"FILE"}]});
  const t=d.stagedUploadsCreate.stagedTargets[0];const fd=new FormData();t.parameters.forEach(p=>fd.append(p.name,p.value));fd.append("file",new Blob([buffer],{type:"image/png"}),filename);
  const up=await fetch(t.url,{method:"POST",body:fd});if(!up.ok)throw new Error("staged upload "+up.status);
  const fc=await gql(`mutation($files:[FileCreateInput!]!){fileCreate(files:$files){files{__typename ... on MediaImage{id image{url}}} userErrors{message}}}`,{files:[{originalSource:t.resourceUrl,contentType:"IMAGE",filename}]});
  const id=fc.fileCreate.files[0]?.id;let url=fc.fileCreate.files[0]?.image?.url||"";
  for(let i=0;i<25&&!url;i++){await sleep(800+i*200);const p=await gql(`query($id:ID!){node(id:$id){... on MediaImage{image{url}}}}`,{id});url=p.node?.image?.url||"";}
  if(!url)throw new Error("no CDN url");return url;
}
/** Position helper (Printful print-file coords). */
export function position(area, aspect, widthFactor, mode){
  let w=area.w*widthFactor, h=w/aspect; if(h>area.h*0.92){h=area.h*0.92;w=h*aspect;}
  const left = mode==="chest-left" ? Math.round(area.w*0.52) : Math.round((area.w-w)/2);
  const top  = mode==="chest-left" ? Math.round(area.h*0.05) : Math.round((area.h-h)/2);
  return {area_width:area.w,area_height:area.h,width:Math.round(w),height:Math.round(h),top,left};
}
/** Generate one Printful mockup, return its URL. */
export async function mockup(productId, variantId, placement, url, position){
  const task=await pf("POST",`/mockup-generator/create-task/${productId}`,{variant_ids:[variantId],format:"jpg",files:[{placement,image_url:url,position}]});
  const key=task.result.task_key;
  for(let i=0;i<40;i++){await sleep(4000);const td=(await pf("GET",`/mockup-generator/task?task_key=${encodeURIComponent(key)}`)).result;if(td.status==="completed")return td.mockups?.[0]?.mockup_url;if(td.status==="failed")throw new Error("mockup failed");}
  throw new Error("mockup timeout");
}

async function main(){
  const cfgPath=process.argv[2];
  if(!cfgPath){console.error("usage: node scripts/design-pipeline.mjs <config.json>");process.exit(1);}
  const cfg=JSON.parse(fs.readFileSync(cfgPath,"utf8"));
  console.log(`PIPELINE: ${cfg.title}`);

  // catalog blank + variants + print areas
  const cat=(await pf("GET","/products")).result;
  const blank=cat.find(p=>new RegExp(cfg.blankMatch,"i").test(p.title));
  if(!blank)throw new Error("blank not found: "+cfg.blankMatch);
  const detail=(await pf("GET",`/products/${blank.id}`)).result;
  const variants=detail.variants.filter(x=>new RegExp(`^${cfg.color}$`,"i").test(x.color));
  const bySize={}; variants.forEach(x=>bySize[x.size]=x.id);
  const sizes=[...new Set(variants.map(x=>x.size))];
  const pfs=(await pf("GET",`/mockup-generator/printfiles/${blank.id}`)).result;
  const areaOf=(pl)=>{const f=pfs.printfiles.find(x=>x.printfile_id===pfs.variant_printfiles[0].placements[pl]);return{w:f.width,h:f.height};};
  console.log(`blank ${blank.id} (${blank.title}) — ${variants.length} ${cfg.color} variants`);

  // process each placement: vectorize/prep -> host -> position -> mockup
  const files=[]; let thumbUrl=null;
  for(const pl of cfg.placements){
    let buf, aspect;
    if(pl.vectorize){ const vraw=await vectorize(pl.design, pl.color||"#C9A24B"); buf=vraw.png; }
    else { buf=await sharp(pl.design).trim().resize(4000,4000,{fit:"inside"}).png().toBuffer(); }
    const trimmed=await sharp(buf).trim().toBuffer(); const m=await sharp(trimmed).metadata(); aspect=m.width/m.height;
    const url=await hostOnShopify(`pl-${pl.placement}.png`, await sharp(trimmed).resize(3500,3500,{fit:"inside"}).png().toBuffer());
    const pos=position(areaOf(pl.placement), aspect, pl.widthFactor, pl.mode);
    const mk=await mockup(blank.id, variants[0].id, pl.placement, url, pos);
    console.log(`  ${pl.placement}: hosted + mockup ✓`);
    files.push({type:pl.placement, url, position:pos});
    if(!thumbUrl && mk) thumbUrl=await hostOnShopify(`thumb-${pl.placement}.png`, Buffer.from(await (await fetch(mk)).arrayBuffer()));
    if(mk) { fs.mkdirSync("pipeline-out",{recursive:true}); fs.writeFileSync(`pipeline-out/mockup-${pl.placement}.jpg`, Buffer.from(await (await fetch(mk)).arrayBuffer())); }
  }

  // Shopify draft product (images = mockups from pipeline-out)
  const images=fs.readdirSync("pipeline-out").filter(f=>f.startsWith("mockup-")).map(f=>({attachment:fs.readFileSync(`pipeline-out/${f}`).toString("base64")}));
  const sp=(await shopREST("POST","products.json",{product:{
    title:cfg.title, body_html:cfg.body||"", vendor:cfg.vendor||"Black Vault", product_type:cfg.productType||"T-Shirt",
    status:cfg.publish?"active":"draft", tags:cfg.tags||"",
    options:[{name:"Size",values:sizes}],
    variants:sizes.map(s=>({option1:s,price:cfg.price,sku:`${cfg.sku||"BV"}-${s}`})),
    images
  }})).product;
  console.log(`Shopify product ${sp.id} (${sp.status})`);

  // Link Printful fulfillment (sync_variant.external_id = Shopify variant id)
  const shopVars=sp.variants.map(x=>({id:x.id,size:x.option1}));
  await pf("POST","/store/products",{ sync_product:{name:cfg.title, external_id:sp.handle, thumbnail:thumbUrl||files[0].url},
    sync_variants: shopVars.filter(s=>bySize[s.size]).map(s=>({external_id:String(s.id), variant_id:bySize[s.size], retail_price:cfg.price, files})) });
  console.log("Printful linked ✓");

  if(cfg.publish){
    const pubs=await gql(`{publications(first:20){edges{node{id name}}}}`);
    const online=pubs.publications.edges.find(e=>/online store/i.test(e.node.name))?.node;
    if(online) await gql(`mutation($id:ID!,$pid:ID!){publishablePublish(id:$id,input:{publicationId:$pid}){userErrors{message}}}`,{id:`gid://shopify/Product/${sp.id}`,pid:online.id});
    console.log("published to Online Store ✓");
  }
  console.log(`DONE — ${cfg.publish?"LIVE":"DRAFT"}: https://${DOM}/products/${sp.handle}`);
}
if(import.meta.url===`file://${process.argv[1]}`||process.argv[1]?.endsWith("design-pipeline.mjs")) main().catch(e=>{console.error("PIPELINE ERROR:",e.message);process.exit(1);});
