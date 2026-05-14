# Legal Scraping Brief for CEREBRO

Scope: scraping public marketing/blog pages (Baymard, IndieHackers, Shopify blog, Klaviyo customer stories) for knowledge-graph enrichment. Jurisdiction: US federal + California. Last updated 2026-05-13.

## What is settled

1. **Public pages + no login = no CFAA liability.** *hiQ v. LinkedIn* (9th Cir., April 2022, final consent judgment Dec 2022) held scraping public web data is not "without authorization" under the CFAA. *Van Buren v. United States* (S. Ct. 2021) endorsed a "gates-up-or-down" reading: CFAA only bites when you bypass a closed gate (login, IP block, post-C&D access). *Meta v. Bright Data* (N.D. Cal., Judge Chen, Jan 23 2024) extended this: scraping public Facebook/Instagram pages while logged out did not breach Meta's ToS because non-logged-in scrapers aren't bound by the contract. Meta dropped the case and waived appeal.
2. **CFAA line:** authorization is revoked when you (a) bypass a technical block (CAPTCHA, rate-limit, IP ban), (b) log in to access otherwise-gated content, or (c) keep scraping after a targeted cease-and-desist (per hiQ dicta).
3. **Robots.txt is not a contract.** No US court has held robots.txt creates binding legal obligations. It is a guideline; ignoring it is evidence of bad faith but not itself unlawful (Harvard JOLT, Spring 2021).

## What is unsettled

4. **ToS exposure:** if you must click "I agree" or create an account, breach-of-contract claims survive (browsewrap usually fails; clickwrap usually sticks). Damages are typically nominal absent proven harm. If you scrape only as a logged-out anonymous visitor with no manifest assent, contract claims are weak post–*Bright Data*.
5. **Copyright on ingested content:** copying full articles into a store is reproduction. Fair-use defense for AI training is in flux: *Bartz v. Anthropic* (N.D. Cal., Alsup J., June 2025) called training "spectacularly transformative" (later $1.5B settlement on piracy-source claim). *Kadrey v. Meta* (June 2025) reached similar fair-use result. *Thomson Reuters v. Ross Intelligence* (D. Del., Bibas J., 2025) went the other way — no fair use where the AI competes directly with the source. Distinguishing factor: market substitution.
6. **State laws to watch:** California CIPA (Pen. Code §§ 631/632) is being weaponized against tracking pixels and AI transcription, not classic scraping — but SB 690 reform pending. CCPA gives Californians deletion rights over personal info scraped from them.

## DO

- Scrape only logged-out, publicly reachable pages with no auth wall, no CAPTCHA, no IP block.
- Honor `robots.txt` even though it's not binding — defeats bad-faith narrative and FTC unfairness theories.
- Cap rate (≤ 1 req/sec per host, identifiable User-Agent with contact URL). Avoids "trespass to chattels" (*eBay v. Bidder's Edge*) and tortious-interference claims.
- Store **semantic summaries, embeddings, and short fact-citations** in the graph, not full article text. Transformative + minimal copying = strongest fair-use posture.
- Keep a domain allowlist + the C&D registry; auto-stop on receipt of any cease-and-desist or Retry-After 429s.
- Strip personal data (names, emails) from founder-blog ingests to avoid CCPA/GDPR exposure.

## DON'T

- Don't log in, bypass paywalls, rotate IPs to evade blocks, or fake oauth — that is the CFAA "closed gate."
- Don't accept clickwrap ToS then scrape — you become contractually bound (LinkedIn won that prong against hiQ on remand).
- Don't ingest full-text articles from outlets that license training data (NYT, Reuters, Condé Nast) — *NYT v. OpenAI* still pending, exposure live.
- Don't build features that **substitute** for the source (a Baymard-knockoff UX advisor). Substitution kills fair use (*Ross*).
- Don't scrape behind-login social platforms (LinkedIn profiles while logged in, gated Facebook groups) — bright-line CFAA risk.

## Agent decision rule

Safe to scrape site X iff: public URL + no auth required + robots.txt allows the path + no prior C&D + ingestion is summary/embedding (not verbatim) + site is not a direct competitor to BV's offering.
