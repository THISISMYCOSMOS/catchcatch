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
import { ProductSearchService } from './product-search.service';

const parseMock = (OpenAI as unknown as { __parse: jest.Mock }).__parse;
const musinsaUrl = 'https://www.musinsa.com/products/2782655';
const oliveYoungUrl = 'https://www.oliveyoung.co.kr/store/goods/example';
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
    components: [],
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
});
