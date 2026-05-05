// Probe Zendrop's API to figure out which base URL / auth scheme actually works.
// Run with:
//   node --env-file=.env.local --import tsx scripts/probe-zendrop.ts

const KEY = process.env.ZENDROP_API_KEY?.trim();
if (!KEY) {
  console.error("Missing ZENDROP_API_KEY");
  process.exit(1);
}

const candidates: Array<{ url: string; method: "GET" | "POST"; auth: "bearer" | "xapi" | "both"; body?: string }> = [
  // Common base + path combinations
  { url: "https://api.zendrop.com/v1/products", method: "GET", auth: "bearer" },
  { url: "https://api.zendrop.com/v1/products", method: "GET", auth: "xapi" },
  { url: "https://api.zendrop.com/v1/me", method: "GET", auth: "bearer" },
  { url: "https://api.zendrop.com/v1/me", method: "GET", auth: "xapi" },
  { url: "https://api.zendrop.com/api/v1/products", method: "GET", auth: "bearer" },
  { url: "https://api.zendrop.com/products", method: "GET", auth: "bearer" },
  { url: "https://api.zendrop.com/v2/products", method: "GET", auth: "bearer" },
  // Public docs frequently mention a /graphql endpoint for Zendrop
  { url: "https://api.zendrop.com/graphql", method: "POST", auth: "bearer", body: '{"query":"{ __schema { queryType { name } } }"}' },
  { url: "https://api.zendrop.com/v1/graphql", method: "POST", auth: "bearer", body: '{"query":"{ __schema { queryType { name } } }"}' },
  // Their app-side API
  { url: "https://app.zendrop.com/api/products", method: "GET", auth: "bearer" },
  // Alternative bases
  { url: "https://zendrop-api.com/v1/products", method: "GET", auth: "bearer" }
];

function buildHeaders(scheme: "bearer" | "xapi" | "both") {
  const h: Record<string, string> = {};
  if (scheme === "bearer" || scheme === "both") h.Authorization = `Bearer ${KEY}`;
  if (scheme === "xapi" || scheme === "both") h["X-API-Key"] = KEY as string;
  return h;
}

async function probe(c: typeof candidates[number]) {
  const headers = buildHeaders(c.auth);
  if (c.body) headers["Content-Type"] = "application/json";
  try {
    const t0 = Date.now();
    const response = await fetch(c.url, {
      method: c.method,
      headers,
      body: c.body
    });
    const text = await response.text();
    const dt = Date.now() - t0;
    const preview = text.slice(0, 220).replace(/\s+/g, " ");
    console.log(`[${response.status}] ${c.method} ${c.url} (${c.auth}) ${dt}ms`);
    console.log(`        ${preview}`);
  } catch (err) {
    console.log(`[ERR] ${c.method} ${c.url} (${c.auth}) — ${err instanceof Error ? err.message : err}`);
  }
}

(async () => {
  for (const c of candidates) {
    await probe(c);
  }
})();
