import {
  collectAnchorProductWarnings,
  productSearchInputSchema,
  productSearchResultSchema,
  sellerSearchResultSchema,
} from './product-search.schema';

const source = {
  source_type: 'SELLER_PAGE' as const,
  source_url: 'https://www.oliveyoung.co.kr/store/goods/example',
  acquisition_method: 'AI_WEB_SEARCH' as const,
  observed_at: '2026-07-19T12:00:00+09:00',
  verification_status: 'UNVERIFIED' as const,
};

const offer = {
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
};

const anchorProduct = {
  brand: '예시브랜드',
  normalized_product_name: '예시 세럼',
  product_type: '세럼',
  option: null,
  shade_or_scent: null,
  version_or_renewal: null,
  components: [],
};

describe('product search output contract', () => {
  it('requires an offer and source for AVAILABLE', () => {
    expect(sellerSearchResultSchema.safeParse({
      seller: 'OLIVE_YOUNG',
      availability: 'AVAILABLE',
      candidate_offer: null,
      match_evidence: [],
      mismatch_reasons: [],
      source: null,
    }).success).toBe(false);
  });

  it('requires explicit identity evidence for AVAILABLE', () => {
    expect(sellerSearchResultSchema.safeParse({
      seller: 'OLIVE_YOUNG',
      availability: 'AVAILABLE',
      candidate_offer: offer,
      match_evidence: [],
      mismatch_reasons: [],
      source,
    }).success).toBe(false);
  });

  it('rejects invented offers for UNKNOWN and NOT_AVAILABLE', () => {
    expect(sellerSearchResultSchema.safeParse({
      seller: 'OLIVE_YOUNG',
      availability: 'UNKNOWN',
      candidate_offer: offer,
      match_evidence: [],
      mismatch_reasons: ['옵션을 확인할 수 없음'],
      source,
    }).success).toBe(false);
  });

  const unavailable = (seller: string) => ({
    seller,
    availability: 'NOT_AVAILABLE',
    candidate_offer: null,
    match_evidence: [],
    mismatch_reasons: [],
    source: null,
  });

  const available = {
    seller: 'OLIVE_YOUNG',
    availability: 'AVAILABLE',
    candidate_offer: offer,
    match_evidence: ['브랜드와 옵션 일치'],
    mismatch_reasons: [],
    source,
  };

  it('accepts all five registered sellers with no coverage warning', () => {
    const valid = productSearchResultSchema.safeParse({
      anchor_product: anchorProduct,
      seller_results: [
        available,
        unavailable('MUSINSA_BEAUTY'),
        unavailable('COUPANG'),
        unavailable('ZIGZAG'),
        unavailable('BRAND_OFFICIAL'),
      ],
      warnings: [],
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.warnings).toEqual([]);
    }
  });

  it('accepts four distinct sellers and warns about the one omitted seller', () => {
    const valid = productSearchResultSchema.safeParse({
      anchor_product: anchorProduct,
      seller_results: [
        available,
        unavailable('MUSINSA_BEAUTY'),
        unavailable('COUPANG'),
        unavailable('ZIGZAG'),
      ],
      warnings: [],
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.warnings).toEqual([
        'Seller result omitted for registered seller BRAND_OFFICIAL; coverage was not checked',
      ]);
    }
  });

  it('rejects fewer than four distinct sellers', () => {
    const invalid = productSearchResultSchema.safeParse({
      anchor_product: anchorProduct,
      seller_results: [
        available,
        unavailable('MUSINSA_BEAUTY'),
        unavailable('COUPANG'),
      ],
      warnings: [],
    });
    expect(invalid.success).toBe(false);
  });

  it('rejects a duplicated seller even when the array is otherwise full', () => {
    const duplicateSeller = {
      anchor_product: anchorProduct,
      seller_results: [
        available,
        unavailable('MUSINSA_BEAUTY'),
        unavailable('COUPANG'),
        unavailable('ZIGZAG'),
        { ...unavailable('COUPANG') },
      ],
      warnings: [],
    };
    expect(productSearchResultSchema.safeParse(duplicateSeller).success).toBe(false);
  });

  it('counts a present-but-NOT_AVAILABLE seller toward the floor without an "omitted" warning', () => {
    const valid = productSearchResultSchema.safeParse({
      anchor_product: anchorProduct,
      seller_results: [
        available,
        unavailable('MUSINSA_BEAUTY'),
        unavailable('COUPANG'),
        unavailable('ZIGZAG'),
        unavailable('BRAND_OFFICIAL'),
      ],
      warnings: [],
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.warnings.some((warning) => warning.includes('omitted'))).toBe(false);
    }
  });
});

describe('product search input contract (T4)', () => {
  it('accepts a null product_type as long as brand and product name are present', () => {
    expect(productSearchInputSchema.safeParse({
      product_url: 'https://www.oliveyoung.co.kr/store/goods/example',
      anchor_product: { ...anchorProduct, product_type: null },
      brand_id: null,
    }).success).toBe(true);
  });

  it('still rejects a missing brand', () => {
    expect(productSearchInputSchema.safeParse({
      product_url: 'https://www.oliveyoung.co.kr/store/goods/example',
      anchor_product: { ...anchorProduct, brand: null },
      brand_id: null,
    }).success).toBe(false);
  });

  it('still rejects a missing normalized product name', () => {
    expect(productSearchInputSchema.safeParse({
      product_url: 'https://www.oliveyoung.co.kr/store/goods/example',
      anchor_product: { ...anchorProduct, normalized_product_name: null },
      brand_id: null,
    }).success).toBe(false);
  });

  it('warns about a missing product_type and stays silent when it is present', () => {
    expect(collectAnchorProductWarnings({ product_type: null })).toEqual([
      'anchor_product.product_type is missing; search proceeded without a verified product type',
    ]);
    expect(collectAnchorProductWarnings({ product_type: '세럼' })).toEqual([]);
  });
});
