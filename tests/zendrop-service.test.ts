import test from "node:test";
import assert from "node:assert/strict";

import { searchZendropProducts } from "../lib/zendrop-service";

test("searchZendropProducts normalizes real-looking Zendrop product results", async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ZENDROP_API_KEY;
  const originalBaseUrl = process.env.ZENDROP_API_BASE_URL;
  const originalPath = process.env.ZENDROP_PRODUCT_SEARCH_PATH;
  const originalMethod = process.env.ZENDROP_SEARCH_METHOD;

  process.env.ZENDROP_API_KEY = "test-key";
  process.env.ZENDROP_API_BASE_URL = "https://api.zendrop.example";
  process.env.ZENDROP_PRODUCT_SEARCH_PATH = "/products/search";
  process.env.ZENDROP_SEARCH_METHOD = "POST";

  global.fetch = (async () =>
    new Response(
      JSON.stringify({
        products: [
          {
            id: "zd-123",
            title: "Portable Pet Grooming Vacuum",
            image_urls: ["https://images.example/pet-vacuum.png"],
            price: "24.99",
            currency: "USD",
            product_url: "https://app.zendrop.com/product/zd-123",
            category: "Pet Supplies"
          },
          {
            id: "broken",
            title: "Incomplete Product",
            price: "12.00"
          }
        ]
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )) as typeof fetch;

  try {
    const results = await searchZendropProducts({
      niche: "pet supplies",
      keywords: ["grooming", "vacuum"]
    });

    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      id: "zd-123",
      title: "Portable Pet Grooming Vacuum",
      images: ["https://images.example/pet-vacuum.png"],
      price: 24.99,
      currency: "USD",
      productUrl: "https://app.zendrop.com/product/zd-123",
      productType: "Pet Supplies"
    });
  } finally {
    global.fetch = originalFetch;
    process.env.ZENDROP_API_KEY = originalApiKey;
    process.env.ZENDROP_API_BASE_URL = originalBaseUrl;
    process.env.ZENDROP_PRODUCT_SEARCH_PATH = originalPath;
    process.env.ZENDROP_SEARCH_METHOD = originalMethod;
  }
});
