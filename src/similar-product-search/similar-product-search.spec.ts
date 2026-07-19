import {
  buildSimilarProductSearchPrompt,
  CATCHCATCH_SIMILAR_PRODUCT_SEARCH_INSTRUCTIONS,
  SIMILAR_PRODUCT_SEARCH_PROMPT_VERSION,
} from './similar-product-search.prompt';
import {
  SimilarProductSearchInput,
  validateSimilarProductSearchResult,
} from './similar-product-search.schema';

const input: SimilarProductSearchInput = {
  anchor_product_id: 'product-anchor',
  anchor_product: {
    brand: '기준브랜드',
    normalized_product_name: '기준 선크림',
    product_type: '선크림',
    option: null,
    shade_or_scent: null,
    version_or_renewal: null,
    components: [],
  },
  selected_criteria: ['FINAL_PAYMENT_AMOUNT', 'UNIT_PRICE', 'SIMPLE_DISCOUNT'],
  allowed_domains: ['oliveyoung.co.kr'],
  excluded_source_urls: ['https://www.oliveyoung.co.kr/store/goods/anchor'],
  max_candidates: 3,
};

const result = {
  search_status: 'FOUND',
  candidates: [{
    product: {
      brand: '대체브랜드',
      normalized_product_name: '대체 선크림',
      product_type: '선크림',
      option: null,
      shade_or_scent: null,
      version_or_renewal: null,
      components: [],
    },
    seller: 'OLIVE_YOUNG',
    listed_price: 19000,
    similarity_reason: '같은 선케어 유형입니다.',
    meaningful_differences: ['브랜드가 다릅니다.'],
    matched_criteria: ['FINAL_PAYMENT_AMOUNT'],
    source: {
      source_type: 'SELLER_PAGE',
      source_url: 'https://www.oliveyoung.co.kr/store/goods/similar',
      acquisition_method: 'AI_WEB_SEARCH',
      verification_status: 'UNVERIFIED',
    },
  }],
  warnings: [],
};

describe('similar-product search prompt and contract', () => {
  it('defines a separate on-demand search role', () => {
    expect(SIMILAR_PRODUCT_SEARCH_PROMPT_VERSION).toBe('catchcatch-similar-product-search-v3');
    expect(CATCHCATCH_SIMILAR_PRODUCT_SEARCH_INSTRUCTIONS).toContain('유사한 이유와 의미 있는 차이점');
    expect(CATCHCATCH_SIMILAR_PRODUCT_SEARCH_INSTRUCTIONS).toContain('기준 상품 자체');
    expect(CATCHCATCH_SIMILAR_PRODUCT_SEARCH_INSTRUCTIONS).toContain('과거 분석이나 다른 사용자의 유사상품 결과를 재사용하지 않는다');
    expect(CATCHCATCH_SIMILAR_PRODUCT_SEARCH_INSTRUCTIONS).toContain('observed_at은 생성하지 않는다');
    expect(buildSimilarProductSearchPrompt(input)).toContain('<similar_product_search_json>');
  });

  it('accepts a grounded candidate from an allowed seller', () => {
    expect(validateSimilarProductSearchResult(
      input,
      result,
      '2026-07-19T12:00:00+09:00',
    )).toMatchObject({
      search_status: 'FOUND',
      candidates: [{
        source: {
          observed_at: '2026-07-19T12:00:00+09:00',
          verification_status: 'UNVERIFIED',
        },
      }],
    });
  });

  it('rejects the anchor product itself', () => {
    expect(() => validateSimilarProductSearchResult(input, {
      ...result,
      candidates: [{
        ...result.candidates[0],
        product: input.anchor_product,
      }],
    })).toThrow('Anchor product was returned as a similar product');
  });

  it('rejects candidates outside allowed seller domains', () => {
    expect(() => validateSimilarProductSearchResult(input, {
      ...result,
      candidates: [{
        ...result.candidates[0],
        source: {
          ...result.candidates[0].source,
          source_url: 'https://forged.example/product',
        },
      }],
    })).toThrow('URL is outside registered seller domains');
  });

  it('rejects a seller code that conflicts with the source domain', () => {
    expect(() => validateSimilarProductSearchResult(input, {
      ...result,
      candidates: [{
        ...result.candidates[0],
        seller: 'COUPANG',
      }],
    })).toThrow('URL is outside registered seller domains');
  });

  it('allows an honest empty result instead of fabricated candidates', () => {
    expect(validateSimilarProductSearchResult(input, {
      search_status: 'NO_MATCH',
      candidates: [],
      warnings: ['검증 가능한 후보가 없습니다.'],
    }).candidates).toEqual([]);
  });
});
