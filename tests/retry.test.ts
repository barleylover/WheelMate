import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "../src/utils/retry.js";
import { RequestBudget } from "../src/utils/requestBudget.js";

describe("fetchJson retry policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("respects Retry-After before retrying a throttled request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("throttled", {
        status: 429,
        headers: { "Retry-After": "2" }
      }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const budget = new RequestBudget(3);

    const result = fetchJson<{ ok: boolean }>("https://example.com", {}, 1_000, budget);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(budget.used).toBe(2);
  });

  it("does not retry a non-retriable client error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const budget = new RequestBudget(3);

    await expect(fetchJson("https://example.com", {}, 1_000, budget)).rejects.toThrow("HTTP 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(budget.used).toBe(1);
  });

  it("does not start another attempt after the request budget is exhausted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const budget = new RequestBudget(1);

    const result = fetchJson("https://example.com", {}, 1_000, budget);
    const rejection = expect(result).rejects.toThrow("HTTP 503");
    await vi.runAllTimersAsync();

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(budget.used).toBe(1);
  });

  it("retries a transient network failure and succeeds within budget", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network fetch failed"))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const budget = new RequestBudget(2);

    const result = fetchJson<{ ok: boolean }>("https://example.com", {}, 1_000, budget);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(budget.snapshot()).toEqual({ limit: 2, used: 2, remaining: 0, exhausted: true });
  });

  it("does not retry malformed JSON returned with a successful HTTP status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not-json", {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJson("https://example.com", {}, 1_000)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
