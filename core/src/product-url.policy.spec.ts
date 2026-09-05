import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreError } from './errors.js';
import { resolveProductSourceDomain } from './product-url.policy.js';

test('allows any public HTTPS product host as an identification source', () => {
  assert.deepEqual(
    resolveProductSourceDomain('https://shop.example-brand.co.kr/products/123?utm_source=test'),
    ['shop.example-brand.co.kr'],
  );
});

test('rejects HTTP, credentials, ports, and non-public hosts', () => {
  const invalidUrls = [
    'http://www.coupang.com/product/1',
    'https://user:pass@coupang.com/product/1',
    'https://coupang.com:444/product/1',
    'https://127.0.0.1/product/1',
    'https://localhost/product/1',
    'https://catalog.internal/product/1',
  ];
  for (const value of invalidUrls) {
    assert.throws(
      () => resolveProductSourceDomain(value),
      CoreError,
    );
  }
});
