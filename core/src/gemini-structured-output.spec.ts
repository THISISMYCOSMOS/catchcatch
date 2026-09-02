import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CachedGeminiStructuredOutput,
  createGeminiCacheKey,
  GeminiJsonTransport,
  GeminiStructuredRequest,
} from './gemini-structured-output.js';

type TestCopy = { summary: string };

test('uses the template without calling Gemini when no API key is configured', async () => {
  const generator = new CachedGeminiStructuredOutput(null, 10, 60_000);

  const result = await generator.generate(request({ product: '크림' }));

  assert.deepEqual(result, {
    value: { summary: '기본 문구' },
    source: 'TEMPLATE',
    fallbackReason: 'NOT_CONFIGURED',
  });
});

test('caches validated JSON by template version and canonical facts', async () => {
  let calls = 0;
  const transport: GeminiJsonTransport = {
    async generateJson() {
      calls += 1;
      return { summary: '생성 문구' };
    },
  };
  const generator = new CachedGeminiStructuredOutput(transport, 10, 60_000);

  const first = await generator.generate(request({ product: '크림', price: 10000 }));
  const second = await generator.generate(request({ price: 10000, product: '크림' }));

  assert.equal(first.source, 'GEMINI');
  assert.deepEqual(second, { value: { summary: '생성 문구' }, source: 'CACHE' });
  assert.equal(calls, 1);
});

test('coalesces concurrent requests for the same price facts', async () => {
  let calls = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const transport: GeminiJsonTransport = {
    async generateJson() {
      calls += 1;
      await blocked;
      return { summary: '생성 문구' };
    },
  };
  const generator = new CachedGeminiStructuredOutput(transport, 10, 60_000);
  const input = request({ product: '세럼', price: 20000 });

  const first = generator.generate(input);
  const second = generator.generate(input);
  release();
  const results = await Promise.all([first, second]);

  assert.equal(calls, 1);
  assert.deepEqual(results[0].value, { summary: '생성 문구' });
  assert.deepEqual(results[1].value, { summary: '생성 문구' });
});

test('opens a cooldown circuit after a rate-limit response', async () => {
  let calls = 0;
  let now = 1_000;
  const transport: GeminiJsonTransport = {
    async generateJson() {
      calls += 1;
      throw Object.assign(new Error('quota exceeded'), { status: 429 });
    },
  };
  const generator = new CachedGeminiStructuredOutput(transport, 10, 60_000, () => now);

  const limited = await generator.generate(request({ product: '크림' }));
  now += 1_000;
  const suppressed = await generator.generate(request({ product: '세럼' }));

  assert.equal(limited.fallbackReason, 'RATE_LIMITED');
  assert.equal(suppressed.fallbackReason, 'RATE_LIMITED');
  assert.equal(calls, 1);
});

test('falls back when the response does not pass structural validation', async () => {
  const transport: GeminiJsonTransport = {
    async generateJson() { return { summary: 123 }; },
  };
  const generator = new CachedGeminiStructuredOutput(transport, 10, 60_000);

  const result = await generator.generate(request({ product: '크림' }));

  assert.equal(result.source, 'TEMPLATE');
  assert.equal(result.fallbackReason, 'INVALID_RESPONSE');
});

test('falls back when the Gemini request times out', async () => {
  const transport: GeminiJsonTransport = {
    async generateJson() {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      throw error;
    },
  };
  const generator = new CachedGeminiStructuredOutput(transport, 10, 60_000);

  const result = await generator.generate(request({ product: '크림' }));

  assert.equal(result.source, 'TEMPLATE');
  assert.equal(result.fallbackReason, 'TIMEOUT');
});

test('cache key changes with facts or template version', () => {
  const first = createGeminiCacheKey('v1', { price: 10000 });
  const reordered = createGeminiCacheKey('v1', { price: 10000 });
  const changedFacts = createGeminiCacheKey('v1', { price: 9000 });
  const changedTemplate = createGeminiCacheKey('v2', { price: 10000 });

  assert.equal(first, reordered);
  assert.notEqual(first, changedFacts);
  assert.notEqual(first, changedTemplate);
});

function request(facts: Record<string, unknown>): GeminiStructuredRequest<TestCopy> {
  return {
    templateVersion: 'copy-v1',
    facts,
    prompt: '테스트 프롬프트',
    responseJsonSchema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
      additionalProperties: false,
    },
    validate(value: unknown) {
      if (
        !value ||
        typeof value !== 'object' ||
        typeof (value as { summary?: unknown }).summary !== 'string'
      ) {
        throw new Error('invalid output');
      }
      return { summary: (value as { summary: string }).summary };
    },
    fallback: { summary: '기본 문구' },
  };
}
