import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from './config.js';

test('loads a single optional Gemini key with conservative defaults', () => {
  const config = loadConfig({
    INTERNAL_API_TOKEN: 'internal-test-token',
    GEMINI_API_KEY: '  gemini-test-key  ',
  });

  assert.deepEqual(config.gemini, {
    apiKey: 'gemini-test-key',
    model: 'gemini-2.5-flash-lite',
    timeoutMs: 8000,
    maxOutputTokens: 256,
    cacheMaxEntries: 1000,
    rateLimitCooldownMs: 3600000,
  });
});

test('keeps Core runnable with template fallback when Gemini is not configured', () => {
  const config = loadConfig({ INTERNAL_API_TOKEN: 'internal-test-token' });

  assert.equal(config.gemini.apiKey, null);
});
