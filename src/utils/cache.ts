import crypto from "node:crypto";

export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
};

export const cacheKey = (provider: string, request: unknown): string => {
  const hash = crypto.createHash("sha256").update(stableStringify(request)).digest("hex");
  return `${provider}:${hash}`;
};
