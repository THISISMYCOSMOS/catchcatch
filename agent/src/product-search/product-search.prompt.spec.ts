import {
  buildProductSearchPrompt,
  CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS,
  PRODUCT_SEARCH_PROMPT_VERSION,
} from './product-search.prompt';
import { buildAllowedSearchDomains } from './product-search.service';

describe('CatchCatch product search prompt', () => {
  const input = {
    product_url: 'https://www.oliveyoung.co.kr/store/goods/example',
    anchor_product: {
      brand: '예시브랜드',
      normalized_product_name: '예시 세럼',
      product_type: '세럼',
      option: '기본',
      shade_or_scent: null,
      version_or_renewal: null,
      components: [],
    },
    brand_id: 'brand-example',
  };

  it('requires link-first exact-product search without making a judgment', () => {
    expect(PRODUCT_SEARCH_PROMPT_VERSION).toBe('catchcatch-product-search-v6');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('anchor_product를 유일한 기준 상품');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('유사상품 탐색은 별도 요청');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('ML과 G는 변환하지 않는다');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('네 판매처를 seller_results에 정확히 한 번씩');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('PRODUCT_SEARCH_PROVIDER_UNAVAILABLE');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('다른 사용자의 검색 결과를 기억하거나 재사용하지 않는다');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('백엔드의 신뢰된 브랜드 등록 정보');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('후보를 거부하거나 UNKNOWN으로 낮출 수 있다');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('observed_at은 생성하지 않는다');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('비로그인 공개 조건만');
  });

  it('limits the prompt to registered seller domains', () => {
    const domains = buildAllowedSearchDomains('brand.example.com');
    const prompt = buildProductSearchPrompt(input, domains, 'brand.example.com');
    expect(domains).toEqual([
      'oliveyoung.co.kr',
      'musinsa.com',
      'coupang.com',
      'brand.example.com',
    ]);
    expect(prompt).toContain('"product_url":"https://www.oliveyoung.co.kr/store/goods/example"');
    expect(prompt).toContain('"normalized_product_name":"예시 세럼"');
    expect(prompt).toContain('"allowed_domains"');
    expect(prompt).not.toContain('"brand_id"');
  });
});
