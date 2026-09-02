import { createHash } from 'node:crypto';
import { ApiError, GoogleGenAI } from '@google/genai';
import { GeminiConfig } from './config.js';

export type GeminiOutputSource = 'GEMINI' | 'CACHE' | 'TEMPLATE';

export type GeminiFallbackReason =
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'UPSTREAM_ERROR';

export type GeminiOutput<T> = {
  value: T;
  source: GeminiOutputSource;
  fallbackReason?: GeminiFallbackReason;
};

export type GeminiStructuredRequest<T> = {
  templateVersion: string;
  facts: Record<string, unknown>;
  prompt: string;
  responseJsonSchema: Record<string, unknown>;
  validate(value: unknown): T;
  fallback: T;
};

export interface GeminiJsonTransport {
  generateJson(
    prompt: string,
    responseJsonSchema: Record<string, unknown>,
  ): Promise<unknown>;
}

export class GoogleGeminiJsonTransport implements GeminiJsonTransport {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly maxOutputTokens: number,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateJson(
    prompt: string,
    responseJsonSchema: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        abortSignal: AbortSignal.timeout(this.timeoutMs),
        temperature: 0.2,
        maxOutputTokens: this.maxOutputTokens,
        responseMimeType: 'application/json',
        responseJsonSchema,
      },
    });
    const text = response.text?.trim();
    if (!text) {
      throw new InvalidGeminiResponseError('Gemini returned an empty response');
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new InvalidGeminiResponseError('Gemini returned malformed JSON');
    }
  }
}

export class CachedGeminiStructuredOutput {
  private readonly cache = new Map<string, unknown>();
  private readonly inFlight = new Map<string, Promise<GeminiOutput<unknown>>>();
  private rateLimitedUntil = 0;

  constructor(
    private readonly transport: GeminiJsonTransport | null,
    private readonly cacheMaxEntries: number,
    private readonly rateLimitCooldownMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async generate<T>(request: GeminiStructuredRequest<T>): Promise<GeminiOutput<T>> {
    const cacheKey = createGeminiCacheKey(request.templateVersion, request.facts);
    const cached = this.readCache<T>(cacheKey);
    if (cached !== undefined) {
      return { value: cached, source: 'CACHE' };
    }
    if (!this.transport) {
      return templateFallback(request.fallback, 'NOT_CONFIGURED');
    }
    if (this.rateLimitedUntil > this.now()) {
      return templateFallback(request.fallback, 'RATE_LIMITED');
    }

    const existing = this.inFlight.get(cacheKey);
    if (existing) {
      return existing as Promise<GeminiOutput<T>>;
    }

    const pending = this.generateUncached(cacheKey, request) as Promise<GeminiOutput<unknown>>;
    this.inFlight.set(cacheKey, pending);
    try {
      return await pending as GeminiOutput<T>;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async generateUncached<T>(
    cacheKey: string,
    request: GeminiStructuredRequest<T>,
  ): Promise<GeminiOutput<T>> {
    try {
      const raw = await this.transport!.generateJson(request.prompt, request.responseJsonSchema);
      let value: T;
      try {
        value = request.validate(raw);
      } catch {
        throw new InvalidGeminiResponseError('Gemini response failed structural validation');
      }
      this.writeCache(cacheKey, value);
      return { value: clone(value), source: 'GEMINI' };
    } catch (error) {
      const reason = classifyGeminiFailure(error);
      if (reason === 'RATE_LIMITED') {
        this.rateLimitedUntil = this.now() + this.rateLimitCooldownMs;
      }
      return templateFallback(request.fallback, reason);
    }
  }

  private readCache<T>(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value === undefined) return undefined;
    this.cache.delete(key);
    this.cache.set(key, value);
    return clone(value as T);
  }

  private writeCache<T>(key: string, value: T): void {
    this.cache.delete(key);
    this.cache.set(key, clone(value));
    while (this.cache.size > this.cacheMaxEntries) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}

export function createGeminiStructuredOutput(config: GeminiConfig): CachedGeminiStructuredOutput {
  const transport = config.apiKey
    ? new GoogleGeminiJsonTransport(
      config.apiKey,
      config.model,
      config.timeoutMs,
      config.maxOutputTokens,
    )
    : null;
  return new CachedGeminiStructuredOutput(
    transport,
    config.cacheMaxEntries,
    config.rateLimitCooldownMs,
  );
}

export function createGeminiCacheKey(
  templateVersion: string,
  facts: Record<string, unknown>,
): string {
  return createHash('sha256')
    .update(templateVersion)
    .update('\n')
    .update(canonicalJson(facts))
    .digest('hex');
}

class InvalidGeminiResponseError extends Error {}

function classifyGeminiFailure(error: unknown): GeminiFallbackReason {
  if (error instanceof ApiError && error.status === 429) return 'RATE_LIMITED';
  if (hasStatus(error, 429)) return 'RATE_LIMITED';
  if (error instanceof InvalidGeminiResponseError || error instanceof SyntaxError) {
    return 'INVALID_RESPONSE';
  }
  if (error instanceof Error && (
    error.name === 'TimeoutError' ||
    error.name === 'AbortError'
  )) {
    return 'TIMEOUT';
  }
  return 'UPSTREAM_ERROR';
}

function hasStatus(error: unknown, status: number): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: unknown }).status === status,
  );
}

function templateFallback<T>(value: T, reason: GeminiFallbackReason): GeminiOutput<T> {
  return { value: clone(value), source: 'TEMPLATE', fallbackReason: reason };
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
