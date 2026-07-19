import {
  buildProductSearchPrompt,
  CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS,
  PRODUCT_SEARCH_PROMPT_VERSION,
} from './product-search.prompt';
import { buildAllowedSearchDomains } from './product-search.service';

describe('CatchCatch product search prompt', () => {
  const input = {
    product_url: 'https://www.oliveyoung.co.kr/store/goods/example',
    brand_official_domain: 'brand.example.com',
  };

  it('requires link-first exact-product search without making a judgment', () => {
    expect(PRODUCT_SEARCH_PROMPT_VERSION).toBe('catchcatch-product-search-v1');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('기준 상품(anchor_product)');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('유사 상품 추천을 생성하지 않는다');
    expect(CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS).toContain('ML과 G는 변환하지 않는다');
  });

  it('limits the prompt to registered seller domains', () => {
    const domains = buildAllowedSearchDomains(input);
    const prompt = buildProductSearchPrompt(input, domains);
    expect(domains).toEqual([
      'oliveyoung.co.kr',
      'musinsa.com',
      'coupang.com',
      'brand.example.com',
    ]);
    expect(prompt).toContain('"product_url":"https://www.oliveyoung.co.kr/store/goods/example"');
    expect(prompt).toContain('"allowed_domains"');
  });
});
