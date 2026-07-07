import type { AppConfig } from "../config.js";

const TOKEN_PREFIX = "wm1.";

interface PlayMcpConfigTokenPayload {
  KAKAO_REST_API_KEY?: string;
  NAVER_CLIENT_ID?: string;
  NAVER_CLIENT_SECRET?: string;
}

function extractToken(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
}

function decodePayload(token: string): PlayMcpConfigTokenPayload | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  try {
    const encoded = token.slice(TOKEN_PREFIX.length);
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<PlayMcpConfigTokenPayload>;
    return {
      KAKAO_REST_API_KEY: typeof parsed.KAKAO_REST_API_KEY === "string" ? parsed.KAKAO_REST_API_KEY : undefined,
      NAVER_CLIENT_ID: typeof parsed.NAVER_CLIENT_ID === "string" ? parsed.NAVER_CLIENT_ID : undefined,
      NAVER_CLIENT_SECRET:
        typeof parsed.NAVER_CLIENT_SECRET === "string" ? parsed.NAVER_CLIENT_SECRET : undefined
    };
  } catch {
    return null;
  }
}

export function createPlayMcpConfigToken(env: NodeJS.ProcessEnv = process.env): string {
  const payload: PlayMcpConfigTokenPayload = {
    KAKAO_REST_API_KEY: env.KAKAO_REST_API_KEY?.trim(),
    NAVER_CLIENT_ID: env.NAVER_CLIENT_ID?.trim(),
    NAVER_CLIENT_SECRET: env.NAVER_CLIENT_SECRET?.trim()
  };
  const missing = Object.entries(payload)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Missing required env values: ${missing.join(", ")}`);
  }
  return `${TOKEN_PREFIX}${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

export function configFromAuthorization(baseConfig: AppConfig, authorizationHeader: string | undefined): AppConfig {
  const token = extractToken(authorizationHeader);
  const payload = token ? decodePayload(token) : null;
  if (!payload) return baseConfig;
  return {
    ...baseConfig,
    kakaoRestApiKey: payload.KAKAO_REST_API_KEY || baseConfig.kakaoRestApiKey,
    naverClientId: payload.NAVER_CLIENT_ID || baseConfig.naverClientId,
    naverClientSecret: payload.NAVER_CLIENT_SECRET || baseConfig.naverClientSecret
  };
}
