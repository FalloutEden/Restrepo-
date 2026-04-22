import type { DatasetKey } from "@/lib/dataset-models";
import type { ResearchExample } from "@/lib/market-intelligence";

export const DEFAULT_MAX_TOKENS_PER_MINUTE = 300_000;

export type TokenBatch<T> = {
  index: number;
  items: T[];
  estimatedTokens: number;
};

export type DatasetBatchInput = {
  key: DatasetKey;
  title: string;
  estimatedTokens: number;
  examples: ResearchExample[];
};

export type ResearchExampleBatch = {
  index: number;
  datasetKeys: DatasetKey[];
  datasetTitles: string[];
  examples: ResearchExample[];
  estimatedTokens: number;
};

export function estimateTokenCount(value: unknown) {
  const text =
    typeof value === "string"
      ? value
      : value == null
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);

  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateResearchExampleTokens(example: ResearchExample) {
  return estimateTokenCount([
    example.title,
    example.url,
    example.channel,
    example.niche,
    example.productFormat,
    example.targetBuyer,
    example.deliverableType,
    example.whatLooksGood,
    example.sellabilityNotes,
    example.visualStyleNotes,
    example.styleComments,
    example.notes,
    example.status
  ]);
}

export function splitToBatches<T>(
  data: T[],
  maxTokens = DEFAULT_MAX_TOKENS_PER_MINUTE,
  getTokens: (item: T) => number = estimateTokenCount
): TokenBatch<T>[] {
  if (data.length === 0) {
    return [];
  }

  const batches: TokenBatch<T>[] = [];
  let currentItems: T[] = [];
  let currentTokens = 0;

  data.forEach((item) => {
    const itemTokens = Math.max(1, getTokens(item));

    if (currentItems.length > 0 && currentTokens + itemTokens > maxTokens) {
      batches.push({
        index: batches.length,
        items: currentItems,
        estimatedTokens: currentTokens
      });
      currentItems = [];
      currentTokens = 0;
    }

    currentItems.push(item);
    currentTokens += itemTokens;
  });

  if (currentItems.length > 0) {
    batches.push({
      index: batches.length,
      items: currentItems,
      estimatedTokens: currentTokens
    });
  }

  return batches;
}

export function splitResearchExampleBatches(
  datasets: DatasetBatchInput[],
  maxTokens = DEFAULT_MAX_TOKENS_PER_MINUTE
) {
  const batches: ResearchExampleBatch[] = [];
  let currentExamples: ResearchExample[] = [];
  let currentDatasetKeys: DatasetKey[] = [];
  let currentDatasetTitles: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (currentExamples.length === 0) {
      return;
    }

    batches.push({
      index: batches.length,
      datasetKeys: [...currentDatasetKeys],
      datasetTitles: [...currentDatasetTitles],
      examples: currentExamples,
      estimatedTokens: currentTokens
    });
    currentExamples = [];
    currentDatasetKeys = [];
    currentDatasetTitles = [];
    currentTokens = 0;
  };

  datasets.forEach((dataset) => {
    const datasetTokens = Math.max(
      dataset.estimatedTokens,
      dataset.examples.reduce((sum, example) => sum + estimateResearchExampleTokens(example), 0)
    );

    if (dataset.examples.length === 0) {
      return;
    }

    if (datasetTokens > maxTokens) {
      flush();
      const internalBatches = splitToBatches(dataset.examples, maxTokens, estimateResearchExampleTokens);
      internalBatches.forEach((batch) => {
        batches.push({
          index: batches.length,
          datasetKeys: [dataset.key],
          datasetTitles: [dataset.title],
          examples: batch.items,
          estimatedTokens: batch.estimatedTokens
        });
      });
      return;
    }

    if (currentExamples.length > 0 && currentTokens + datasetTokens > maxTokens) {
      flush();
    }

    currentExamples = [...currentExamples, ...dataset.examples];
    currentDatasetKeys = [...currentDatasetKeys, dataset.key];
    currentDatasetTitles = [...currentDatasetTitles, dataset.title];
    currentTokens += datasetTokens;
  });

  flush();
  return batches;
}
