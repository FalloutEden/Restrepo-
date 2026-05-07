// Stub env vars so importing libs that init API clients at module-load time
// doesn't crash the test process. Real API calls are not made by these tests.
process.env.OPENAI_API_KEY ||= "stub-openai-key-tests-do-not-call";
process.env.ANTHROPIC_API_KEY ||= "stub-anthropic-key-tests-do-not-call";
process.env.PRINTFUL_API_KEY ||= "stub-printful-key-tests-do-not-call";
process.env.SHOPIFY_API_KEY ||= "stub-shopify-key-tests-do-not-call";
process.env.SHOPIFY_STORE_DOMAIN ||= "stub.myshopify.com";
process.env.SHOPIFY_BLACKVAULT_API_KEY ||= "stub-bv-key-tests-do-not-call";
process.env.SHOPIFY_BLACKVAULT_STORE_DOMAIN ||= "stub-bv.myshopify.com";
