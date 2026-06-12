// GthicPrintables listing engine — create DIGITAL DOWNLOAD draft listings on Etsy
// from local designs + SEO. Drafts only (founder reviews + activates). The shop's
// model is printables (type=download): no shipping/readiness/fulfillment needed.
//
// Etsy auth: x-api-key MUST be "keystring:shared_secret". Needs ETSY_ACCESS_TOKEN.
// Run: node scripts/etsy-create-printables.mjs
import fs from "node:fs";
function v(n){for(const l of fs.readFileSync(".env.local","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&m[1]===n){let s=m[2].trim();if(s.startsWith('"')&&s.endsWith('"'))s=s.slice(1,-1);return s;}}return "";}
const key=v("ETSY_API_KEYSTRING"),sec=v("ETSY_SHARED_SECRET"),tok=v("ETSY_ACCESS_TOKEN");
const SHOP="40775757", TAXONOMY=2078, PRICE=5.0;
const H={"x-api-key":`${key}:${sec}`,"Authorization":`Bearer ${tok}`};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function form(path,obj){const body=new URLSearchParams();for(const[k,val]of Object.entries(obj)){if(val!=null)body.append(k,String(val));}const r=await fetch(`https://api.etsy.com/v3/application${path}`,{method:"POST",headers:{...H,"Content-Type":"application/x-www-form-urlencoded"},body});return{status:r.status,json:await r.json().catch(()=>({}))};}
async function upload(path,field,buf,filename,extra={}){const fd=new FormData();fd.append(field,new Blob([buf]),filename);for(const[k,v2]of Object.entries(extra))fd.append(k,String(v2));const r=await fetch(`https://api.etsy.com/v3/application${path}`,{method:"POST",headers:H,body:fd});return{status:r.status,json:await r.json().catch(()=>({}))};}

// design slug (file at .openclaw/gthic-designs/<slug>.png) + Etsy SEO
const DESIGNS=[
  { slug:"celestial-black-cat", title:"Celestial Black Cat Printable Wall Art, Witchy Moon Cat Digital Download, Gothic Cat Poster, Dark Academia Cat Lover Print", desc:"INSTANT DOWNLOAD — an arched black cat beneath a crescent moon and stars. Witchy / celestial / dark-academia wall art you print at home, any size. No physical item shipped. For personal use.", tags:"black cat print,witchy wall art,celestial cat,moon cat,gothic printable,cat lover gift,digital download,dark academia,occult art,goth decor,instant download,star cat,printable art" },
  { slug:"the-moon-tarot", title:"The Moon Tarot Printable Wall Art, Gothic Tarot Card Digital Download, Witchy Celestial Decor, Occult Tarot Poster Print", desc:"INSTANT DOWNLOAD — an ornate 'The Moon' tarot card. Gothic / witchy / occult wall art, print at home any size. No physical item shipped. For personal use.", tags:"tarot print,the moon tarot,gothic wall art,witchy decor,tarot card art,celestial print,occult art,digital download,dark academia,instant download,tarot poster,moon art,printable art" },
  { slug:"skeletal-hand-roses", title:"Skeleton Hand Rose Printable Wall Art, Gothic Memento Mori Digital Download, Witchy Floral Skull Poster, Dark Academia Print", desc:"INSTANT DOWNLOAD — a skeletal hand holding a rose. Memento mori / romantic-gothic / dark-academia wall art, print at home any size. No physical item shipped. For personal use.", tags:"skeleton hand print,rose skull art,memento mori,gothic printable,witchy wall art,bone hand,romantic goth,digital download,dark academia,goth decor,instant download,skull rose,printable art" },
  { slug:"raven-occult-moon", title:"Raven Crescent Moon Printable Wall Art, Gothic Raven Digital Download, Witchy Celestial Bird Poster, Occult Moon Print", desc:"INSTANT DOWNLOAD — a raven perched on a crescent moon with occult sigils. Gothic / witchy / celestial wall art, print at home any size. No physical item shipped. For personal use.", tags:"raven print,gothic wall art,witchy decor,crescent moon,occult art,celestial bird,digital download,dark academia,goth decor,instant download,raven poster,moon art,printable art" },
  { slug:"moonphase-botanical", title:"Moon Phases Botanical Printable Wall Art, Celestial Floral Digital Download, Witchy Moon Cycle Poster, Boho Gothic Print", desc:"INSTANT DOWNLOAD — a moon-phase cycle wrapped in a botanical wreath. Celestial / witchy / boho-gothic wall art, print at home any size. No physical item shipped. For personal use.", tags:"moon phases print,botanical wall art,celestial print,witchy decor,moon cycle,boho gothic,digital download,floral moon,occult art,instant download,lunar art,moon poster,printable art" }
];

(async()=>{
  const made=[];
  for(const d of DESIGNS){
    const path=`.openclaw/gthic-designs/${d.slug}.png`;
    if(!fs.existsSync(path)){ console.log(`✗ ${d.slug}: design file missing`); continue; }
    const res=await form(`/shops/${SHOP}/listings`, { quantity:999, type:"download", who_made:"i_did", when_made:"2020_2025", taxonomy_id:TAXONOMY, price:PRICE, title:d.title, description:d.desc, tags:d.tags });
    const id=res.json.listing_id;
    if(!id){ console.log(`✗ ${d.slug}: create ${res.status} ${JSON.stringify(res.json).slice(0,120)}`); continue; }
    const buf=fs.readFileSync(path);
    await upload(`/shops/${SHOP}/listings/${id}/images`,"image",buf,`${d.slug}.png`,{rank:1});
    await upload(`/shops/${SHOP}/listings/${id}/files`,"file",buf,`${d.slug}-printable.png`,{name:`${d.slug}-printable.png`});
    console.log(`✓ ${d.slug} -> draft listing ${id}`);
    made.push(id);
    await sleep(1200);
  }
  console.log(`\nDONE — ${made.length}/${DESIGNS.length} drafts created on GthicPrintables.`);
})();
