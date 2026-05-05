// Verify which Printful catalog products + colors are available for the
// blanks I want to recommend. Uses the cached v2 catalog format which lists
// colors at the product level (not the per-variant level).
//
// Run: node --import tsx scripts/check-printful-blanks.ts

import { readFile } from "node:fs/promises";
import path from "node:path";

type CatalogProductV2 = {
  id: number;
  type?: string;
  name?: string;
  brand?: string | null;
  model?: string;
  is_discontinued?: boolean;
  variant_count?: number;
  sizes?: string[];
  colors?: Array<{ name: string; value: string }>;
};

const TARGETS: Array<{ label: string; match: RegExp; gender: "men" | "women" | "unisex" }> = [
  // ── Men's / unisex (existing BV blanks — checking white availability) ──
  { label: "Cotton Heritage MC1086 (Vault Tee)", match: /Cotton Heritage|MC1086/i, gender: "unisex" },
  { label: "Comfort Colors 1717 (Heavy Tee)", match: /Comfort Colors.*1717|1717/i, gender: "unisex" },
  { label: "AS Colour 5081 (Long Sleeve)", match: /AS ?Colour.*5081|5081/i, gender: "unisex" },
  { label: "Lane Seven LS14004 (Crewneck)", match: /Lane Seven|LS14004/i, gender: "unisex" },
  { label: "Stanley/Stella SASU024 (Men's Hoodie)", match: /Stanley.*Stella|SASU/i, gender: "men" },
  { label: "Bella+Canvas 4737 (Sweatpants)", match: /Bella.*Canvas.*4737|4737/i, gender: "unisex" },
  { label: "Port Authority K500 (Polo)", match: /Port Authority.*K500|K500/i, gender: "unisex" },

  // ── Polo upgrades (Travis Mathew tier) ──
  { label: "Adidas Performance Polo", match: /Adidas.*[Pp]olo|polo.*Adidas/i, gender: "unisex" },
  { label: "Nike Dri-FIT Polo", match: /Nike.*[Pp]olo|polo.*Nike/i, gender: "unisex" },

  // ── Women's launch candidates ──
  { label: "AS Colour Women's Heavyweight Tee", match: /AS ?Colour.*[Ww]omen|[Ww]omen.*AS ?Colour/i, gender: "women" },
  { label: "Bella+Canvas Women's Tees (any)", match: /Bella.*Canvas.*[Ww]omen|[Ww]omen.*Bella/i, gender: "women" },
  { label: "Stanley/Stella Women's Hoodie", match: /Stanley.*Stella.*[Ww]omen|SASA/i, gender: "women" },
  { label: "Any Women's Cropped item", match: /[Cc]ropped/i, gender: "women" },
  { label: "Any Women's Hoodie", match: /[Ww]omen.*[Hh]oodie|[Hh]oodie.*[Ww]omen/i, gender: "women" }
];

function hasWhite(colors?: Array<{ name: string }>): { white: boolean; whitish: string[] } {
  if (!colors) return { white: false, whitish: [] };
  const whitish: string[] = [];
  let exact = false;
  for (const c of colors) {
    const name = (c.name ?? "").toLowerCase();
    if (name === "white" || name === "white solid") exact = true;
    if (/(white|natural|cream|ivory|off[- ]?white|bone|antique[- ]?white|vintage[- ]?white|salt|stone|sand)/.test(name)) {
      whitish.push(c.name);
    }
  }
  return { white: exact, whitish };
}

async function main() {
  const raw = await readFile(path.join(process.cwd(), ".openclaw/printful-catalog-v2.json"), "utf8");
  const data = JSON.parse(raw) as CatalogProductV2[];
  const active = data.filter((p) => !p.is_discontinued);
  console.log(`Catalog: ${active.length} active products (${data.length} total, ${data.length - active.length} discontinued)\n`);

  for (const target of TARGETS) {
    const matches = active.filter((p) =>
      target.match.test([p.name, p.brand, p.model].filter(Boolean).join(" "))
    );
    if (matches.length === 0) {
      console.log(`✗  ${target.label} — NOT FOUND\n`);
      continue;
    }
    console.log(`${matches.length === 1 ? "✓" : "≈"}  ${target.label} (${matches.length} match${matches.length === 1 ? "" : "es"})`);
    for (const m of matches.slice(0, 4)) {
      const { white, whitish } = hasWhite(m.colors);
      const colorCount = m.colors?.length ?? 0;
      const flag = white ? "★ WHITE" : whitish.length > 0 ? `~white-ish: ${whitish.join(", ")}` : "(no white)";
      console.log(`     - id=${m.id}  ${m.brand ?? ""} ${m.model ?? ""} — ${m.name?.slice(0, 70) ?? "?"}`);
      console.log(`       ${colorCount} colors, ${m.sizes?.length ?? 0} sizes  ${flag}`);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
