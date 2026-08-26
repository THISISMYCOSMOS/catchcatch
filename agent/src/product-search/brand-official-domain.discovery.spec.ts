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
import { OpenAICostBudgetService } from '../openai-cost/openai-cost-budget.service';
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
  return ['OLIVE_YOUNG', 'MUSINSA_BEAUTY', 'COUPANG', 'ZIGZAG', 'BRAND_OFFICIAL'].map((seller) => ({
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

function discoveryResponse(
  candidateDomain: string | null,
  evidenceUrls: string[] = [],
  sourceUrls: string[] = evidenceUrls,
) {
  return {
    output: [{
      type: 'web_search_call',
      action: {
        type: 'search',
        sources: sourceUrls.map((url) => ({ type: 'url', url })),
      },
    }],
    output_parsed: {
      candidate_domain: candidateDomain,
      evidence_urls: evidenceUrls,
    },
  };
}

function createService() {
  return new ProductSearchService(new ConfigService({
    PRODUCT_DATA_MODE: 'web_search',
    OPENAI_API_KEY: 'test-key',
  }));
}

// Both phases use web_search. Discovery has no allowed_domains filter because
// finding the official domain is its job; the product search is restricted to
// the fixed sellers plus the discovered domain.
function discoveryCalls() {
  return parseMock.mock.calls.filter(([body]) => {
    const tool = (body as { tools?: Array<{ filters?: unknown }> }).tools?.[0];
    return tool && !tool.filters;
  });
}

function searchCallBody() {
  const call = parseMock.mock.calls.find(([body]) => (
    (body as { tools?: Array<{ filters?: unknown }> }).tools?.[0]?.filters
  ));
  return call?.[0] as {
    model: string;
    max_tool_calls: number;
    max_output_tokens: number;
    reasoning: { effort: string };
    tools: Array<{ filters: { allowed_domains: string[] } }>;
  };
}

describe('brand-official domain discovery (T5)', () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it('web-searches the official domain and adds a source-backed candidate to the product-search allowlist', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse(
        'innisfree.com',
        ['https://www.innisfree.com/kr/ko/Main.do'],
      ))
      .mockResolvedValueOnce(searchResponse());

    const result = await createService().searchSameProduct(input);

    expect(discoveryCalls()).toHaveLength(1);
    expect(discoveryCalls()[0]?.[0]).toMatchObject({
      model: 'gpt-5.6-luna',
      max_tool_calls: 1,
      max_output_tokens: 400,
      reasoning: { effort: 'low' },
    });
    expect(searchCallBody()).toMatchObject({
      model: 'gpt-5.6-luna',
      max_tool_calls: 2,
      max_output_tokens: 2500,
      reasoning: { effort: 'low' },
    });
    expect(searchCallBody().tools[0].filters.allowed_domains).toContain('innisfree.com');
    expect(result.warnings.some((warning) => warning.includes('discovered by web_search'))).toBe(true);
  });

  it('reuses the cached domain instead of discovering again for the same brand', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse(
        'innisfree.com',
        ['https://www.innisfree.com/kr/ko/Main.do'],
      ))
      .mockResolvedValue(searchResponse());

    const service = createService();
    await service.searchSameProduct(input);
    await service.searchSameProduct(input);

    expect(discoveryCalls()).toHaveLength(1);
    expect(parseMock).toHaveBeenCalledTimes(3);
  });

  it('does not reuse a cached domain across service instances', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse(
        'innisfree.com',
        ['https://www.innisfree.com/kr/ko/Main.do'],
      ))
      .mockResolvedValueOnce(searchResponse())
      .mockResolvedValueOnce(discoveryResponse(
        'innisfree.com',
        ['https://www.innisfree.com/kr/ko/Main.do'],
      ))
      .mockResolvedValueOnce(searchResponse());

    await createService().searchSameProduct(input);
    await createService().searchSameProduct(input);

    expect(discoveryCalls()).toHaveLength(2);
  });

  it('drops a candidate the gate rejects and searches the fixed domains only', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse(
        'smartstore.naver.com',
        ['https://smartstore.naver.com/innisfree'],
      ))
      .mockResolvedValueOnce(searchResponse());

    const result = await createService().searchSameProduct(input);

    expect(searchCallBody().tools[0].filters.allowed_domains).toEqual([
      'oliveyoung.co.kr',
      'musinsa.com',
      'coupang.com',
      'zigzag.kr',
    ]);
    expect(result.warnings.some((warning) => warning.includes('discovered by web_search'))).toBe(false);
  });

  it('rejects a candidate whose evidence URL was not returned by web_search', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse(
        'innisfree.com',
        ['https://www.innisfree.com/kr/ko/Main.do'],
        ['https://unrelated.example/search-result'],
      ))
      .mockResolvedValueOnce(searchResponse());

    const result = await createService().searchSameProduct(input);

    expect(searchCallBody().tools[0].filters.allowed_domains).toEqual([
      'oliveyoung.co.kr',
      'musinsa.com',
      'coupang.com',
      'zigzag.kr',
    ]);
    expect(result.warnings.some((warning) => warning.includes('discovered by web_search'))).toBe(false);
  });

  it('rejects evidence from a different domain even when it was returned by web_search', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse(
        'innisfree.com',
        ['https://unrelated.example/innisfree'],
      ))
      .mockResolvedValueOnce(searchResponse());

    await createService().searchSameProduct(input);

    expect(searchCallBody().tools[0].filters.allowed_domains).not.toContain('innisfree.com');
  });

  it('degrades to no domain when the model returns no candidate', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse(null))
      .mockResolvedValueOnce(searchResponse());

    await expect(createService().searchSameProduct(input)).resolves.toBeDefined();
    expect(searchCallBody().tools[0].filters.allowed_domains).toHaveLength(4);
  });

  it('does not fail the search when the discovery call itself throws', async () => {
    parseMock
      .mockRejectedValueOnce(new Error('discovery network failure'))
      .mockResolvedValueOnce(searchResponse());

    const result = await createService().searchSameProduct(input);

    expect(result.seller_results).toHaveLength(5);
    expect(searchCallBody().tools[0].filters.allowed_domains).toHaveLength(4);
  });

  it('skips optional official discovery when it would consume the required search reserve', async () => {
    parseMock.mockResolvedValueOnce(searchResponse());
    const service = new ProductSearchService(new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
      OPENAI_ANALYSIS_COST_BUDGET_USD: '0.04',
    }));

    const result = await service.searchSameProduct(input);

    expect(discoveryCalls()).toHaveLength(0);
    expect(parseMock).toHaveBeenCalledTimes(1);
    expect(result.warnings).toContain(
      'BRAND_OFFICIAL discovery was skipped to preserve the required seller-search cost budget; BRAND_OFFICIAL remains UNKNOWN.',
    );
  });

  it('runs official discovery after the highest observed Luna identification cost', async () => {
    parseMock
      .mockResolvedValueOnce(discoveryResponse(
        'innisfree.com',
        ['https://www.innisfree.com/kr/ko/Main.do'],
      ))
      .mockResolvedValueOnce(searchResponse());
    const config = new ConfigService({
      PRODUCT_DATA_MODE: 'web_search',
      OPENAI_API_KEY: 'test-key',
    });
    const costBudget = new OpenAICostBudgetService(config);
    const budgetSession = costBudget.begin(
      input.product_url,
      costBudget.searchPipelineBudgetUsd(),
    );
    const identification = costBudget.reserve(budgetSession, 'product_identification');
    expect(identification).not.toBeNull();
    costBudget.settle(identification!, 'gpt-5.6-luna', {
      usage: { input_tokens: 6_117, output_tokens: 360 },
      output: [
        { type: 'web_search_call' },
        { type: 'web_search_call' },
      ],
    });

    await new ProductSearchService(config, costBudget).searchSameProduct(input);

    expect(discoveryCalls()).toHaveLength(1);
    expect(searchCallBody().tools[0].filters.allowed_domains).toContain('innisfree.com');
  });

  it('skips discovery entirely for an implausibly long brand name', async () => {
    const longBrandAnchor = { ...input.anchor_product, brand: 'A'.repeat(101) };
    parseMock.mockResolvedValueOnce(searchResponse(longBrandAnchor));

    await createService().searchSameProduct({ ...input, anchor_product: longBrandAnchor });

    expect(discoveryCalls()).toHaveLength(0);
    expect(parseMock).toHaveBeenCalledTimes(1);
  });
});
