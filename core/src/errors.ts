export class CoreError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CoreError';
  }
}

export class UpstreamError extends CoreError {
  constructor(
    readonly service: 'backend' | 'agent',
    readonly upstreamStatus: number,
    details: unknown,
  ) {
    super(
      upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502,
      'UPSTREAM_REQUEST_FAILED',
      `${service} request failed`,
      sanitizeUpstreamDetails(details),
    );
  }
}

function sanitizeUpstreamDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { code: 'UPSTREAM_ERROR' };
  }
  const source = value as Record<string, unknown>;
  const allowedKeys = ['code', 'reason', 'retryable'];
  return Object.fromEntries(
    allowedKeys
      .filter((key) => ['string', 'boolean'].includes(typeof source[key]))
      .map((key) => [key, source[key]]),
  );
}
