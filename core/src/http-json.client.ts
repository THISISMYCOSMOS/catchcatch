import { UpstreamError } from './errors.js';

type ServiceName = 'backend' | 'agent';

export class HttpJsonClient {
  constructor(
    private readonly service: ServiceName,
    private readonly baseUrl: URL,
    private readonly timeoutMs: number,
    private readonly defaultHeaders: Readonly<Record<string, string>> = {},
  ) {}

  async request<T>(
    path: string,
    options: {
      method?: string;
      headers?: Readonly<Record<string, string>>;
      body?: unknown;
    } = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        method: options.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...this.defaultHeaders,
          ...options.headers,
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new UpstreamError(this.service, 502, {
        code: error instanceof Error && error.name === 'TimeoutError'
          ? 'UPSTREAM_TIMEOUT'
          : 'UPSTREAM_NETWORK_ERROR',
        retryable: true,
      });
    }
    const payload = await readJson(response);
    if (!response.ok) {
      throw new UpstreamError(this.service, response.status, payload);
    }
    return payload as T;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { code: 'UPSTREAM_INVALID_JSON' };
  }
}
