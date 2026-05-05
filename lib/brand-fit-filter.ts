// Regex-based brand-fit gate for the autonomous pipeline. Sits between
// opportunity_router output and materializeProduct so that off-brand
// opportunities (occupation-specific apparel, service products, digital
// downloads, inspirational quotes, holiday merch) never auto-create as
// drafts.
//
// The 11-agent runtime trains on Etsy/Fiverr/job-vocabulary datasets and
// reliably produces this slop. Filtering at the materialization boundary is
// the right place to catch it because:
//   - It's brand-aware (different rules per brand).
//   - It doesn't require retraining the agents or touching the dataset layer.
//   - It runs in microseconds (regex) — no Claude tokens spent.
//
// If a false positive blocks a real opportunity, soften the matching pattern
// rather than removing the gate. The base assumption is "block by default,
// allow on-brand" — premium brands are defined by what they reject.

const OCCUPATION_PATTERNS =
  /\b(nurse|nursing|doctor|physician|surgeon|dentist|hygienist|pharmacist|optometrist|veterinarian|chiropractor|midwife|teacher|professor|principal|veteran|firefighter|paramedic|emt|police|officer|cop|sheriff|therapist|architect|engineer|lawyer|attorney|judge|social[- ]?worker|psychologist|librarian|chef|barista|trucker|farmer|rancher|cowboy|mechanic|electrician|plumber|welder|carpenter|painter|barber|hairstylist|esthetician|stylist|crossfit[- ]?mom|sahm|nicu|cna|lpn|creative[- ]?director|art[- ]?director|graphic[- ]?designer|marketing[- ]?manager|product[- ]?manager|software[- ]?engineer|developer|programmer|christian|catholic|muslim|jewish|baptist|methodist|hindu|buddhist|mormon|lds|faith|scripture|religious|denomination|prayer|biblical|gospel|sister|brother|grandma|grandpa|grandmother|grandfather|aunt|uncle|wife|husband|mom|dad|mother|father|mama|papa|mommy|daddy|dog[- ]?(?:dad|mom|mama|papa)|cat[- ]?(?:dad|mom|mama|papa)|german[- ]?shepherd[- ]?(?:dad|mom)|labrador[- ]?(?:dad|mom)|golden[- ]?retriever[- ]?(?:dad|mom))\b/i;

const SERVICE_PATTERNS =
  /\b(consulting|consultant|automation[- ]?setup|prep[- ]?kit|certification[- ]?prep|audit|workflow|dashboard|database|tracker|toolkit|toolset|setup[- ]?for|service[- ]?for|done[- ]?for[- ]?you|coaching|course|masterclass|webinar|bootcamp)\b/i;

const DIGITAL_PATTERNS =
  /\b(pdf|ebook|e[- ]?book|planner|printable|spreadsheet|template|workbook|guide|checklist|sticker[- ]?pack|digital[- ]?download|notion[- ]?template)\b/i;

const INSPIRATIONAL_PATTERNS =
  /\b(hustle|grind|queen|king|boss[- ]?(?:babe|lady|mom)|rockstar|warrior|legend|hero|squad|tribe|gang|crew[- ]?life|life[- ]?goals|live[- ]?laugh|blessed|hashtag)\b/i;

const HOLIDAY_PATTERNS =
  /\b(christmas|easter|halloween|thanksgiving|valentines?|st[.\s]?patricks?|mothers?[- ]?day|fathers?[- ]?day|4th[- ]?of[- ]?july|fourth[- ]?of[- ]?july|memorial[- ]?day|labor[- ]?day|new[- ]?year)\b/i;

// Security/safety vocabulary — explicit allowlist for LockLayer so we don't
// accidentally reject "smart lock for renters" or similar legitimate framing.
const SECURITY_ALLOWLIST =
  /\b(camera|doorbell|lock|alarm|sensor|sentry|surveillance|smoke[- ]?detector|gas[- ]?detector|safe|vault|lockbox|home[- ]?security|driveway|motion|tripwire|night[- ]?vision|wifi[- ]?cam|spy[- ]?cam|hidden[- ]?cam|anti[- ]?theft|tracker|gps[- ]?tag)\b/i;

export type BrandFitResult = { ok: true } | { ok: false; reason: string };

export type BrandFitInput = {
  title: string;
  productServiceType?: string;
  deliverableType?: string;
  niche?: string;
};

export function evaluateBrandFit(
  opp: BrandFitInput,
  fulfillmentType: "printful" | "zendrop" | "digital",
  brandSlug: string
): BrandFitResult {
  const haystack = [opp.title, opp.productServiceType, opp.deliverableType, opp.niche]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" ");

  // Black Vault Apparel rules — premium elevated-essentials
  if (brandSlug === "black-vault-apparel" || fulfillmentType === "printful") {
    const occMatch = haystack.match(OCCUPATION_PATTERNS);
    if (occMatch) {
      return {
        ok: false,
        reason: `Occupation-specific ("${occMatch[0]}") — Black Vault is premium essentials, not occupation merch.`
      };
    }
    if (SERVICE_PATTERNS.test(haystack)) {
      const m = haystack.match(SERVICE_PATTERNS)?.[0];
      return { ok: false, reason: `Service product ("${m}") — Black Vault is apparel only.` };
    }
    if (DIGITAL_PATTERNS.test(haystack)) {
      const m = haystack.match(DIGITAL_PATTERNS)?.[0];
      return { ok: false, reason: `Digital deliverable ("${m}") — Black Vault is physical apparel only.` };
    }
    if (INSPIRATIONAL_PATTERNS.test(haystack)) {
      const m = haystack.match(INSPIRATIONAL_PATTERNS)?.[0];
      return { ok: false, reason: `Inspirational/quote phrasing ("${m}") — wrong voice for Black Vault.` };
    }
    if (HOLIDAY_PATTERNS.test(haystack)) {
      const m = haystack.match(HOLIDAY_PATTERNS)?.[0];
      return { ok: false, reason: `Holiday-themed ("${m}") — Black Vault is timeless.` };
    }
  }

  // LockLayer Security rules — practical home/IoT security hardware
  if (brandSlug === "locklayer" || fulfillmentType === "digital") {
    if (DIGITAL_PATTERNS.test(haystack)) {
      return {
        ok: false,
        reason: "Digital deliverable — LockLayer sells hardware, not downloads."
      };
    }
    if (SERVICE_PATTERNS.test(haystack)) {
      return {
        ok: false,
        reason: "Service product — LockLayer sells hardware, not services."
      };
    }
    if (OCCUPATION_PATTERNS.test(haystack)) {
      return {
        ok: false,
        reason: "Occupation-specific — LockLayer is general home security, not target-marketed."
      };
    }
    // Soft signal: if NO security vocabulary appears, the opportunity is
    // probably misrouted into LockLayer. Warn rather than hard-reject so we
    // don't accidentally block a legitimately routed item.
    if (!SECURITY_ALLOWLIST.test(haystack)) {
      return {
        ok: false,
        reason: "No security/IoT vocabulary detected — likely misrouted to LockLayer."
      };
    }
  }

  return { ok: true };
}
