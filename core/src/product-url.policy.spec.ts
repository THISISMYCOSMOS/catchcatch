import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreError } from './errors.js';
import { resolveAllowedProductDomains } from './product-url.policy.js';

test('allows an HTTPS product URL on a configured seller subdomain', () => {
  assert.deepEqual(
    resolveAllowedProductDomains(
      'https://m.coupang.com/vp/products/123?utm_source=test',
      ['coupang.com', 'oliveyoung.co.kr'],
    ),
    ['coupang.com'],
  );
});

test('rejects HTTP, credentials, ports, and unregistered domains', () => {
  const invalidUrls = [
    'http://www.coupang.com/product/1',
    'https://user:pass@coupang.com/product/1',
    'https://coupang.com:444/product/1',
    'https://coupang.com.example.com/product/1',
  ];
  for (const value of invalidUrls) {
    assert.throws(
      () => resolveAllowedProductDomains(value, ['coupang.com']),
      CoreError,
    );
  }
});
