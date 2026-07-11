export interface RequestBudgetSnapshot {
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
}

export class RequestBudget {
  private usedCount = 0;
  readonly limit: number;

  constructor(limit: number) {
    this.limit = Math.max(0, Math.floor(limit));
  }

  tryConsume(count = 1): boolean {
    const normalized = Math.max(1, Math.floor(count));
    if (this.usedCount + normalized > this.limit) return false;
    this.usedCount += normalized;
    return true;
  }

  get used(): number {
    return this.usedCount;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.usedCount);
  }

  get exhausted(): boolean {
    return this.remaining === 0;
  }

  snapshot(): RequestBudgetSnapshot {
    return {
      limit: this.limit,
      used: this.used,
      remaining: this.remaining,
      exhausted: this.exhausted
    };
  }
}
