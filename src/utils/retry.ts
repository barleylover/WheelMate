import type { RequestBudget } from "./requestBudget.js";

const MAX_RETRY_DELAY_MS = 5_000;

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  budget?: RequestBudget
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let retryDelayMs: number | undefined;
    if (budget && !budget.tryConsume()) {
      if (lastError instanceof Error) throw lastError;
      throw new Error("request_budget_exhausted");
    }
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const response = await fetch(url, { ...init, signal });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        const retriable = isRetriableStatus(response.status);
        if (retriable && attempt < 2) {
          retryDelayMs = retryAfterDelayMs(response.headers.get("retry-after"));
        }
        await discardResponseBody(response);
        if (!retriable || attempt === 2) throw error;
        lastError = error;
      } else {
        return (await response.json()) as T;
      }
    } catch (error) {
      lastError = error;
      if (attempt === 2 || !isRetriableError(error)) {
        throw error;
      }
    }
    await sleep(retryDelayMs ?? fallbackRetryDelayMs(attempt, lastError));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function retryAfterDelayMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.round(seconds * 1_000));
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, timestamp - Date.now()));
}

function fallbackRetryDelayMs(attempt: number, error: unknown): number {
  const throttled = error instanceof Error && /HTTP 429/.test(error.message);
  const baseMs = throttled ? 600 : 200;
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.min(MAX_RETRY_DELAY_MS, Math.round(baseMs * (2 ** attempt) * jitter));
}

async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Releasing an error response body is best-effort only.
  }
}

function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /timeout|aborted|network|fetch failed|HTTP (408|429|5\d\d)/i.test(error.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 160);
  }
  return String(error).slice(0, 160);
}
