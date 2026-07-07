export function normalizeText(value: string | undefined | null): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[()［\][\]{}<>]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDistrict(address?: string): string | undefined {
  const match = address?.match(/([가-힣]+구|[가-힣]+군|[가-힣]+시)/);
  return match?.[1];
}

export function extractAddressToken(address?: string): string | undefined {
  const match = address?.match(/([가-힣0-9]+(?:로|길|대로))/);
  return match?.[1];
}
