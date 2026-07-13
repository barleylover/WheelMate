import { afterEach, describe, expect, it, vi } from "vitest";
import { SimpleRateLimiter } from "../src/utils/rateLimit.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SimpleRateLimiter", () => {
  it("allows the first call immediately and spaces subsequent calls", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const limiter = new SimpleRateLimiter(250);

    await expect(limiter.wait()).resolves.toBeUndefined();
    let secondResolved = false;
    const second = limiter.wait().then(() => {
      secondResolved = true;
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(secondResolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(secondResolved).toBe(true);
  });
});
