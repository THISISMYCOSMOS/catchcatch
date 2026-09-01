import { IncomingMessage, ServerResponse } from 'node:http';
import { CoreError } from './errors.js';

const MAX_PROXY_BODY_BYTES = 64 * 1024;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const PUBLIC_BACKEND_PREFIXES = [
  'auth',
  'price-alerts',
  'products',
  'sale-calendar',
  'saved-products',
  'search-quota',
  'user-preferences',
] as const;

export interface PublicApiProxy {
  forward(
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
  ): Promise<boolean>;
}

export class BackendPublicApiProxy implements PublicApiProxy {
  constructor(
    private readonly backendBaseUrl: URL,
    private readonly timeoutMs: number,
  ) {}

  async forward(
    request: IncomingMessage,
    response: ServerResponse,
    requestUrl: URL,
  ): Promise<boolean> {
    const backendPath = toBackendPath(requestUrl);
    if (backendPath === null) return false;

    const method = request.method ?? 'GET';
    if (!ALLOWED_METHODS.has(method)) {
      throw new CoreError(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청 방식입니다.');
    }

    const body = method === 'GET' ? undefined : await readProxyBody(request);
    let upstream: Response;
    try {
      upstream = await fetch(new URL(backendPath, this.backendBaseUrl), {
        method,
        headers: forwardedRequestHeaders(request),
        ...(body === undefined ? {} : { body: body.toString('utf8') }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new CoreError(
        error instanceof Error && error.name === 'TimeoutError' ? 504 : 502,
        error instanceof Error && error.name === 'TimeoutError'
          ? 'UPSTREAM_TIMEOUT'
          : 'UPSTREAM_NETWORK_ERROR',
        '사용자 서비스에 연결하지 못했습니다.',
      );
    }

    response.statusCode = upstream.status;
    const contentType = upstream.headers.get('content-type');
    if (contentType) response.setHeader('content-type', contentType);
    const setCookies = getSetCookies(upstream.headers)
      .map((cookie) => rewriteAuthCookiePath(cookie));
    if (setCookies.length > 0) response.setHeader('set-cookie', setCookies);

    const payload = Buffer.from(await upstream.arrayBuffer());
    response.end(payload);
    return true;
  }
}

function toBackendPath(requestUrl: URL): string | null {
  const match = /^\/api\/v1\/([^/]+)(\/.*)?$/.exec(requestUrl.pathname);
  const prefix = match?.[1];
  if (!prefix || !PUBLIC_BACKEND_PREFIXES.includes(prefix as typeof PUBLIC_BACKEND_PREFIXES[number])) {
    return null;
  }
  return `/${prefix}${match?.[2] ?? ''}${requestUrl.search}`;
}

function forwardedRequestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers({ accept: 'application/json' });
  copyHeader(request, headers, 'authorization');
  copyHeader(request, headers, 'content-type');
  copyHeader(request, headers, 'cookie');
  copyHeader(request, headers, 'x-request-id');
  return headers;
}

function copyHeader(request: IncomingMessage, target: Headers, name: string): void {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    if (value.length > 0) target.set(name, value.join(', '));
    return;
  }
  if (value) target.set(name, value);
}

async function readProxyBody(request: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_PROXY_BODY_BYTES) {
      throw new CoreError(413, 'REQUEST_TOO_LARGE', '요청 본문이 너무 큽니다.');
    }
    chunks.push(buffer);
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}

function getSetCookies(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof extended.getSetCookie === 'function') return extended.getSetCookie();
  const cookie = headers.get('set-cookie');
  return cookie ? [cookie] : [];
}

function rewriteAuthCookiePath(cookie: string): string {
  return cookie.replace(/Path=\/auth(?=;|$)/i, 'Path=/api/v1/auth');
}
