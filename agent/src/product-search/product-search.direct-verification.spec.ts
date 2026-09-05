import { ConfigService } from '@nestjs/config';

jest.mock('openai', () => {
  const parse = jest.fn();
  class MockAPIError extends Error {}
  const MockOpenAI = jest.fn(() => ({ responses: { parse } }));
  Object.assign(MockOpenAI, { APIError: MockAPIError, __parse: parse });
  return { __esModule: true, default: MockOpenAI };
});

// eslint-disable-next-line import/order
import OpenAI from 'openai';
import {
  ProductSearchService,
  extractZigzagSellerPageFacts,
} from './product-search.service';

const parseMock = (OpenAI as unknown as { __parse: jest.Mock }).__parse;
const musinsaUrl = 'https://www.musinsa.com/products/2782655';
const oliveYoungUrl = 'https://www.oliveyoung.co.kr/store/goods/example';
const zigzagUrl = 'https://store.zigzag.kr/catalog/products/169600571?browsing_type=NATIVE_BROWSER';
const input = {
  product_url: 'https://www.oliveyoung.co.kr/store/goods/example',
  brand_id: null,
  anchor_product: {
    brand: '예시브랜드',
    normalized_product_name: '예시 세럼',
    product_type: '세럼',
    option: null,
    shade_or_scent: null,
    version_or_renewal: null,
    components: [{
      type: 'MAIN' as const,
      name: '예시 세럼',
      capacity_value: 50,
      capacity_unit: 'ML' as const,
      quantity: 1,
    }],
  },
};

function unavailableSeller(seller: 'OLIVE_YOUNG' | 'MUSINSA_BEAUTY' | 'COUPANG' | 'ZIGZAG' | 'BRAND_OFFICIAL') {
  return {
    seller,
    availability: 'UNKNOWN' as const,
    candidate_offer: null,
    match_evidence: [],
    mismatch_reasons: [],
    source: null,
  };
}

function musinsaSearchResponse(prices: { list: number | null; sale: number | null }) {
  return {
    output: [{
      type: 'web_search_call',
      action: {
        type: 'search',
        sources: [{ type: 'url', url: musinsaUrl }],
      },
    }],
    output_parsed: {
      anchor_product: input.anchor_product,
      warnings: [],
      seller_results: [
        unavailableSeller('OLIVE_YOUNG'),
        {
          seller: 'MUSINSA_BEAUTY' as const,
          availability: 'AVAILABLE' as const,
          candidate_offer: {
            product_name: input.anchor_product.normalized_product_name,
            brand: input.anchor_product.brand,
            product_type: input.anchor_product.product_type,
            option: null,
            shade_or_scent: null,
            version_or_renewal: null,
            list_price: prices.list,
            listed_sale_price: prices.sale,
            public_coupon_amount: 1_000,
            automatic_discount_amount: 500,
            shipping_fee: 3_000,
            discount_conditions: [],
            shipping_condition: null,
            components: [],
          },
          match_evidence: ['brand, product name, and product type match the verified anchor'],
          mismatch_reasons: [],
          source: {
            source_type: 'SELLER_PAGE',
            source_url: musinsaUrl,
            acquisition_method: 'AI_WEB_SEARCH',
            verification_status: 'UNVERIFIED',
          },
        },
        unavailableSeller('COUPANG'),
        unavailableSeller('ZIGZAG'),
        unavailableSeller('BRAND_OFFICIAL'),
      ],
    },
  };
}

function oliveYoungSearchResponse() {
  return {
    output: [{
      type: 'web_search_call',
      action: {
        type: 'search',
        sources: [{ type: 'url', url: oliveYoungUrl }],
      },
    }],
    output_parsed: {
      anchor_product: input.anchor_product,
      warnings: [],
      seller_results: [
        {
          seller: 'OLIVE_YOUNG' as const,
          availability: 'AVAILABLE' as const,
          candidate_offer: {
            product_name: input.anchor_product.normalized_product_name,
            brand: input.anchor_product.brand,
            product_type: input.anchor_product.product_type,
            option: null,
            shade_or_scent: null,
            version_or_renewal: null,
            list_price: 25_000,
            listed_sale_price: 17_900,
            public_coupon_amount: null,
            automatic_discount_amount: null,
            shipping_fee: null,
            discount_conditions: [],
            shipping_condition: null,
            components: [],
          },
          match_evidence: ['brand, product name, and product type match the verified anchor'],
          mismatch_reasons: [],
          source: {
            source_type: 'SELLER_PAGE',
            source_url: oliveYoungUrl,
            acquisition_method: 'AI_WEB_SEARCH',
            verification_status: 'UNVERIFIED',
          },
        },
        unavailableSeller('MUSINSA_BEAUTY'),
        unavailableSeller('COUPANG'),
        unavailableSeller('ZIGZAG'),
        unavailableSeller('BRAND_OFFICIAL'),
      ],
    },
  };
}

function zigzagSearchResponse() {
  return {
    output: [{
      type: 'web_search_call',
      action: {
        type: 'search',
        sources: [{ type: 'url', url: zigzagUrl }],
      },
    }],
    output_parsed: {
      anchor_product: input.anchor_product,
      warnings: [],
      seller_results: [
        unavailableSeller('OLIVE_YOUNG'),
        unavailableSeller('MUSINSA_BEAUTY'),
        unavailableSeller('COUPANG'),
        {
          seller: 'ZIGZAG' as const,
          availability: 'AVAILABLE' as const,
          candidate_offer: {
            product_name: input.anchor_product.normalized_product_name,
            brand: input.anchor_product.brand,
            product_type: input.anchor_product.product_type,
            option: null,
            shade_or_scent: null,
            version_or_renewal: null,
            list_price: 30_000,
            listed_sale_price: 25_000,
            public_coupon_amount: 1_000,
            automatic_discount_amount: 500,
            shipping_fee: 3_000,
            discount_conditions: ['AI가 반환한 미검증 조건'],
            shipping_condition: 'AI가 반환한 미검증 배송 조건',
            components: [],
          },
          match_evidence: ['brand, product name, and product type match the verified anchor'],
          mismatch_reasons: [],
          source: {
            source_type: 'SELLER_PAGE',
            source_url: zigzagUrl,
            acquisition_method: 'AI_WEB_SEARCH',
            verification_status: 'UNVERIFIED',
          },
        },
        unavailableSeller('BRAND_OFFICIAL'),
      ],
    },
  };
}

function zigzagConfigurationSearchResponse() {
  return {
    output: [{
      type: 'web_search_call',
      action: {
        type: 'search',
        sources: [{ type: 'url', url: zigzagUrl }],
      },
    }],
    output_parsed: {
      anchor_product: input.anchor_product,
      warnings: [],
      seller_results: [{
        seller: 'ZIGZAG' as const,
        availability: 'AVAILABLE' as const,
        candidates: [{
          relation_type: 'SAME_PRODUCT_CONFIGURATION' as const,
          candidate_offer: {
            product_name: input.anchor_product.normalized_product_name,
            brand: input.anchor_product.brand,
            product_type: input.anchor_product.product_type,
            option: '100ml 1개',
            shade_or_scent: null,
            version_or_renewal: null,
            list_price: 30_000,
            listed_sale_price: 25_000,
            public_coupon_amount: null,
            automatic_discount_amount: null,
            shipping_fee: null,
            discount_conditions: [],
            shipping_condition: null,
            components: [{
              type: 'MAIN' as const,
              name: input.anchor_product.normalized_product_name,
              capacity_value: 100,
              capacity_unit: 'ML' as const,
              quantity: 1,
            }],
          },
          relation_evidence: ['verified anchor brand and product name match'],
          configuration_difference_evidence: ['50ml configuration'],
          source: {
            source_type: 'SELLER_PAGE',
            source_url: zigzagUrl,
            acquisition_method: 'AI_WEB_SEARCH',
            verification_status: 'UNVERIFIED',
          },
        }],
        notes: [],
      }],
    },
  };
}

function zigzagPage(overrides: {
  id?: string;
  name?: string;
  purchasable?: boolean;
  listPrice?: number;
  salePrice?: number;
  couponPrice?: number | null;
  couponAmount?: number | null;
  shippingFee?: number;
  essentialCapacity?: string;
} = {}): string {
  const salePrice = overrides.salePrice ?? 24_270;
  const couponPrice = overrides.couponPrice === undefined ? 18_200 : overrides.couponPrice;
  const couponAmount = overrides.couponAmount === undefined ? 6_070 : overrides.couponAmount;
  return `<script nonce="test" id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        dehydratedState: {
          queries: [{
            state: {
              data: {
                product: {
                  id: overrides.id ?? '169600571',
                  name: overrides.name ?? '[단독] 예시 세럼 50ml',
                  is_purchasable: overrides.purchasable ?? true,
                  sales_status: overrides.purchasable === false ? 'SUSPENDED' : 'ON_SALE',
                  essentials: overrides.essentialCapacity
                    ? [{ name: '용량(중량)', value: overrides.essentialCapacity }]
                    : [],
                  product_price: {
                    max_price_info: { price: overrides.listPrice ?? 28_000 },
                    display_final_price: {
                      final_price: { price: salePrice },
                      final_price_additional: couponPrice === null ? null : { price: couponPrice },
                    },
                    coupon_discount_info: couponAmount === null ? null : { discount_amount: couponAmount },
                  },
                  shipping_fee: { base_fee: overrides.shippingFee ?? 0 },
                },
              },
            },
          }],
        },
      },
    },
  })}</script>`;
}

function noOfficialDomainResponse() {
  return {
    output: [],
    output_parsed: { candidate_domain: null, evidence_urls: [] },
  };
}

function sellerPage(html: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-length': String(html.length) }),
    text: async () => html,
  } as Response;
}

function musinsaResult(result: Awaited<ReturnType<ProductSearchService['searchSameProduct']>>) {
  const seller = result.seller_results.find((entry) => entry.seller === 'MUSINSA_BEAUTY');
  if (!seller) throw new Error('Musinsa result was not returned');
  return seller;
}

describe('ProductSearchService normal direct seller-page price verification', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    parseMock.mockReset();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  async function searchWith(
    prices: { list: number | null; sale: number | null },
    html: string,
  ) {
    parseMock
      .mockResolvedValueOnce(noOfficialDomainResponse())
      .mockResolvedValueOnce(musinsaSearchResponse(prices));
    fetchSpy.mockResolvedValueOnce(sellerPage(html));
    return new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchSameProduct(input);
  }

  it('replaces an AI-search price conflict with the direct Musinsa price and marks the source content-verified', async () => {
    const result = await searchWith(
      { list: 25_000, sale: 19_900 },
      '<meta property="product:price:amount" content="17900"><meta property="product:price:normal_price" content="25000"><meta property="product:availability" content="주문가능">',
    );
    const musinsa = musinsaResult(result);

    expect(fetchSpy).toHaveBeenCalledWith(musinsaUrl, expect.objectContaining({ redirect: 'manual' }));
    expect(musinsa).toMatchObject({
      availability: 'AVAILABLE',
      candidate_offer: {
        listed_sale_price: 17_900,
        list_price: 25_000,
      },
      source: { verification_status: 'CONTENT_VERIFIED' },
    });
    expect(result.warnings).toContain('direct seller page corrected AI prices to sale=17900, list=25000');
  });

  it('marks a matching direct Musinsa price content-verified without a correction warning', async () => {
    const result = await searchWith(
      { list: 25_000, sale: 17_900 },
      '<meta property="product:price:amount" content="17900"><meta property="product:price:normal_price" content="25000"><meta property="product:availability" content="주문가능">',
    );
    const musinsa = musinsaResult(result);

    expect(musinsa.source).toMatchObject({ verification_status: 'CONTENT_VERIFIED' });
    expect(musinsa.candidate_offer).toMatchObject({ listed_sale_price: 17_900, list_price: 25_000 });
    expect(result.warnings.some((warning) => warning.includes('corrected AI prices'))).toBe(false);
  });

  it('removes an offer when the direct Musinsa page reports it unavailable', async () => {
    const result = await searchWith(
      { list: 25_000, sale: 17_900 },
      '<meta property="product:availability" content="품절">',
    );
    const musinsa = musinsaResult(result);

    expect(musinsa).toMatchObject({
      availability: 'NOT_AVAILABLE',
      candidate_offer: null,
      source: { verification_status: 'URL_VERIFIED' },
    });
    expect(result.warnings).toContain('direct seller page reports the offer is not purchasable');
  });

  it('clears every AI-derived money field and keeps URL verification when direct metadata has no current price', async () => {
    const result = await searchWith(
      { list: 25_000, sale: 17_900 },
      '<meta property="product:availability" content="주문가능">',
    );
    const musinsa = musinsaResult(result);

    expect(musinsa).toMatchObject({
      availability: 'AVAILABLE',
      candidate_offer: {
        list_price: null,
        listed_sale_price: null,
        public_coupon_amount: null,
        automatic_discount_amount: null,
        shipping_fee: null,
      },
      source: { verification_status: 'URL_VERIFIED' },
    });
    expect(result.warnings.some((warning) => warning.includes('AI price was cleared'))).toBe(true);
  });

  it('clears every AI-derived money field and keeps URL verification when direct page fetching fails', async () => {
    parseMock
      .mockResolvedValueOnce(noOfficialDomainResponse())
      .mockResolvedValueOnce(musinsaSearchResponse({ list: 25_000, sale: 17_900 }));
    fetchSpy.mockRejectedValueOnce(new Error('seller page timeout'));

    const result = await new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchSameProduct(input);
    const musinsa = musinsaResult(result);

    expect(musinsa).toMatchObject({
      availability: 'AVAILABLE',
      candidate_offer: {
        list_price: null,
        listed_sale_price: null,
        public_coupon_amount: null,
        automatic_discount_amount: null,
        shipping_fee: null,
      },
      source: { verification_status: 'URL_VERIFIED' },
    });
    expect(result.warnings.some((warning) => warning.includes('AI price was cleared (seller page timeout)'))).toBe(true);
  });

  it('stops reading and clears AI money when a seller page exceeds the byte limit without content-length', async () => {
    parseMock
      .mockResolvedValueOnce(noOfficialDomainResponse())
      .mockResolvedValueOnce(musinsaSearchResponse({ list: 25_000, sale: 17_900 }));
    fetchSpy.mockResolvedValueOnce(new Response('x'.repeat(2_000_001)));

    const result = await new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchSameProduct(input);
    const musinsa = musinsaResult(result);

    expect(musinsa).toMatchObject({
      availability: 'AVAILABLE',
      candidate_offer: {
        list_price: null,
        listed_sale_price: null,
        public_coupon_amount: null,
        automatic_discount_amount: null,
        shipping_fee: null,
      },
      source: { verification_status: 'URL_VERIFIED' },
    });
    expect(result.warnings.some((warning) => warning.includes('exceeded the 2 MB verification limit'))).toBe(true);
  });

  it('does not treat an unsupported seller as content-verified or fetch its page', async () => {
    parseMock
      .mockResolvedValueOnce(noOfficialDomainResponse())
      .mockResolvedValueOnce(oliveYoungSearchResponse());

    const result = await new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchSameProduct(input);
    const oliveYoung = result.seller_results.find((entry) => entry.seller === 'OLIVE_YOUNG');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(oliveYoung).toMatchObject({
      availability: 'AVAILABLE',
      source: { verification_status: 'URL_VERIFIED' },
    });
  });

  it('refreshes a cached Musinsa URL and excludes that seller from the paid web search', async () => {
    const cachedCandidate = musinsaSearchResponse({ list: 25_000, sale: 19_900 })
      .output_parsed.seller_results[1].candidate_offer;
    parseMock
      .mockResolvedValueOnce(noOfficialDomainResponse())
      .mockResolvedValueOnce(oliveYoungSearchResponse());
    fetchSpy.mockResolvedValueOnce(sellerPage(
      '<meta property="product:price:amount" content="16900"><meta property="product:price:normal_price" content="25000"><meta property="product:availability" content="주문가능">',
    ));

    const result = await new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchSameProduct({
      ...input,
      cached_seller_offers: [{
        seller: 'MUSINSA_BEAUTY',
        source_url: musinsaUrl,
        observed_at: '2026-09-01T00:00:00.000Z',
        candidate_offer: cachedCandidate,
      }],
    });

    expect(musinsaResult(result)).toMatchObject({
      availability: 'AVAILABLE',
      candidate_offer: { listed_sale_price: 16_900 },
      source: {
        source_url: musinsaUrl,
        acquisition_method: 'DIRECT_HTTP',
        verification_status: 'CONTENT_VERIFIED',
      },
    });
    expect(parseMock.mock.calls[1][0].input).toContain(
      '"target_sellers":["OLIVE_YOUNG","COUPANG","ZIGZAG","BRAND_OFFICIAL"]',
    );
  });

  it('replaces searched Zigzag facts with public page data and marks the source content-verified', async () => {
    parseMock
      .mockResolvedValueOnce(noOfficialDomainResponse())
      .mockResolvedValueOnce(zigzagSearchResponse());
    fetchSpy.mockResolvedValueOnce(sellerPage(zigzagPage()));

    const result = await new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchSameProduct(input);
    const zigzag = result.seller_results.find((entry) => entry.seller === 'ZIGZAG');

    expect(fetchSpy).toHaveBeenCalledWith(zigzagUrl, expect.objectContaining({ redirect: 'manual' }));
    expect(zigzag).toMatchObject({
      availability: 'AVAILABLE',
      candidate_offer: {
        product_name: '[단독] 예시 세럼 50ml',
        list_price: 28_000,
        listed_sale_price: 24_270,
        public_coupon_amount: 6_070,
        automatic_discount_amount: null,
        shipping_fee: 0,
        discount_conditions: ['지그재그 공개 쿠폰 6070원 적용'],
        shipping_condition: '무료배송',
      },
      source: {
        verification_status: 'CONTENT_VERIFIED',
        selected_option_verification_status: 'VERIFIED',
        paid_configuration_verification_status: 'VERIFIED',
      },
    });
  });

  it('removes a Zigzag offer when its public page reports it not purchasable', async () => {
    parseMock
      .mockResolvedValueOnce(noOfficialDomainResponse())
      .mockResolvedValueOnce(zigzagSearchResponse());
    fetchSpy.mockResolvedValueOnce(sellerPage(zigzagPage({ purchasable: false })));

    const result = await new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchSameProduct(input);
    const zigzag = result.seller_results.find((entry) => entry.seller === 'ZIGZAG');

    expect(zigzag).toMatchObject({
      availability: 'NOT_AVAILABLE',
      candidate_offer: null,
      source: { verification_status: 'URL_VERIFIED' },
    });
  });

  it('keeps Zigzag URL-only and clears searched money when the page product id differs', async () => {
    parseMock
      .mockResolvedValueOnce(noOfficialDomainResponse())
      .mockResolvedValueOnce(zigzagSearchResponse());
    fetchSpy.mockResolvedValueOnce(sellerPage(zigzagPage({ id: '999' })));

    const result = await new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchSameProduct(input);
    const zigzag = result.seller_results.find((entry) => entry.seller === 'ZIGZAG');

    expect(zigzag).toMatchObject({
      availability: 'AVAILABLE',
      candidate_offer: {
        list_price: null,
        listed_sale_price: null,
        public_coupon_amount: null,
        automatic_discount_amount: null,
        shipping_fee: null,
      },
      source: { verification_status: 'URL_VERIFIED' },
    });
  });

  it('keeps Zigzag URL-only when the direct page title conflicts with the anchor', async () => {
    parseMock
      .mockResolvedValueOnce(noOfficialDomainResponse())
      .mockResolvedValueOnce(zigzagSearchResponse());
    fetchSpy.mockResolvedValueOnce(sellerPage(zigzagPage({ name: '완전히 다른 크림 50ml' })));

    const result = await new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchSameProduct(input);
    const zigzag = result.seller_results.find((entry) => entry.seller === 'ZIGZAG');

    expect(zigzag).toMatchObject({
      availability: 'AVAILABLE',
      candidate_offer: {
        list_price: null,
        listed_sale_price: null,
        public_coupon_amount: null,
        shipping_fee: null,
      },
      source: { verification_status: 'URL_VERIFIED' },
    });
  });

  it('extracts only a mathematically matching public Zigzag coupon', () => {
    expect(extractZigzagSellerPageFacts(zigzagPage())).toEqual({
      productId: '169600571',
      productName: '[단독] 예시 세럼 50ml',
      listedSalePrice: 24_270,
      listPrice: 28_000,
      publicCouponAmount: 6_070,
      shippingFee: 0,
      available: true,
      mainCapacity: { value: 50, unit: 'ML', quantity: 1 },
    });
    expect(extractZigzagSellerPageFacts(zigzagPage({ couponAmount: 5_000 }))).toMatchObject({
      publicCouponAmount: null,
    });
    expect(extractZigzagSellerPageFacts(zigzagPage({
      name: '[단독] 예시 쿠션',
      essentialCapacity: '13 g / 0.45 oz.',
    }))).toMatchObject({
      mainCapacity: { value: 13, unit: 'G', quantity: 1 },
    });
  });

  it('content-verifies a web-searched Zigzag alternative configuration', async () => {
    parseMock.mockResolvedValueOnce(zigzagConfigurationSearchResponse());
    fetchSpy.mockResolvedValueOnce(sellerPage(zigzagPage({ name: '[단독] 예시 세럼 100ml' })));

    const result = await new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchAlternativeConfigurations({
      ...input,
      target_sellers: ['ZIGZAG'],
      max_candidates_per_seller: 1,
    });
    const [zigzag] = result.seller_results;

    expect(zigzag).toMatchObject({
      seller: 'ZIGZAG',
      availability: 'AVAILABLE',
      candidates: [{
        basis_price: 24_270,
        candidate_offer: {
          list_price: 28_000,
          listed_sale_price: 24_270,
          public_coupon_amount: 6_070,
          shipping_fee: 0,
        },
        source: { verification_status: 'CONTENT_VERIFIED' },
      }],
    });
  });

  it('keeps Zigzag URL-only when direct capacity conflicts with the searched configuration', async () => {
    parseMock.mockResolvedValueOnce(zigzagConfigurationSearchResponse());
    fetchSpy.mockResolvedValueOnce(sellerPage(zigzagPage({ name: '[단독] 예시 세럼 50ml' })));

    const result = await new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchAlternativeConfigurations({
      ...input,
      target_sellers: ['ZIGZAG'],
      max_candidates_per_seller: 1,
    });

    expect(result.seller_results[0]).toMatchObject({
      seller: 'ZIGZAG',
      availability: 'AVAILABLE',
      candidates: [{
        candidate_offer: {
          list_price: null,
          listed_sale_price: null,
          public_coupon_amount: null,
          shipping_fee: null,
        },
        source: { verification_status: 'URL_VERIFIED' },
      }],
    });
  });

  it('does not content-verify Zigzag when purchasability is missing', async () => {
    parseMock
      .mockResolvedValueOnce(noOfficialDomainResponse())
      .mockResolvedValueOnce(zigzagSearchResponse());
    const pageWithoutPurchasability = zigzagPage().replace('"is_purchasable":true,', '');
    fetchSpy.mockResolvedValueOnce(sellerPage(pageWithoutPurchasability));

    const result = await new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchSameProduct(input);
    const zigzag = result.seller_results.find((entry) => entry.seller === 'ZIGZAG');

    expect(zigzag).toMatchObject({
      availability: 'AVAILABLE',
      candidate_offer: {
        list_price: null,
        listed_sale_price: null,
        public_coupon_amount: null,
        shipping_fee: null,
      },
      source: { verification_status: 'URL_VERIFIED' },
    });
  });

  it('does not discard unverified gift components when content-verifying Zigzag', async () => {
    const searchResponse = zigzagSearchResponse();
    const searchedComponents = searchResponse.output_parsed.seller_results[3].candidate_offer?.components;
    if (!searchedComponents) throw new Error('Zigzag fixture offer is missing');
    (searchedComponents as Array<{
      type: 'OTHER_COSMETIC';
      name: string;
      capacity_value: number;
      capacity_unit: 'ML';
      quantity: number;
    }>).push({
      type: 'OTHER_COSMETIC' as const,
      name: '예시 클렌저',
      capacity_value: 20,
      capacity_unit: 'ML' as const,
      quantity: 1,
    });
    parseMock
      .mockResolvedValueOnce(noOfficialDomainResponse())
      .mockResolvedValueOnce(searchResponse);
    fetchSpy.mockResolvedValueOnce(sellerPage(zigzagPage()));

    const result = await new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    })).searchSameProduct(input);
    const zigzag = result.seller_results.find((entry) => entry.seller === 'ZIGZAG');

    expect(zigzag).toMatchObject({
      availability: 'AVAILABLE',
      candidate_offer: {
        list_price: null,
        listed_sale_price: null,
        public_coupon_amount: null,
        shipping_fee: null,
      },
      source: { verification_status: 'URL_VERIFIED' },
    });
    expect(result.warnings.some((warning) => warning.includes('did not verify non-main set or gift components'))).toBe(true);
  });
});
