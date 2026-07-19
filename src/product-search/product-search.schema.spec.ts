import {
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

  it('requires all four registered sellers exactly once', () => {
    const unavailable = (seller: string) => ({
      seller,
      availability: 'NOT_AVAILABLE',
      candidate_offer: null,
      match_evidence: [],
      mismatch_reasons: [],
      source: null,
    });
    const valid = productSearchResultSchema.safeParse({
      anchor_product: anchorProduct,
      seller_results: [
        {
          seller: 'OLIVE_YOUNG',
          availability: 'AVAILABLE',
          candidate_offer: offer,
          match_evidence: ['브랜드와 옵션 일치'],
          mismatch_reasons: [],
          source,
        },
        unavailable('MUSINSA_BEAUTY'),
        unavailable('COUPANG'),
        unavailable('BRAND_OFFICIAL'),
      ],
      warnings: [],
    });
    expect(valid.success).toBe(true);

    const duplicateSeller = valid.success
      ? {
          ...valid.data,
          seller_results: valid.data.seller_results.map((item, index) => (
            index === 3 ? { ...item, seller: 'COUPANG' as const } : item
          )),
        }
      : null;
    expect(productSearchResultSchema.safeParse(duplicateSeller).success).toBe(false);
  });
});
