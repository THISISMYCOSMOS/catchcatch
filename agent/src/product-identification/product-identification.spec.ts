import {
  buildProductIdentificationPrompt,
  CATCHCATCH_PRODUCT_IDENTIFICATION_INSTRUCTIONS,
  PRODUCT_IDENTIFICATION_PROMPT_VERSION,
} from './product-identification.prompt';
import {
  ProductIdentificationInput,
  validateProductIdentificationResult,
} from './product-identification.schema';

const input: ProductIdentificationInput = {
  product_url: 'https://www.oliveyoung.co.kr/store/goods/example',
  allowed_domains: ['oliveyoung.co.kr'],
};

const identified = {
  identification_status: 'IDENTIFIED',
  anchor_product: {
    brand: '예시브랜드',
    normalized_product_name: '예시 세럼',
    product_type: '세럼',
    option: null,
    shade_or_scent: null,
    version_or_renewal: null,
    components: [],
  },
  preview: {
    seller: 'OLIVE_YOUNG',
    listed_price: 25000,
    image_url: null,
  },
  source: {
    source_type: 'SELLER_PAGE',
    source_url: input.product_url,
    acquisition_method: 'AI_WEB_SEARCH',
    verification_status: 'UNVERIFIED',
  },
  warnings: [],
};

describe('conditional product identification prompt and contract', () => {
  it('keeps preview identification separate from cross-seller search', () => {
    expect(PRODUCT_IDENTIFICATION_PROMPT_VERSION).toBe('catchcatch-product-identification-v3');
    expect(CATCHCATCH_PRODUCT_IDENTIFICATION_INSTRUCTIONS).toContain('조건부 상품 식별기');
    expect(CATCHCATCH_PRODUCT_IDENTIFICATION_INSTRUCTIONS).toContain('다른 판매처 검색');
    expect(CATCHCATCH_PRODUCT_IDENTIFICATION_INSTRUCTIONS).toContain('과거 검색 결과를 기억하거나 재사용하지 않는다');
    expect(CATCHCATCH_PRODUCT_IDENTIFICATION_INSTRUCTIONS).toContain('observed_at은 생성하지 않는다');
    expect(buildProductIdentificationPrompt(input)).toContain('<product_identification_json>');
  });

  it('accepts a grounded identified product', () => {
    expect(validateProductIdentificationResult(
      input,
      identified,
      '2026-07-19T12:00:00+09:00',
    )).toMatchObject({
      identification_status: 'IDENTIFIED',
      source: {
        observed_at: '2026-07-19T12:00:00+09:00',
        verification_status: 'URL_VERIFIED',
      },
    });
  });

  it('rejects identified output without the minimum identity', () => {
    expect(() => validateProductIdentificationResult(input, {
      ...identified,
      anchor_product: { ...identified.anchor_product, brand: null },
    })).toThrow();
  });

  it('rejects a source outside the backend allowlist', () => {
    expect(() => validateProductIdentificationResult(input, {
      ...identified,
      source: { ...identified.source, source_url: 'https://forged.example/product' },
    })).toThrow('URL is outside registered seller domains');
  });

  it('rejects a seller code that conflicts with the input URL', () => {
    expect(() => validateProductIdentificationResult(input, {
      ...identified,
      preview: { ...identified.preview, seller: 'COUPANG' },
    })).toThrow('URL is outside registered seller domains');
  });

  it('rejects a different page even when it is on an allowed seller domain', () => {
    expect(() => validateProductIdentificationResult(input, {
      ...identified,
      source: {
        ...identified.source,
        source_url: 'https://www.oliveyoung.co.kr/store/goods/other',
      },
    })).toThrow('Identification source must match input product URL');
  });
});
