export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const response = await fetch(url, { ...init, signal });
      if (!response.ok) {
        if (!isRetriableStatus(response.status) || attempt === 2) {
          throw new Error(`HTTP ${response.status}`);
        }
        lastError = new Error(`HTTP ${response.status}`);
      } else {
        return (await response.json()) as T;
      }
    } catch (error) {
      lastError = error;
      if (attempt === 2 || !isRetriableError(error)) {
        throw error;
      }
    }
    await sleep(180 * (attempt + 1));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
