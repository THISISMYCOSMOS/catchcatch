import { CoreError } from './errors.js';

export type CoreConfig = {
  port: number;
  allowedOrigins: string[];
  allowedProductDomains: string[];
  backendBaseUrl: URL;
  agentBaseUrl: URL;
  internalApiToken: string;
  upstreamTimeoutMs: number;
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
      source.ALLOWED_PRODUCT_DOMAINS ?? 'coupang.com,oliveyoung.co.kr,musinsa.com',
    ),
    backendBaseUrl: serviceUrl(source.BACKEND_BASE_URL ?? 'http://127.0.0.1:3000'),
    agentBaseUrl: serviceUrl(source.AGENT_BASE_URL ?? 'http://127.0.0.1:3001'),
    internalApiToken,
    upstreamTimeoutMs: positiveInteger(
      source.UPSTREAM_TIMEOUT_MS ?? '25000',
      'UPSTREAM_TIMEOUT_MS',
    ),
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
