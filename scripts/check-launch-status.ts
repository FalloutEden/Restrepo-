// Read-only sanity check — fetches the launch-status report for every
// configured brand and prints it. No side effects.
//
// Run:
//   node --env-file=.env.local --import tsx scripts/check-launch-status.ts

import { getLaunchStatusForAllBrands } from "@/lib/launch-status";

async function main() {
  const reports = await getLaunchStatusForAllBrands();
  for (const r of reports) {
    console.log(`\n=== ${r.brand}  (overall: ${r.overall.toUpperCase()}) ===`);
    for (const c of r.checks) {
      const badge = c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✗";
      console.log(`  ${badge} ${c.name.padEnd(40)} ${c.detail}`);
      if (c.fix) console.log(`     fix: ${c.fix}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
