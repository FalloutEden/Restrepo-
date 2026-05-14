function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function extractCdata(s) {
  const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1] : s;
}

function pickTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return undefined;
  return decodeEntities(extractCdata(m[1])).trim();
}

function pickLink(xml) {
  const atom = xml.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (atom) return atom[1];
  return pickTag(xml, "link");
}

function parseFeed(xml) {
  const blocks = [];
  let m;
  const itemRe = /<item[\s>][\s\S]*?<\/item>/gi;
  const entryRe = /<entry[\s>][\s\S]*?<\/entry>/gi;
  while ((m = itemRe.exec(xml)) !== null) blocks.push(m[0]);
  if (blocks.length === 0) {
    while ((m = entryRe.exec(xml)) !== null) blocks.push(m[0]);
  }
  const out = [];
  for (const block of blocks) {
    const title = pickTag(block, "title");
    const link = pickLink(block);
    const pubDate =
      pickTag(block, "pubDate") ?? pickTag(block, "published") ?? pickTag(block, "updated");
    const description =
      pickTag(block, "description") ?? pickTag(block, "summary") ?? pickTag(block, "content");
    if (!title || !link) continue;
    out.push({
      title: stripTags(title).slice(0, 80),
      link,
      pubDate,
      hasDesc: Boolean(description)
    });
  }
  return out;
}

const FEEDS = [
  ["shopify-changelog", "https://shopify.dev/changelog/feed"],
  ["shopify-news", "https://news.shopify.com/feed"],
  ["printful-blog", "https://www.printful.com/blog/feed"],
  ["stripe-blog", "https://stripe.com/blog/feed.rss"],
  ["nielsen-norman", "https://www.nngroup.com/feed/rss/"],
  ["practical-ecom", "https://www.practicalecommerce.com/feed"],
  ["producthunt", "https://www.producthunt.com/feed"],
  ["indiehackers-podcast", "https://feeds.transistor.fm/the-indie-hackers-podcast"]
];

const summary = [];
for (const [slug, url] of FEEDS) {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "OperatorRSSIngest/1.0",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow"
    });
    const txt = r.ok ? await r.text() : "";
    const items = parseFeed(txt);
    const sample = items[0];
    summary.push({ slug, status: r.status, parsed: items.length, sample: sample?.title, withDates: items.filter(i => i.pubDate).length });
    console.log(slug.padEnd(24), "HTTP", r.status, "parsed", String(items.length).padStart(4), " with-dates", String(items.filter(i => i.pubDate).length).padStart(3), " e.g.", sample ? sample.title : "(none)");
  } catch (e) {
    summary.push({ slug, error: e.message });
    console.log(slug.padEnd(24), "ERR", e.message);
  }
}
