import { ConfigService } from '@nestjs/config';
import {
  MAX_CONFIGURATION_OFFERS_PER_SELLER,
  configurationCandidateAiSchema,
  productConfigurationSearchInputSchema,
  productConfigurationSearchAiResultSchema,
} from './product-configuration-search.schema';
import {
  CATCHCATCH_PRODUCT_CONFIGURATION_SEARCH_INSTRUCTIONS,
  PRODUCT_CONFIGURATION_SEARCH_PROMPT_VERSION,
  buildProductConfigurationSearchPrompt,
} from './product-configuration-search.prompt';
import {
  ProductSearchService,
  buildAllowedSearchDomainsForSellers,
  buildConfigurationCandidateResult,
  calculateMainCapacityTotal,
  resolveConfigurationTargetSellers,
  screenAlternativeConfigurationCandidate,
  verifyAndPromoteConfigurationCandidate,
} from './product-search.service';

const anchor = {
  brand: '라운드랩',
  normalized_product_name: '1025 독도 선크림',
  product_type: '선크림',
  option: '50ml 2개',
  shade_or_scent: null,
  version_or_renewal: null,
  components: [{
    type: 'MAIN' as const,
    name: '1025 독도 선크림',
    capacity_value: 50,
    capacity_unit: 'ML' as const,
    quantity: 2,
  }],
};

const input = {
  product_url: 'https://www.coupang.com/vp/products/6598003859',
  anchor_product: anchor,
  brand_id: null,
};

const aiCandidate = {
  candidate_offer: {
    product_name: '1025 독도 선크림',
    brand: '라운드랩',
    product_type: '선크림',
    option: '70ml 1개',
    shade_or_scent: null,
    version_or_renewal: null,
    list_price: 25000,
    listed_sale_price: 20000,
    public_coupon_amount: null,
    automatic_discount_amount: null,
    shipping_fee: 0,
    discount_conditions: [],
    shipping_condition: '무료배송',
    components: [{
      type: 'MAIN' as const,
      name: '1025 독도 선크림',
      capacity_value: 70,
      capacity_unit: 'ML' as const,
      quantity: 1,
    }],
  },
  same_product_evidence: ['브랜드와 상품명이 동일함'],
  configuration_difference_evidence: ['70ml 단품 구성'],
  source: {
    source_type: 'SELLER_PAGE' as const,
    source_url: 'https://www.coupang.com/vp/products/123',
    acquisition_method: 'AI_WEB_SEARCH' as const,
    verification_status: 'UNVERIFIED' as const,
  },
};

function sellerResult(seller: 'OLIVE_YOUNG' | 'MUSINSA_BEAUTY' | 'COUPANG' | 'BRAND_OFFICIAL') {
  return {
    seller,
    availability: seller === 'COUPANG' ? 'AVAILABLE' as const : 'UNKNOWN' as const,
    candidates: seller === 'COUPANG' ? [aiCandidate] : [],
    notes: [],
  };
}

describe('product configuration search contract', () => {
  it('accepts only the selected registered sellers and allows up to three candidates per seller', () => {
    const parsed = productConfigurationSearchAiResultSchema.safeParse({
      anchor_product: anchor,
      seller_results: [
        sellerResult('OLIVE_YOUNG'),
        sellerResult('MUSINSA_BEAUTY'),
        sellerResult('COUPANG'),
        sellerResult('BRAND_OFFICIAL'),
      ],
      warnings: [],
    });
    expect(parsed.success).toBe(true);
    expect(MAX_CONFIGURATION_OFFERS_PER_SELLER).toBe(3);
  });

  it('rejects candidates without same-product or configuration-difference evidence', () => {
    expect(configurationCandidateAiSchema.safeParse({
      ...aiCandidate,
      same_product_evidence: [],
    }).success).toBe(false);
    expect(configurationCandidateAiSchema.safeParse({
      ...aiCandidate,
      configuration_difference_evidence: [],
    }).success).toBe(false);
  });

  it('accepts one selected seller but rejects duplicate seller results', () => {
    expect(productConfigurationSearchAiResultSchema.safeParse({
      anchor_product: anchor,
      seller_results: [sellerResult('COUPANG')],
      warnings: [],
    }).success).toBe(true);
    expect(productConfigurationSearchAiResultSchema.safeParse({
      anchor_product: anchor,
      seller_results: [sellerResult('COUPANG'), sellerResult('COUPANG')],
      warnings: [],
    }).success).toBe(false);
  });

  it('rejects duplicate target sellers and candidate limits outside 1..3', () => {
    expect(productConfigurationSearchInputSchema.safeParse({
      ...input,
      target_sellers: ['COUPANG', 'COUPANG'],
    }).success).toBe(false);
    expect(productConfigurationSearchInputSchema.safeParse({
      ...input,
      max_candidates_per_seller: 4,
    }).success).toBe(false);
  });

  it('accepts a cautious AI UNKNOWN with candidates so service code can verify them', () => {
    expect(productConfigurationSearchAiResultSchema.safeParse({
      anchor_product: anchor,
      seller_results: [
        sellerResult('OLIVE_YOUNG'),
        sellerResult('MUSINSA_BEAUTY'),
        { ...sellerResult('COUPANG'), availability: 'UNKNOWN' },
        sellerResult('BRAND_OFFICIAL'),
      ],
      warnings: [],
    }).success).toBe(true);
  });
});

describe('product configuration search prompt', () => {
  it('searches only another configuration of the same product and prohibits AI price conversion', () => {
    expect(PRODUCT_CONFIGURATION_SEARCH_PROMPT_VERSION).toBe(
      'catchcatch-product-configuration-search-v1',
    );
    expect(CATCHCATCH_PRODUCT_CONFIGURATION_SEARCH_INSTRUCTIONS).toContain(
      '다른 용량·구성 검색기',
    );
    expect(CATCHCATCH_PRODUCT_CONFIGURATION_SEARCH_INSTRUCTIONS).toContain(
      '유사상품이나 대체상품',
    );
    expect(CATCHCATCH_PRODUCT_CONFIGURATION_SEARCH_INSTRUCTIONS).toContain(
      '환산 가격, 용량당 가격, 최저가, 추천을 계산하지 않는다',
    );
    const prompt = buildProductConfigurationSearchPrompt(
      input,
      ['coupang.com'],
      null,
      ['COUPANG'],
      2,
    );
    expect(prompt).toContain('"target_sellers":["COUPANG"]');
    expect(prompt).toContain('"max_candidates_per_seller":2');
    expect(prompt).toContain('"normalized_product_name":"1025 독도 선크림"');
  });
});

describe('deterministic alternative-configuration screening and conversion', () => {
  const promoted = {
    ...aiCandidate,
    source: {
      ...aiCandidate.source,
      observed_at: '2026-08-16T12:00:00+09:00',
      verification_status: 'URL_VERIFIED' as const,
    },
  };

  it('sums MAIN capacity only', () => {
    expect(calculateMainCapacityTotal([
      ...anchor.components,
      {
        type: 'MINI',
        name: '미니 증정품',
        capacity_value: 10,
        capacity_unit: 'ML',
        quantity: 5,
      },
    ])).toEqual({ unit: 'ML', totalAmount: 100 });
  });

  it('calculates an anchor-capacity equivalent price from the displayed price', () => {
    const result = buildConfigurationCandidateResult(anchor, promoted);
    expect(result).toMatchObject({
      comparison_status: 'UNIT_COMPARABLE',
      price_basis: 'LISTED_SALE_PRICE',
      basis_price: 20000,
      capacity_unit: 'ML',
      anchor_main_total_amount: 100,
      candidate_main_total_amount: 70,
      equivalent_price: 28571,
    });
  });

  it('does not invent an equivalent price for a different capacity unit', () => {
    const result = buildConfigurationCandidateResult(anchor, {
      ...promoted,
      candidate_offer: {
        ...promoted.candidate_offer,
        components: [{
          ...promoted.candidate_offer.components[0],
          capacity_unit: 'G' as const,
        }],
      },
    });
    expect(result.comparison_status).toBe('NOT_COMPARABLE');
    expect(result.equivalent_price).toBeNull();
  });

  it('rejects the exact anchor configuration and a different shade or scent', () => {
    expect(screenAlternativeConfigurationCandidate(anchor, {
      ...aiCandidate.candidate_offer,
      option: anchor.option,
      components: anchor.components,
    }).reasons).toContain('candidate configuration is identical to the verified anchor');

    expect(screenAlternativeConfigurationCandidate(
      { ...anchor, shade_or_scent: '무향' },
      { ...aiCandidate.candidate_offer, shade_or_scent: '라벤더향' },
    ).reasons).toContain('shade_or_scent conflicts with the verified anchor');
  });

  it('accepts Musinsa-style promotion, capacity and gift text around the same core product name', () => {
    const screened = screenAlternativeConfigurationCandidate(anchor, {
      ...aiCandidate.candidate_offer,
      product_name: '[무신사단독] 1025 독도 선크림 50ml (+클렌저 40ml 증정)',
      product_type: '선케어/선크림',
      option: '50ml + 클렌저 40ml',
      components: [
        ...aiCandidate.candidate_offer.components,
        {
          type: 'OTHER_COSMETIC',
          name: '독도 클렌저',
          capacity_value: 40,
          capacity_unit: 'ML',
          quantity: 1,
        },
      ],
    });
    expect(screened).toEqual({ accepted: true, reasons: [], warnings: [] });
  });

  it('promotes only a seller-matching URL returned by web search', () => {
    const sourceUrl = aiCandidate.source.source_url;
    expect(verifyAndPromoteConfigurationCandidate(aiCandidate, 'COUPANG', {
      allowedDomains: ['coupang.com'],
      brandOfficialDomain: null,
      searchSourceUrls: new Set([sourceUrl]),
      observedAt: '2026-08-16T03:00:00.000Z',
    }).result?.source.verification_status).toBe('URL_VERIFIED');

    expect(verifyAndPromoteConfigurationCandidate(aiCandidate, 'OLIVE_YOUNG', {
      allowedDomains: ['coupang.com'],
      brandOfficialDomain: null,
      searchSourceUrls: new Set([sourceUrl]),
      observedAt: '2026-08-16T03:00:00.000Z',
    }).result).toBeNull();
  });
});

describe('ProductSearchService alternative-configuration mode', () => {
  it('defaults to the source seller plus one comparison seller', () => {
    expect(resolveConfigurationTargetSellers(input)).toEqual([
      'COUPANG',
      'MUSINSA_BEAUTY',
    ]);
    expect(buildAllowedSearchDomainsForSellers(
      ['COUPANG', 'MUSINSA_BEAUTY'],
      null,
    )).toEqual(['coupang.com', 'musinsa.com']);
  });

  it('honors an explicit later-load seller selection', () => {
    expect(resolveConfigurationTargetSellers({
      ...input,
      target_sellers: ['OLIVE_YOUNG'],
    })).toEqual(['OLIVE_YOUNG']);
  });

  it('returns schema-valid labeled sample data without OpenAI', async () => {
    const service = new ProductSearchService(
      new ConfigService({ PRODUCT_DATA_MODE: 'sample' }),
    );
    const result = await service.searchAlternativeConfigurations(input);
    expect(result.seller_results).toHaveLength(2);
    expect(result.seller_results.map((entry) => entry.seller)).toEqual([
      'COUPANG',
      'MUSINSA_BEAUTY',
    ]);
    expect(result.seller_results.find((entry) => entry.seller === 'COUPANG')).toMatchObject({
      availability: 'AVAILABLE',
    });
    expect(result.warnings.some((warning) => warning.includes('sample data'))).toBe(true);
  });
});
