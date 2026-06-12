# AI provider safety — first-party, moderated providers ONLY

_2026-06-10. Hard platform policy. We are liable for everything generated through
this app. We will not become a vehicle for illegal content (CSAM, non-consensual
imagery, deceptive deepfakes, etc.). The defense is provider selection: only use
AI image/video providers that enforce their own content moderation + acceptable-
use policy. Never strip or bypass their safety._

## The rule

- **Only first-party APIs from major labs that moderate content.** The provider
  itself must refuse disallowed prompts/outputs. We rely on that as the first
  line of defense.
- **NEVER use aggregators, resellers, or proxy APIs** (e.g. kie.ai, grsai,
  Replicate-as-a-proxy, "cheap Nano Banana / Sora API" middlemen). They can have
  weaker enforcement, unknown backends, and they see our keys + prompts — a real
  back door. Always hit the lab's official endpoint.
- **NEVER use "uncensored" / "NSFW-unlocked" / jailbroken models**, self-hosted
  Stable Diffusion / Flux without a moderation layer, or any model marketed as
  having safety removed.
- **NEVER accept a merchant-supplied model endpoint or base URL.** Providers are
  a fixed allowlist in code (an enum), not a free-form string. A tenant brings a
  *key* for an approved provider — never an arbitrary URL.
- **Do not disable safety parameters.** If a provider exposes safety settings,
  keep them at the provider's safe defaults or stricter.

## Approved providers

Image (live):
- **OpenAI gpt-image-1** — official `api.openai.com`. Enforces OpenAI usage
  policies + moderation.
- **Google Nano Banana 2 (gemini-3.1-flash-image)** — official
  `generativelanguage.googleapis.com`. Enforces Google prohibited-use policy,
  safety filters, and SynthID watermarking.

Video (when content-studio video ships — use ONLY these, official endpoints):
- **Google Veo** (Gemini / Vertex, official)
- **OpenAI Sora** (official, if/when API access is available)
- **Runway** (official `runwayml.com` API)
- **Luma Dream Machine** (official Luma API)

All four are reputable companies that moderate generations and publish usage
policies. Re-confirm a provider still moderates before adding it.

## Enforcement in code

- `ImageProvider` in `lib/image-generation.ts` is a fixed union (`"openai" |
  "google"`) — that union IS the allowlist. Adding a provider is a deliberate
  code change reviewed against this policy, not config.
- Tool schemas expose provider as an `enum`, so the model can't pass an arbitrary
  provider/endpoint.
- Every generation is logged (activity + spend, attributed per tenant) so there's
  an audit trail.
- Tenants accept the platform Acceptable Use Policy (high-risk / illegal content
  prohibited) at onboarding; abuse is grounds for suspension.

## If a merchant asks for an unsupported/unsafe provider

Decline plainly: we only support moderated first-party providers, for everyone's
legal safety. Offer the approved options (upload their own art, OpenAI, Google).
Capture the request with `record_note` if they want a provider considered — but
it only gets added if it meets this policy.
