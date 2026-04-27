type RetryEvent = {
  attempt: number;
  delayMs: number;
  label: string;
};

type ClaudeRetryOptions = {
  label: string;
  maxRetries?: number;
  baseDelayMs?: number;
  onRetry?: (event: RetryEvent) => void;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as Error & { status?: number }).status;
  return status === 429 || status === 529;
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const headers = (error as Error & { headers?: Record<string, string> }).headers;
  const retryAfter = headers?.["retry-after"];
  if (!retryAfter) return undefined;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const retryAt = Date.parse(retryAfter);
  if (!Number.isNaN(retryAt)) return Math.max(0, retryAt - Date.now());
  return undefined;
}

export async function withClaudeRetry<T>(
  operation: () => Promise<T>,
  options: ClaudeRetryOptions
): Promise<T> {
  const maxRetries = options.maxRetries ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 1500;
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (!isRateLimitError(error) || attempt > maxRetries) throw error;

      const retryAfterMs = getRetryAfterMs(error);
      const backoff = Math.round(baseDelayMs * 2 ** (attempt - 1));
      const delayMs = retryAfterMs ?? backoff + Math.round(Math.random() * 300);

      options.onRetry?.({ attempt, delayMs, label: options.label });
      await sleep(delayMs);
    }
  }
}
