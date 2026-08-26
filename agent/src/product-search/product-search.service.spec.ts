import { ConfigService } from '@nestjs/config';
import {
  assertAnchorProductUnchanged,
  buildAllowedSearchDomains,
  buildBrandOfficialDomainWarnings,
  classifyOpenAISearchFailure,
  collectWebSearchSourceUrls,
  identifySellerForUrl,
  ProductSearchService,
  screenCandidateIdentity,
  verifyAndPromoteSellerResult,
} from './product-search.service';

const input = {
  product_url: 'https://www.oliveyoung.co.kr/store/goods/example',
  anchor_product: {
    brand: '예시브랜드',
    normalized_product_name: '예시 세럼',
    product_type: '세럼',
    option: null,
    shade_or_scent: null,
    version_or_renewal: null,
    components: [],
  },
  brand_id: null,
};

describe('ProductSearchService mode boundaries', () => {
  it('returns schema-valid, clearly-labeled sample data without calling OpenAI in sample mode', async () => {
    const service = new ProductSearchService(
      new ConfigService({ PRODUCT_DATA_MODE: 'sample' }),
    );
    const result = await service.searchSameProduct(input);
    expect(result.anchor_product).toEqual(input.anchor_product);
    expect(result.seller_results).toHaveLength(5);
    expect(result.seller_results.map((item) => item.seller).sort()).toEqual(
      ['BRAND_OFFICIAL', 'COUPANG', 'MUSINSA_BEAUTY', 'OLIVE_YOUNG', 'ZIGZAG'].sort(),
    );
    expect(result.warnings.some((warning) => warning.includes('sample data'))).toBe(true);

    const brandOfficial = result.seller_results.find((item) => item.seller === 'BRAND_OFFICIAL');
    expect(brandOfficial).toMatchObject({ availability: 'UNKNOWN', candidate_offer: null, source: null });
    expect(result.warnings.some((warning) => warning.includes('discovery does not run in sample mode'))).toBe(true);
  });

  it('defaults to sample mode when PRODUCT_DATA_MODE is unset, matching .env.example', async () => {
    const service = new ProductSearchService(new ConfigService({}));
    await expect(service.searchSameProduct(input)).resolves.toMatchObject({
      anchor_product: input.anchor_product,
    });
  });

  it('accepts an anchor product with a null product_type and surfaces a warning (T4)', async () => {
    const service = new ProductSearchService(
      new ConfigService({ PRODUCT_DATA_MODE: 'sample' }),
    );
    const result = await service.searchSameProduct({
      ...input,
      anchor_product: { ...input.anchor_product, product_type: null },
    });
    expect(result.warnings.some((warning) => warning.includes('product_type'))).toBe(true);
  });

  it('still rejects a missing anchor brand or product name (T4)', () => {
    const service = new ProductSearchService(
      new ConfigService({ PRODUCT_DATA_MODE: 'sample' }),
    );
    return Promise.all([
      expect(service.searchSameProduct({
        ...input,
        anchor_product: { ...input.anchor_product, brand: null },
      })).rejects.toThrow(),
      expect(service.searchSameProduct({
        ...input,
        anchor_product: { ...input.anchor_product, normalized_product_name: null },
      })).rejects.toThrow(),
    ]);
  });

  it.each([
    ['https://www.oliveyoung.co.kr/store/goods/1', null, 'OLIVE_YOUNG'],
    ['https://www.musinsa.com/products/1', null, 'MUSINSA_BEAUTY'],
    ['https://www.coupang.com/vp/products/1', null, 'COUPANG'],
    ['https://zigzag.kr/catalog/products/1', null, 'ZIGZAG'],
    ['https://brand.example.com/products/1', 'brand.example.com', 'BRAND_OFFICIAL'],
  ])('identifies the seller for %s', (url, officialDomain, expectedSeller) => {
    expect(identifySellerForUrl(url, officialDomain)).toBe(expectedSeller);
  });

  describe('buildBrandOfficialDomainWarnings', () => {
    it('always warns that a discovered domain is unverified', () => {
      const warnings = buildBrandOfficialDomainWarnings('예시브랜드', 'example.co.kr');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('example.co.kr');
      expect(warnings[0]).toContain('not verified');
    });

    it('adds the foreign-storefront warning on top for a non-.kr domain', () => {
      const warnings = buildBrandOfficialDomainWarnings('예시브랜드', 'example.com');
      expect(warnings).toHaveLength(2);
      expect(warnings.some((warning) => warning.includes('not verified'))).toBe(true);
      expect(warnings.some((warning) => warning.includes('does not end in .kr'))).toBe(true);
    });
  });

  it('requires an API key in web_search mode', async () => {
    const service = new ProductSearchService(
      new ConfigService({ PRODUCT_DATA_MODE: 'web_search' }),
    );
    await service.searchSameProduct(input).then(
      () => { throw new Error('Expected provider failure'); },
      (error: { getResponse: () => unknown }) => {
        expect(error.getResponse()).toEqual({
          code: 'PRODUCT_SEARCH_PROVIDER_UNAVAILABLE',
          provider: 'OPENAI_WEB_SEARCH',
          reason: 'SEARCH_CREDENTIALS_MISSING',
          retryable: false,
        });
      },
    );
  });

  it.each([
    [undefined, 'SEARCH_NETWORK_ERROR', true],
    [401, 'SEARCH_CREDENTIALS_MISSING', false],
    [403, 'SEARCH_ACCESS_DENIED', false],
    [429, 'SEARCH_RATE_LIMITED', true],
    [400, 'SEARCH_TOOL_UNAVAILABLE', false],
    [503, 'SEARCH_PROVIDER_ERROR', true],
  ])('classifies provider failure status %s', (status, code, retryable) => {
    expect(classifyOpenAISearchFailure(status)).toEqual({ code, retryable });
  });

  it('extracts only URLs supplied by web search actions', () => {
    const urls = collectWebSearchSourceUrls([
      {
        type: 'web_search_call',
        action: {
          type: 'search',
          sources: [
            { type: 'url', url: 'https://www.oliveyoung.co.kr/store/goods/1' },
          ],
        },
      },
      {
        type: 'web_search_call',
        action: {
          type: 'open_page',
          url: 'https://www.coupang.com/vp/products/2',
        },
      },
      { type: 'message', content: [{ url: 'https://forged.example/product' }] },
    ]);

    expect(urls).toEqual(new Set([
      'https://www.oliveyoung.co.kr/store/goods/1',
      'https://www.coupang.com/vp/products/2',
    ]));
  });

  it('builds seller domains only from the trusted official-domain value', () => {
    expect(buildAllowedSearchDomains('brand.example.com')).toEqual([
      'oliveyoung.co.kr',
      'musinsa.com',
      'coupang.com',
      'zigzag.kr',
      'brand.example.com',
    ]);
  });

  it('rejects an AI response that changes the verified anchor', () => {
    expect(() => assertAnchorProductUnchanged(input.anchor_product, {
      ...input.anchor_product,
      option: '다른 옵션',
    })).toThrow('AI changed the verified anchor product');
  });

  it('downgrades a contradictory candidate instead of treating it as available', () => {
    const { result: screened, warnings } = screenCandidateIdentity(input.anchor_product, {
      seller: 'OLIVE_YOUNG',
      availability: 'AVAILABLE',
      candidate_offer: {
        product_name: '다른 크림',
        brand: '다른브랜드',
        product_type: '크림',
        option: null,
        shade_or_scent: null,
        version_or_renewal: null,
        list_price: 30000,
        listed_sale_price: 25000,
        public_coupon_amount: null,
        automatic_discount_amount: null,
        shipping_fee: 0,
        discount_conditions: [],
        shipping_condition: null,
        components: [],
      },
      match_evidence: ['AI가 동일상품으로 추정함'],
      mismatch_reasons: [],
      source: {
        source_type: 'SELLER_PAGE',
        source_url: input.product_url,
        acquisition_method: 'AI_WEB_SEARCH',
        observed_at: '2026-07-19T12:00:00+09:00',
        verification_status: 'URL_VERIFIED',
      },
    });

    expect(screened).toMatchObject({
      availability: 'UNKNOWN',
      candidate_offer: null,
      match_evidence: [],
    });
    expect(screened.mismatch_reasons).toContain(
      'brand conflicts with the verified anchor',
    );
    expect(warnings).toEqual([]);
  });

  describe('screenCandidateIdentity null anchor product_type (T7)', () => {
    const matchingCandidateOffer = {
      product_name: input.anchor_product.normalized_product_name,
      brand: input.anchor_product.brand,
      product_type: '크림',
      option: null,
      shade_or_scent: null,
      version_or_renewal: null,
      list_price: 30000,
      listed_sale_price: 25000,
      public_coupon_amount: null,
      automatic_discount_amount: null,
      shipping_fee: 0,
      discount_conditions: [],
      shipping_condition: null,
      components: [],
    };
    const availableSellerResult = {
      seller: 'OLIVE_YOUNG' as const,
      availability: 'AVAILABLE' as const,
      candidate_offer: matchingCandidateOffer,
      match_evidence: ['브랜드와 상품명 일치'],
      mismatch_reasons: [],
      source: {
        source_type: 'SELLER_PAGE' as const,
        source_url: input.product_url,
        acquisition_method: 'AI_WEB_SEARCH' as const,
        observed_at: '2026-07-19T12:00:00+09:00',
        verification_status: 'URL_VERIFIED' as const,
      },
    };

    it('does not downgrade a candidate with a populated product_type when the anchor product_type is null, and warns instead', () => {
      const { result, warnings } = screenCandidateIdentity(
        { ...input.anchor_product, product_type: null },
        availableSellerResult,
      );
      expect(result.availability).toBe('AVAILABLE');
      expect(result.candidate_offer).not.toBeNull();
      expect(warnings.some((warning) => warning.includes('product_type was not compared'))).toBe(true);
    });

    it('still downgrades when the candidate product_type is missing but the anchor has one', () => {
      const { result, warnings } = screenCandidateIdentity(
        input.anchor_product,
        { ...availableSellerResult, candidate_offer: { ...matchingCandidateOffer, product_type: null } },
      );
      expect(result.availability).toBe('UNKNOWN');
      expect(result.mismatch_reasons).toContain('product_type is missing');
      expect(warnings).toEqual([]);
    });

    it('still downgrades on a genuine product_type conflict when both sides are known', () => {
      const { result } = screenCandidateIdentity(
        input.anchor_product,
        { ...availableSellerResult, candidate_offer: { ...matchingCandidateOffer, product_type: '완전히 다른 유형' } },
      );
      expect(result.availability).toBe('UNKNOWN');
      expect(result.mismatch_reasons).toContain('product_type conflicts with the verified anchor');
    });
  });

  describe('verifyAndPromoteSellerResult (T6)', () => {
    const observedAt = '2026-07-19T12:00:00+09:00';
    const allowedDomains = ['oliveyoung.co.kr', 'musinsa.com', 'coupang.com'];

    it('promotes a source that matches its seller and was returned by web search', () => {
      const sourceUrl = 'https://www.oliveyoung.co.kr/store/goods/example';
      const { result, warning } = verifyAndPromoteSellerResult(
        {
          seller: 'OLIVE_YOUNG',
          availability: 'NOT_AVAILABLE',
          candidate_offer: null,
          match_evidence: [],
          mismatch_reasons: [],
          source: {
            source_type: 'SELLER_PAGE',
            source_url: sourceUrl,
            acquisition_method: 'AI_WEB_SEARCH',
            verification_status: 'UNVERIFIED',
          },
        },
        {
          allowedDomains,
          brandOfficialDomain: null,
          searchSourceUrls: new Set([sourceUrl]),
          observedAt,
        },
      );
      expect(warning).toBeNull();
      expect(result.source).toMatchObject({ verification_status: 'URL_VERIFIED', observed_at: observedAt });
    });

    it('downgrades a single BRAND_OFFICIAL entry instead of throwing when no domain was discovered', () => {
      const sourceUrl = 'https://official.example.com/products/1';
      const { result, warning } = verifyAndPromoteSellerResult(
        {
          seller: 'BRAND_OFFICIAL',
          availability: 'AVAILABLE',
          candidate_offer: {
            product_name: '예시 세럼',
            brand: '예시브랜드',
            product_type: '세럼',
            option: null,
            shade_or_scent: null,
            version_or_renewal: null,
            list_price: 30000,
            listed_sale_price: 25000,
            public_coupon_amount: null,
            automatic_discount_amount: null,
            shipping_fee: 0,
            discount_conditions: [],
            shipping_condition: null,
            components: [],
          },
          match_evidence: ['모델이 발견했다고 주장'],
          mismatch_reasons: [],
          source: {
            source_type: 'SELLER_PAGE',
            source_url: sourceUrl,
            acquisition_method: 'AI_WEB_SEARCH',
            verification_status: 'UNVERIFIED',
          },
        },
        {
          allowedDomains: [...allowedDomains, 'official.example.com'],
          brandOfficialDomain: null,
          searchSourceUrls: new Set([sourceUrl]),
          observedAt,
        },
      );
      expect(result).toMatchObject({ availability: 'UNKNOWN', candidate_offer: null, source: null });
      expect(warning).toContain('BRAND_OFFICIAL');
      expect(warning).toContain('downgraded to UNKNOWN');
    });

    it('leaves a sourceless entry unchanged', () => {
      const { result, warning } = verifyAndPromoteSellerResult(
        {
          seller: 'COUPANG',
          availability: 'NOT_AVAILABLE',
          candidate_offer: null,
          match_evidence: [],
          mismatch_reasons: [],
          source: null,
        },
        {
          allowedDomains,
          brandOfficialDomain: null,
          searchSourceUrls: new Set(),
          observedAt,
        },
      );
      expect(result.source).toBeNull();
      expect(warning).toBeNull();
    });
  });
});
