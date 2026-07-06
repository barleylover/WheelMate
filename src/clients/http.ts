import { withRetry } from "../utils/retry.js";

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
  }
}

export const fetchJson = async <T>(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<T> => {
  const execute = async (): Promise<T> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        throw new HttpError(`HTTP ${response.status} from ${url}`, response.status);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  };

  return withRetry(execute, { attempts: 2, delayMs: 300 });
};
