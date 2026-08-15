import { productSearchInputSchema } from '../product-search/product-search.schema';
import { productIdentificationInputSchema } from '../product-identification/product-identification.schema';
import { judgmentInputSchema } from '../ai-judgment/ai-judgment.schema';
import {
  MAX_ALLOWED_DOMAINS,
  MAX_COMPONENTS,
  MAX_IDENTITY_TEXT_LENGTH,
  MAX_INPUT_BYTES,
  MAX_JUDGMENT_FACTS,
  MAX_WARNING_LENGTH,
  MAX_WARNINGS,
} from './input-limits';

const anchorProduct = {
  brand: '예시브랜드',
  normalized_product_name: '예시 세럼',
  product_type: '세럼',
  option: null,
  shade_or_scent: null,
  version_or_renewal: null,
  components: [],
};

const searchInput = {
  product_url: 'https://www.oliveyoung.co.kr/store/goods/example',
  anchor_product: anchorProduct,
  brand_id: null,
};

const judgmentInput = {
  product_data_mode: 'sample' as const,
  product: { product_id: 'product-1', identity: anchorProduct },
  offers: [{
    offer_id: 'offer-oliveyoung',
    seller: 'OLIVE_YOUNG' as const,
    product_name: '예시 세럼',
    comparison_status: 'DIRECTLY_COMPARABLE' as const,
    components: [],
    public_effective_price: 25000,
    personalized_effective_price: null,
    personalized_price_status: 'NOT_EVALUATED' as const,
    unit_price: null,
    displayed_discount_rate: null,
    recent_average_discount_rate: 3.8,
    previous_sale_discount_rate: null,
    recent_average_price: 26000,
    previous_sale_price: null,
    shipping_fee: 0,
    source: {
      source_type: 'SELLER_PAGE' as const,
      source_url: 'https://www.oliveyoung.co.kr/store/goods/example',
      acquisition_method: 'AI_WEB_SEARCH' as const,
      observed_at: '2026-07-19T12:00:00+09:00',
      verification_status: 'CONTENT_VERIFIED' as const,
    },
  }],
  facts: [{
    id: 'fact-price',
    description: '현재 실구매가는 25,000원이다.',
    source_urls: ['https://www.oliveyoung.co.kr/store/goods/example'],
  }],
  selected_criteria: ['FINAL_PAYMENT_AMOUNT', 'PURCHASE_TIMING', 'SIMPLE_DISCOUNT'] as const,
  criterion_assessments: [
    { criterion: 'FINAL_PAYMENT_AMOUNT' as const, status: 'NEUTRAL' as const, fact_ids: ['fact-price'] },
    { criterion: 'PURCHASE_TIMING' as const, status: 'NEUTRAL' as const, fact_ids: [] },
    { criterion: 'SIMPLE_DISCOUNT' as const, status: 'UNKNOWN' as const, fact_ids: [] },
  ],
  comparison_price_basis: 'PUBLIC' as const,
  cheapest_offer_id: 'offer-oliveyoung',
  price_history_status: 'INSUFFICIENT' as const,
  data_quality: { status: 'PARTIAL' as const, warnings: [] },
  allowed_conclusions: ['NEAR_REGULAR_PRICE'] as const,
  allowed_offer_ids: ['offer-oliveyoung'],
};

describe('request input size limits', () => {
  it('accepts the ordinary payloads unchanged', () => {
    expect(productSearchInputSchema.safeParse(searchInput).success).toBe(true);
    expect(productIdentificationInputSchema.safeParse({
      product_url: searchInput.product_url,
      allowed_domains: ['oliveyoung.co.kr'],
    }).success).toBe(true);
    expect(judgmentInputSchema.safeParse(judgmentInput).success).toBe(true);
  });

  it('rejects the oversized brand name that used to pass (risk report P1)', () => {
    const result = productSearchInputSchema.safeParse({
      ...searchInput,
      anchor_product: { ...anchorProduct, brand: 'A'.repeat(100_000) },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a brand name exactly at the limit and rejects one character more', () => {
    const atLimit = 'A'.repeat(MAX_IDENTITY_TEXT_LENGTH);
    expect(productSearchInputSchema.safeParse({
      ...searchInput,
      anchor_product: { ...anchorProduct, brand: atLimit },
    }).success).toBe(true);
    expect(productSearchInputSchema.safeParse({
      ...searchInput,
      anchor_product: { ...anchorProduct, brand: `${atLimit}A` },
    }).success).toBe(false);
  });

  it('rejects too many components', () => {
    const component = { type: 'MAIN' as const, name: '본품', capacity_value: 50, capacity_unit: 'ML' as const, quantity: 1 };
    const result = productSearchInputSchema.safeParse({
      ...searchInput,
      anchor_product: {
        ...anchorProduct,
        components: Array.from({ length: MAX_COMPONENTS + 1 }, () => component),
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a request that serializes past the byte cap', () => {
    // Each component stays under the per-field limits; only the total is
    // abnormal, which is exactly what the byte cap is for.
    const component = {
      type: 'MAIN' as const,
      name: 'A'.repeat(200),
      capacity_value: 50,
      capacity_unit: 'ML' as const,
      quantity: 1,
    };
    const facts = Array.from({ length: MAX_JUDGMENT_FACTS }, (_, index) => ({
      id: `fact-${index}`,
      description: 'B'.repeat(1000),
      source_urls: [judgmentInput.offers[0].source.source_url],
    }));
    const warnings = Array.from({ length: MAX_WARNINGS }, () => 'C'.repeat(MAX_WARNING_LENGTH));
    const oversized = {
      ...judgmentInput,
      product: {
        ...judgmentInput.product,
        identity: { ...anchorProduct, components: Array.from({ length: MAX_COMPONENTS }, () => component) },
      },
      facts,
      data_quality: { ...judgmentInput.data_quality, warnings },
      criterion_assessments: judgmentInput.criterion_assessments.map((assessment) => ({
        ...assessment,
        fact_ids: [],
      })),
    };

    // Every individual field is within its own limit; only the total is not.
    expect(facts.length).toBeLessThanOrEqual(MAX_JUDGMENT_FACTS);
    expect(warnings.length).toBeLessThanOrEqual(MAX_WARNINGS);
    expect(Buffer.byteLength(JSON.stringify(oversized), 'utf8')).toBeGreaterThan(MAX_INPUT_BYTES);
    expect(judgmentInputSchema.safeParse(oversized).success).toBe(false);
  });

  it('rejects too many allowed domains on identification', () => {
    const result = productIdentificationInputSchema.safeParse({
      product_url: searchInput.product_url,
      allowed_domains: Array.from({ length: MAX_ALLOWED_DOMAINS + 1 }, (_, i) => `seller-${i}.co.kr`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects too many facts on judgment', () => {
    const result = judgmentInputSchema.safeParse({
      ...judgmentInput,
      facts: Array.from({ length: MAX_JUDGMENT_FACTS + 1 }, (_, index) => ({
        id: `fact-${index}`,
        description: '사실',
        source_urls: [judgmentInput.offers[0].source.source_url],
      })),
      criterion_assessments: judgmentInput.criterion_assessments.map((assessment) => ({
        ...assessment,
        fact_ids: [],
      })),
    });
    expect(result.success).toBe(false);
  });
});
