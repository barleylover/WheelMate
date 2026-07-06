const removeParenthetical = (value: string): string => value.replace(/\([^)]*\)/g, "");

export const normalizeName = (value: string | undefined): string => {
  if (!value) {
    return "";
  }
  return removeParenthetical(value)
    .toLowerCase()
    .replace(/점$/u, "")
    .replace(/[^0-9a-z가-힣]/gu, "");
};

export const normalizeAddress = (value: string | undefined): string => {
  if (!value) {
    return "";
  }
  return value
    .toLowerCase()
    .replace(/[(),.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const addressTokens = (value: string | undefined): Set<string> => {
  const normalized = normalizeAddress(value);
  if (!normalized) {
    return new Set();
  }
  return new Set(normalized.split(" ").filter((token) => token.length > 1));
};

const levenshtein = (a: string, b: string): number => {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j]!;
    }
  }

  return previous[b.length]!;
};

export const stringSimilarity = (a: string | undefined, b: string | undefined): number => {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) {
    return 0;
  }
  if (left === right || left.includes(right) || right.includes(left)) {
    return 1;
  }
  const maxLength = Math.max(left.length, right.length);
  return Math.max(0, 1 - levenshtein(left, right) / maxLength);
};

export const tokenSimilarity = (a: string | undefined, b: string | undefined): number => {
  const left = addressTokens(a);
  const right = addressTokens(b);
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
};
