import { CoreError } from './errors.js';

export type CoreConfig = {
  port: number;
  allowedOrigins: string[];
  allowedProductDomains: string[];
  backendBaseUrl: URL;
  agentBaseUrl: URL;
  internalApiToken: string;
  upstreamTimeoutMs: number;
  gemini: GeminiConfig;
};

export type GeminiConfig = {
  apiKey: string | null;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  cacheMaxEntries: number;
  rateLimitCooldownMs: number;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): CoreConfig {
  const internalApiToken = source.INTERNAL_API_TOKEN?.trim();
  if (!internalApiToken) {
    throw new CoreError(500, 'INTERNAL_API_TOKEN_MISSING', 'INTERNAL_API_TOKEN is required');
  }
  return {
    port: positiveInteger(source.CORE_PORT ?? '3002', 'CORE_PORT'),
    allowedOrigins: commaList(source.CORE_ALLOWED_ORIGINS ?? ''),
    allowedProductDomains: commaList(
      source.ALLOWED_PRODUCT_DOMAINS ?? 'coupang.com,oliveyoung.co.kr,musinsa.com,zigzag.kr',
    ),
    backendBaseUrl: serviceUrl(source.BACKEND_BASE_URL ?? 'http://127.0.0.1:3000'),
    agentBaseUrl: serviceUrl(source.AGENT_BASE_URL ?? 'http://127.0.0.1:3001'),
    internalApiToken,
    upstreamTimeoutMs: positiveInteger(
      source.UPSTREAM_TIMEOUT_MS ?? '25000',
      'UPSTREAM_TIMEOUT_MS',
    ),
    gemini: {
      apiKey: optionalSecret(source.GEMINI_API_KEY),
      model: nonEmpty(source.GEMINI_MODEL ?? 'gemini-2.5-flash-lite', 'GEMINI_MODEL'),
      timeoutMs: positiveInteger(source.GEMINI_TIMEOUT_MS ?? '8000', 'GEMINI_TIMEOUT_MS'),
      maxOutputTokens: positiveInteger(
        source.GEMINI_MAX_OUTPUT_TOKENS ?? '256',
        'GEMINI_MAX_OUTPUT_TOKENS',
      ),
      cacheMaxEntries: positiveInteger(
        source.GEMINI_CACHE_MAX_ENTRIES ?? '1000',
        'GEMINI_CACHE_MAX_ENTRIES',
      ),
      rateLimitCooldownMs: positiveInteger(
        source.GEMINI_RATE_LIMIT_COOLDOWN_MS ?? '3600000',
        'GEMINI_RATE_LIMIT_COOLDOWN_MS',
      ),
    },
  };
}

function commaList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function serviceUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Service URLs must use HTTP or HTTPS');
  }
  return url;
}

function optionalSecret(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function nonEmpty(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} must not be empty`);
  }
  return trimmed;
}
