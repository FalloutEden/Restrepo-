import { NextResponse } from "next/server";

const SHOPIFY_PRODUCTS_URL = "https://lock-layer.myshopify.com/admin/api/2024-04/products.json";

function getAccessToken() {
  const accessToken = process.env.SHOPIFY_API_KEY?.trim();

  if (!accessToken) {
    throw new Error("Missing SHOPIFY_API_KEY in server environment.");
  }

  return accessToken;
}

async function parseShopifyResponse(response: Response) {
  const rawBody = await response.text();
  return rawBody ? JSON.parse(rawBody) : null;
}

async function createTestProduct() {
  try {
    const accessToken = getAccessToken();
    const response = await fetch(SHOPIFY_PRODUCTS_URL, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product: {
          title: "TEST PRODUCT FROM AGENT",
          body_html: "<strong>This is a test product created by your agent system</strong>",
          vendor: "LockLayer Security",
          product_type: "Test",
          status: "draft"
        }
      }),
      cache: "no-store"
    });

    const data = await parseShopifyResponse(response);

    return NextResponse.json({
      status: response.status,
      data
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 500,
        error: error instanceof Error ? error.message : "Unexpected Shopify test route failure."
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return createTestProduct();
}

export async function POST() {
  return createTestProduct();
}
