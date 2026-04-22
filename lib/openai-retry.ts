type RetryEvent = {
  attempt: number;
  delayMs: number;
  label: string;
  retryAfterMs?: number;
};

type OpenAIRetryOptions = {
  label: string;
  maxRetries?: number;
  baseDelayMs?: number;
  onRetry?: (event: RetryEvent) => void;
};

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function readHeader(headers: unknown, key: string) {
  if (!headers) {
    return undefined;
  }

  if (typeof (headers as { get?: (name: string) => string | null }).get === "function") {
    return (headers as { get: (name: string) => string | null }).get(key) ?? undefined;
  }

  if (typeof headers === "object" && key in (headers as Record<string, unknown>)) {
    const value = (headers as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }

  return undefined;
}

export function isRateLimitError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    "status" in error &&
    (error as Error & { status?: number }).status === 429
  );
}

export function parseRetryAfterMs(error: unknown) {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const headers = (error as Error & { headers?: unknown }).headers;
  const retryAfterValue = readHeader(headers, "retry-after");

  if (!retryAfterValue) {
    return undefined;
  }

  const asSeconds = Number(retryAfterValue);
  if (Number.isFinite(asSeconds)) {
    return Math.max(0, Math.round(asSeconds * 1000));
  }

  const retryAt = Date.parse(retryAfterValue);
  if (!Number.isNaN(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }

  return undefined;
}

export async function withOpenAIRetry<T>(operation: () => Promise<T>, options: OpenAIRetryOptions): Promise<T> {
  const maxRetries = options.maxRetries ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 1200;
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      if (!isRateLimitError(error) || attempt > maxRetries) {
        throw error;
      }

      const retryAfterMs = parseRetryAfterMs(error);
      const backoffDelay = Math.round(baseDelayMs * 2 ** (attempt - 1));
      const delayMs = retryAfterMs ?? backoffDelay + Math.round(Math.random() * 250);

      options.onRetry?.({
        attempt,
        delayMs,
        label: options.label,
        retryAfterMs
      });

      await sleep(delayMs);
    }
  }
}
