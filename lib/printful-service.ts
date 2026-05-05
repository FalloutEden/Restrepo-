import "server-only";

import type { BuildSpec, BuiltProduct } from "@/lib/autonomous-products";
import { uploadBufferToShopifyFiles } from "@/lib/shopify-service";
import { generateProductImage } from "@/lib/image-generation";

type PrintfulConfig = {
  token: string;
  storeId: string;
  variantId: number;
  retailPrice: string;
};

function ensurePrintfulConfig(): PrintfulConfig {
  const token = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();
  const variantId = Number(process.env.PRINTFUL_DEFAULT_VARIANT_ID?.trim() || "");

  if (!token) {
    throw new Error("Missing PRINTFUL_API_KEY in server environment.");
  }

  if (!storeId) {
    throw new Error("Missing PRINTFUL_STORE_ID in server environment.");
  }

  if (!Number.isFinite(variantId)) {
    throw new Error("Missing PRINTFUL_DEFAULT_VARIANT_ID in server environment.");
  }

  return {
    token,
    storeId,
    variantId,
    retailPrice: process.env.PRINTFUL_RETAIL_PRICE?.trim() || "29.99"
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}


async function createPrintfulSyncProduct(spec: BuildSpec, imageUrl: string, config: PrintfulConfig) {
  const response = await fetch("https://api.printful.com/store/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "X-PF-Store-Id": config.storeId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sync_product: {
        external_id: spec.id,
        name: spec.title,
        thumbnail: imageUrl
      },
      sync_variants: [
        {
          external_id: spec.id,
          variant_id: config.variantId,
          retail_price: spec.price.toFixed(2),
          files: [
            {
              type: "default",
              url: imageUrl
            }
          ]
        }
      ]
    })
  });

  const rawBody = await response.text();
  const payload = rawBody ? (JSON.parse(rawBody) as { result?: { id?: number } }) : {};

  if (!response.ok || !payload.result?.id) {
    throw new Error(`Printful sync product creation failed (${response.status}): ${rawBody}`);
  }

  return {
    syncProductId: payload.result.id,
    variantId: config.variantId
  };
}

export async function buildPrintfulProduct(spec: BuildSpec): Promise<BuiltProduct> {
  const config = ensurePrintfulConfig();
  const direction = spec.imagePrompt?.trim();
  const themeLine = direction
    ? `Theme and style direction: ${direction}`
    : `Theme: ${spec.title}. ${spec.description}`;
  // Print artwork only — Printful prints the PNG as-is onto the shirt, so this must
  // be the design alone on a transparent canvas, never a photo of a finished product.
  const imagePrompt = [
    `Print-on-demand apparel artwork. Bold, high-contrast graphic design intended to be printed directly onto a t-shirt or hoodie.`,
    themeLine,
    `Output requirements: flat 2D artwork only — the design itself, centered on a fully transparent background. Do NOT depict a t-shirt, hoodie, garment, mockup, hanger, mannequin, or any product photography. No shadows, no studio lighting, no fabric texture, no folds. The image must be ready to drop straight onto a blank shirt as a print file.`,
    `Composition: design fills roughly the central 70% of the canvas, with clear empty (transparent) margins. Crisp clean lines, suitable for screen printing or DTG. Limited color palette unless the theme requires otherwise. No watermarks, no signatures, no extra text outside what the design itself calls for.`
  ].join(" ");
  const generatedImage = await generateProductImage(imagePrompt, { transparent: true });
  // Apparel hosts on Black Vault Apparel's Shopify storefront. Pin the upload to that
  // store so the resulting CDN URL belongs to the same shop where the listing lives.
  const uploadedImage = await uploadBufferToShopifyFiles(
    `${slugify(spec.title)}.png`,
    "image/png",
    generatedImage.buffer,
    "black-vault-apparel"
  );

  if (!uploadedImage.url) {
    throw new Error(`Image hosting did not return a public URL for "${spec.title}".`);
  }

  const printfulProduct = await createPrintfulSyncProduct(spec, uploadedImage.url, config);

  return {
    id: spec.id,
    source: "printful",
    title: spec.title,
    description: spec.description,
    price: spec.price,
    currency: spec.currency,
    images: [uploadedImage.url],
    productType: spec.productType,
    niche: spec.niche,
    keywords: spec.keywords,
    sourceProductId: String(printfulProduct.syncProductId),
    buildNotes: [`Printful sync product ${printfulProduct.syncProductId} created.`],
    imagePrompt,
    printfulSyncProductId: printfulProduct.syncProductId,
    printfulVariantId: printfulProduct.variantId
  };
}
