// Quick diagnostic — opens /pipeline in headless Chrome, waits for the
// CerebroHeartbeat fetch to settle, then reports:
//   - console errors / warnings
//   - whether the synapse SVG rendered
//   - whether stats show numbers vs dashes
//   - whether the activity log has entries
// Run with: node scripts/diagnose-heartbeat.mjs
import { chromium } from "playwright";

const URL = process.env.URL ?? "http://localhost:3000/pipeline";

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleLogs = [];
const networkFails = [];
page.on("console", (m) => consoleLogs.push({ type: m.type(), text: m.text() }));
page.on("pageerror", (e) => consoleLogs.push({ type: "pageerror", text: e.message }));
page.on("requestfailed", (r) =>
  networkFails.push({ url: r.url(), failure: r.failure()?.errorText })
);
page.on("response", (r) => {
  if (r.status() >= 400) networkFails.push({ url: r.url(), status: r.status() });
});

console.log(`[diag] navigating to ${URL}`);
await page.goto(URL, { waitUntil: "networkidle", timeout: 20000 });

// Give the heartbeat poll one cycle (it fetches on mount, then every 5s)
await page.waitForTimeout(7000);

// Capture state of the heartbeat panel
const probe = await page.evaluate(() => {
  const panel = document.querySelector(".cerebro-heartbeat");
  if (!panel) return { mounted: false };

  const synapse = panel.querySelector(".cerebro-synapse");
  const svg = synapse?.querySelector("svg");
  const nodeCount = svg?.querySelectorAll("circle").length ?? 0;
  const stats = Array.from(panel.querySelectorAll(".cerebro-heartbeat__stat-value")).map(
    (el) => el.textContent?.trim()
  );
  const activity = Array.from(panel.querySelectorAll(".cerebro-heartbeat__log-entry")).length;
  const empty = panel.querySelector(".cerebro-heartbeat__log-empty")?.textContent?.trim();
  const error = panel.querySelector(".cerebro-heartbeat__error")?.textContent?.trim();
  return {
    mounted: true,
    synapseHasSvg: Boolean(svg),
    synapseCircleCount: nodeCount,
    synapseFrameRect: panel.querySelector(".cerebro-heartbeat__brain-frame")?.getBoundingClientRect(),
    stats,
    activityCount: activity,
    activityEmptyText: empty,
    errorText: error
  };
});

console.log("\n[diag] panel state:", JSON.stringify(probe, null, 2));
console.log("\n[diag] console messages:");
for (const m of consoleLogs) console.log(` ${m.type}: ${m.text}`);
console.log("\n[diag] failed network requests:");
for (const f of networkFails) console.log(` ${f.url} → ${f.failure}`);

await browser.close();
