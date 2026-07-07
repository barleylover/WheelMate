export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  const response = await fetch(url, { ...init, signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 160);
  }
  return String(error).slice(0, 160);
}
