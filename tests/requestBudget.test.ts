import { describe, expect, it } from "vitest";
import { RequestBudget } from "../src/utils/requestBudget.js";

describe("RequestBudget", () => {
  it("never permits more external attempts than its configured limit", () => {
    const budget = new RequestBudget(2);

    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);
    expect(budget.snapshot()).toEqual({
      limit: 2,
      used: 2,
      remaining: 0,
      exhausted: true
    });
  });
});
