import { ConfigService } from '@nestjs/config';
import {
  assertAnchorProductUnchanged,
  buildAllowedSearchDomains,
  classifyOpenAISearchFailure,
  collectWebSearchSourceUrls,
  ProductSearchService,
  screenCandidateIdentity,
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
  it('does not run web search or silently mix sample data in sample mode', async () => {
    const service = new ProductSearchService(
      new ConfigService({ PRODUCT_DATA_MODE: 'sample' }),
    );
    await expect(service.searchSameProduct(input)).rejects.toThrow(
      'PRODUCT_DATA_MODE must be web_search',
    );
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
    const screened = screenCandidateIdentity(input.anchor_product, {
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
  });
});
