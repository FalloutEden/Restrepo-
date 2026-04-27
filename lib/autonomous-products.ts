export type ProductSource = "zendrop" | "printful";

export type ResearchOpportunity = {
  id: string;
  niche: string;
  keywords: string[];
  source: ProductSource;
  reason: string;
  searchQuery: string;
};

export type RoutedCandidate = ResearchOpportunity & {
  titleHint: string;
  productType: string;
};

export type ValidatedCandidate = RoutedCandidate & {
  score: number;
  confidenceReason: string;
};

export type BuildSpec = ValidatedCandidate & {
  title: string;
  description: string;
  price: number;
  currency: string;
  imagePrompt?: string;
};

export type BuiltProduct = {
  id: string;
  source: ProductSource;
  title: string;
  description: string;
  price: number;
  currency: string;
  images: string[];
  productType: string;
  niche: string;
  keywords: string[];
  sourceProductId: string;
  sourceProductUrl?: string;
  buildNotes: string[];
  imagePrompt?: string;
  printfulSyncProductId?: number;
  printfulVariantId?: number;
};

export type CreatedProduct = BuiltProduct & {
  status: "created" | "failed";
  shopifyProductId?: number;
  shopifyProductHandle?: string;
  shopifyProductUrl?: string;
  shopifyImageUrl?: string;
  error?: string;
};
