import {
  assertSellerMatchesUrl,
  inferBrandOfficialDomain,
  normalizeSellerPageUrl,
  parseBrandOfficialDomainRegistry,
} from './seller-domain.policy';

describe('seller domain policy', () => {
  it('rejects a seller code that does not match the source domain', () => {
    expect(() => assertSellerMatchesUrl(
      'COUPANG',
      'https://www.oliveyoung.co.kr/store/goods/1',
      null,
    )).toThrow('URL is outside registered seller domains');
  });

  it('accepts only the registered official domain for an official seller', () => {
    expect(() => assertSellerMatchesUrl(
      'BRAND_OFFICIAL',
      'https://shop.brand.example/products/1',
      'brand.example',
    )).not.toThrow();
  });

  it('normalizes tracking variants to the same seller page', () => {
    expect(normalizeSellerPageUrl(
      'https://example.com/product/1/?utm_source=test&ref=abc&option=2#detail',
    )).toBe('https://example.com/product/1?option=2');
  });

  it('infers exactly one non-fixed domain as the official domain', () => {
    expect(inferBrandOfficialDomain([
      'oliveyoung.co.kr',
      'brand.example',
    ])).toBe('brand.example');
    expect(inferBrandOfficialDomain([
      'brand-a.example',
      'brand-b.example',
    ])).toBeNull();
  });

  it('parses a trusted brand-id registry and rejects invalid JSON', () => {
    expect(parseBrandOfficialDomainRegistry(
      '{"brand-roundlab":"https://roundlab.co.kr"}',
    ).get('brand-roundlab')).toBe('roundlab.co.kr');
    expect(() => parseBrandOfficialDomainRegistry('{invalid')).toThrow(
      'BRAND_OFFICIAL_DOMAINS_JSON must be valid JSON',
    );
  });
});
