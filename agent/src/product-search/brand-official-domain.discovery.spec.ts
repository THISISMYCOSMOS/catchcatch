import { ConfigService } from '@nestjs/config';

// The service builds its own OpenAI client, so the discovery step can only
// be exercised by mocking the module. The mock is self-contained (jest
// hoists this call above the imports) and exposes its parse spy on the
// constructor so the test can read it back after importing.
jest.mock('openai', () => {
  const parse = jest.fn();
  class MockAPIError extends Error {
    constructor(
      public status?: number,
      public code?: string,
      public requestID?: string,
    ) {
      super('mock openai error');
    }
  }
  const MockOpenAI = jest.fn(() => ({ responses: { parse } }));
  Object.assign(MockOpenAI, { APIError: MockAPIError, __parse: parse });
  return { __esModule: true, default: MockOpenAI };
});

// eslint-disable-next-line import/order
import OpenAI from 'openai';
import { ProductSearchService } from './product-search.service';

const parseMock = (OpenAI as unknown as { __parse: jest.Mock }).__parse;

const input = {
  product_url: 'https://www.oliveyoung.co.kr/store/goods/example',
  brand_id: null,
  anchor_product: {
    brand: 'Innisfree',
    normalized_product_name: '예시 세럼',
    product_type: '세럼',
    option: null,
    shade_or_scent: null,
    version_or_renewal: null,
    components: [],
  },
};

function emptySellerResults() {
  return ['OLIVE_YOUNG', 'MUSINSA_BEAUTY', 'COUPANG', 'BRAND_OFFICIAL'].map((seller) => ({
    seller,
    availability: 'UNKNOWN' as const,
    candidate_offer: null,
    match_evidence: [],
    mismatch_reasons: [],
    source: null,
  }));
}

// The service rejects a response whose anchor_product differs from the
// input's, so the fixture must echo back whichever anchor the test sent.
function searchResponse(anchorProduct = input.anchor_product) {
  return {
    output: [],
    output_parsed: {
      anchor_product: anchorProduct,
      warnings: [],
      seller_results: emptySellerResults(),
    },
  };
}

function discoveryResponse(candidateDomain: string | null) {
  return { output: [], output_parsed: { candidate_domain: candidateDomain } };
}

function createService() {
  return new ProductSearchService(new ConfigService({
    PRODUCT_DATA_MODE: 'web_search',
    OPENAI_API_KEY: 'test-key',
  }));
}

// The discovery call is the one without a web_search tool attached.
function discoveryCalls() {
  return parseMock.mock.calls.filter(([body]) => !(body as { tools?: unknown[] }).tools);
}

function searchCallBody() {
  const call = parseMock.mock.calls.find(([body]) => (body as { tools?: unknown[] }).tools);
  return call?.[0] as { tools: Array<{ filters: { allowed_domains: string[] } }> };
}

describe('brand-official domain discovery (T5)', () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it('runs one discovery call and adds the gated domain to the search allowlist', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse('innisfree.com'))
      .mockResolvedValueOnce(searchResponse());

    const result = await createService().searchSameProduct(input);

    expect(discoveryCalls()).toHaveLength(1);
    expect(searchCallBody().tools[0].filters.allowed_domains).toContain('innisfree.com');
    expect(result.warnings.some((warning) => warning.includes('not verified'))).toBe(true);
  });

  it('reuses the cached domain instead of discovering again for the same brand', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse('innisfree.com'))
      .mockResolvedValue(searchResponse());

    const service = createService();
    await service.searchSameProduct(input);
    await service.searchSameProduct(input);

    expect(discoveryCalls()).toHaveLength(1);
    expect(parseMock).toHaveBeenCalledTimes(3);
  });

  it('does not reuse a cached domain across service instances', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse('innisfree.com'))
      .mockResolvedValueOnce(searchResponse())
      .mockResolvedValueOnce(discoveryResponse('innisfree.com'))
      .mockResolvedValueOnce(searchResponse());

    await createService().searchSameProduct(input);
    await createService().searchSameProduct(input);

    expect(discoveryCalls()).toHaveLength(2);
  });

  it('drops a candidate the gate rejects and searches the fixed domains only', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse('smartstore.naver.com'))
      .mockResolvedValueOnce(searchResponse());

    const result = await createService().searchSameProduct(input);

    expect(searchCallBody().tools[0].filters.allowed_domains).toEqual([
      'oliveyoung.co.kr',
      'musinsa.com',
      'coupang.com',
    ]);
    expect(result.warnings.some((warning) => warning.includes('not verified'))).toBe(false);
  });

  it('degrades to no domain when the model returns no candidate', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse(null))
      .mockResolvedValueOnce(searchResponse());

    await expect(createService().searchSameProduct(input)).resolves.toBeDefined();
    expect(searchCallBody().tools[0].filters.allowed_domains).toHaveLength(3);
  });

  it('does not fail the search when the discovery call itself throws', async () => {
    parseMock
      .mockRejectedValueOnce(new Error('discovery network failure'))
      .mockResolvedValueOnce(searchResponse());

    const result = await createService().searchSameProduct(input);

    expect(result.seller_results).toHaveLength(4);
    expect(searchCallBody().tools[0].filters.allowed_domains).toHaveLength(3);
  });

  it('skips discovery entirely for an implausibly long brand name', async () => {
    const longBrandAnchor = { ...input.anchor_product, brand: 'A'.repeat(101) };
    parseMock.mockResolvedValueOnce(searchResponse(longBrandAnchor));

    await createService().searchSameProduct({ ...input, anchor_product: longBrandAnchor });

    expect(discoveryCalls()).toHaveLength(0);
    expect(parseMock).toHaveBeenCalledTimes(1);
  });
});
