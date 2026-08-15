import {
  assertSellerMatchesUrl,
  brandNameMismatchWarning,
  foreignStorefrontWarning,
  gateBrandOfficialDomainCandidate,
  inferBrandOfficialDomain,
  normalizeSellerPageUrl,
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

  describe('gateBrandOfficialDomainCandidate (T5)', () => {
    it('accepts a plausible .kr brand domain with no warning', () => {
      expect(gateBrandOfficialDomainCandidate('roundlab.co.kr')).toEqual({
        accepted: true,
        domain: 'roundlab.co.kr',
        warning: null,
      });
    });

    it('accepts a .com brand domain but attaches a foreign-storefront warning', () => {
      const result = gateBrandOfficialDomainCandidate('innisfree.com');
      expect(result.accepted).toBe(true);
      if (result.accepted) {
        expect(result.domain).toBe('innisfree.com');
        expect(result.warning).toContain('does not end in .kr');
      }
    });

    it.each([
      'smartstore.naver.com',
      'shop.smartstore.naver.com',
      'brand.naver.com',
      '11st.co.kr',
      'gmarket.co.kr',
      'auction.co.kr',
      'ssg.com',
      'lotteon.com',
      'tmon.co.kr',
      'wemakeprice.com',
    ])('rejects the marketplace/department-store host %s', (host) => {
      const result = gateBrandOfficialDomainCandidate(host);
      expect(result.accepted).toBe(false);
    });

    it.each([
      'oliveyoung.co.kr',
      'shop.oliveyoung.co.kr',
      'musinsa.com',
      'coupang.com',
    ])('rejects a fixed seller domain %s as a brand-official candidate', (host) => {
      const result = gateBrandOfficialDomainCandidate(host);
      expect(result.accepted).toBe(false);
    });

    it.each([
      'shopping.naver.com',
      'interpark.com',
      'qoo10.com',
      'aliexpress.com',
      'lotteimall.com',
      'gsshop.com',
      'cjonstyle.com',
      'hmall.com',
    ])('rejects the additional marketplace/home-shopping host %s', (host) => {
      expect(gateBrandOfficialDomainCandidate(host).accepted).toBe(false);
    });

    it.each([
      'cafe24.com',
      'examplebrand.cafe24.com',
      'examplebrand.myshopify.com',
      'examplebrand.imweb.me',
      'examplebrand.sixshop.com',
      'examplebrand.wixsite.com',
    ])('rejects the storefront-builder host %s', (host) => {
      expect(gateBrandOfficialDomainCandidate(host).accepted).toBe(false);
    });

    it.each([
      // Raw unicode: URL encodes these to xn-- before the check sees them.
      '이니스프리.kr',
      'аpple.com', // leading Cyrillic "а", visually identical to ASCII "a"
      // Already-encoded form of the same class.
      'xn--80ak6aa92e.com',
    ])('rejects the homograph/IDN candidate %s', (host) => {
      const result = gateBrandOfficialDomainCandidate(host);
      expect(result.accepted).toBe(false);
      if (!result.accepted) {
        expect(result.reason).toContain('punycode');
      }
    });

    it('still accepts an ordinary ASCII brand domain after the IDN check', () => {
      expect(gateBrandOfficialDomainCandidate('roundlab.co.kr').accepted).toBe(true);
    });

    it('rejects a malformed candidate instead of throwing', () => {
      const result = gateBrandOfficialDomainCandidate('not a domain');
      expect(result.accepted).toBe(false);
    });
  });

  describe('brandNameMismatchWarning', () => {
    it.each([
      ['Innisfree', 'innisfree.com'],
      ['Dr.Jart+', 'drjart.com'],
      ['3CE', '3ce.co.kr'],
      ['Beauty of Joseon', 'beautyofjoseon.com'],
      // A different arrangement of the same words still shares a token.
      ['Beauty of Joseon', 'joseonbeauty.com'],
    ])('is null when domain %s carries the brand name %s', (brand, domain) => {
      expect(brandNameMismatchWarning(brand, domain)).toBeNull();
    });

    it('warns when the domain has nothing to do with the brand name', () => {
      expect(brandNameMismatchWarning('Innisfree', 'cosmeticshop.co.kr'))
        .toContain('contains no part of the brand name');
    });

    it('is non-discriminating for a Korean-only brand name', () => {
      expect(brandNameMismatchWarning('이니스프리', 'innisfree.com')).toBeNull();
      expect(brandNameMismatchWarning('이니스프리', 'unrelated.co.kr')).toBeNull();
    });

    it('does not catch a typosquat that embeds the brand name', () => {
      // Documented limitation, asserted so it stays a known gap rather than
      // an assumed defense: this check cannot tell a squat from the real one.
      expect(brandNameMismatchWarning('Innisfree', 'innisfree-kr.com')).toBeNull();
    });
  });

  describe('foreignStorefrontWarning', () => {
    it('is null for a .kr domain and non-null otherwise', () => {
      expect(foreignStorefrontWarning('roundlab.co.kr')).toBeNull();
      expect(foreignStorefrontWarning('innisfree.com')).not.toBeNull();
    });
  });
});
