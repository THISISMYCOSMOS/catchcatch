import { randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import {
  AnalysisAccessRequest,
  AnalysisRequest,
  AnalysisResult,
  BackendAnalysis,
  RecentAnalysesRequest,
} from './contracts.js';
import { CoreError } from './errors.js';

const MAX_BODY_BYTES = 16 * 1024;

export type AnalysisHandler = {
  analyze(request: AnalysisRequest): Promise<AnalysisResult>;
  findRecentAnalyses(request: RecentAnalysesRequest): Promise<BackendAnalysis[]>;
  findAnalysis(request: AnalysisAccessRequest): Promise<BackendAnalysis>;
  deleteAnalysis(request: AnalysisAccessRequest): Promise<void>;
};

export function createCoreServer(
  orchestrator: AnalysisHandler,
  allowedOrigins: readonly string[],
) {
  return createServer(async (request, response) => {
    const requestId = safeRequestId(request.headers['x-request-id']) ?? randomUUID();
    setSecurityHeaders(response, requestId);
    if (!applyCors(request, response, allowedOrigins)) return;

    try {
      const requestUrl = new URL(request.url ?? '/', 'http://core.local');
      if (request.method === 'GET' && requestUrl.pathname === '/health') {
        return sendJson(response, 200, { status: 'ok' });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/v1/analyses') {
        const authorization = requireBearerToken(request);
        requireJsonContentType(request);
        const body = await readJsonBody(request);
        rejectUnknownKeys(body, ['sourceUrl', 'idempotencyKey']);
        const sourceUrl = requireString(body, 'sourceUrl');
        const idempotencyKey = optionalString(body, 'idempotencyKey') ?? requestId;
        const result = await orchestrator.analyze({
          sourceUrl,
          idempotencyKey,
          authorization,
        });
        return sendJson(response, 201, result);
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/v1/analyses/recent') {
        const authorization = requireBearerToken(request);
        const limit = optionalSingleQueryParameter(requestUrl, 'limit');
        const result = await orchestrator.findRecentAnalyses({
          authorization,
          ...(limit === undefined ? {} : { limit }),
        });
        return sendJson(response, 200, result);
      }
      const analysisId = matchAnalysisId(requestUrl.pathname);
      if (request.method === 'GET' && analysisId !== null) {
        const authorization = requireBearerToken(request);
        const result = await orchestrator.findAnalysis({ analysisId, authorization });
        return sendJson(response, 200, result);
      }
      if (request.method === 'DELETE' && analysisId !== null) {
        const authorization = requireBearerToken(request);
        await orchestrator.deleteAnalysis({ analysisId, authorization });
        response.statusCode = 204;
        response.end();
        return;
      }
      return sendJson(response, 404, {
        code: 'ROUTE_NOT_FOUND',
        message: '요청 경로를 찾을 수 없습니다.',
        requestId,
      });
    } catch (error) {
      const normalized = normalizeError(error);
      return sendJson(response, normalized.status, {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details === undefined ? {} : { details: normalized.details }),
        requestId,
      });
    }
  });
}

function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: readonly string[],
): boolean {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    response.statusCode = 403;
    response.end();
    return false;
  }
  if (origin) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'Origin');
    response.setHeader('access-control-allow-headers', 'authorization, content-type, x-request-id');
    response.setHeader('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS');
  }
  if (request.method === 'OPTIONS') {
    response.statusCode = origin && allowedOrigins.includes(origin) ? 204 : 403;
    response.end();
    return false;
  }
  return true;
}

function setSecurityHeaders(response: ServerResponse, requestId: string): void {
  response.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-request-id', requestId);
}

function requireBearerToken(request: IncomingMessage): string {
  const value = request.headers.authorization;
  if (!value || !/^Bearer\s+\S+$/i.test(value)) {
    throw new CoreError(401, 'AUTHORIZATION_REQUIRED', '로그인이 필요합니다.');
  }
  return value;
}

function requireJsonContentType(request: IncomingMessage): void {
  const contentType = request.headers['content-type'];
  if (!contentType?.toLowerCase().startsWith('application/json')) {
    throw new CoreError(415, 'UNSUPPORTED_MEDIA_TYPE', 'application/json 요청만 지원합니다.');
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new CoreError(413, 'REQUEST_TOO_LARGE', '요청 본문이 너무 큽니다.');
    }
    chunks.push(buffer);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new CoreError(400, 'INVALID_JSON', 'JSON 요청 본문이 올바르지 않습니다.');
  }
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new CoreError(400, 'INVALID_REQUEST', `${key} is required`);
  }
  return value.trim();
}

function optionalString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw new CoreError(400, 'INVALID_REQUEST', `${key} is invalid`);
  }
  return value.trim();
}

function rejectUnknownKeys(
  body: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new CoreError(400, 'UNKNOWN_REQUEST_FIELD', '지원하지 않는 요청 필드가 있습니다.');
  }
}

function optionalSingleQueryParameter(url: URL, key: string): string | undefined {
  const values = url.searchParams.getAll(key);
  if (values.length > 1) {
    throw new CoreError(400, 'INVALID_REQUEST', `${key} must be provided once`);
  }
  return values[0];
}

function matchAnalysisId(pathname: string): string | null {
  const match = /^\/api\/v1\/analyses\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  const encodedAnalysisId = match[1];
  if (!encodedAnalysisId) return null;
  try {
    return decodeURIComponent(encodedAnalysisId);
  } catch {
    throw new CoreError(400, 'INVALID_REQUEST', 'analysisId is invalid');
  }
}

function safeRequestId(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[A-Za-z0-9._-]{1,128}$/.test(candidate) ? candidate : null;
}

function normalizeError(error: unknown): CoreError {
  if (error instanceof CoreError) return error;
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new CoreError(504, 'UPSTREAM_TIMEOUT', '분석 서비스 응답 시간이 초과되었습니다.');
  }
  return new CoreError(500, 'INTERNAL_ERROR', '요청을 처리하지 못했습니다.');
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}
