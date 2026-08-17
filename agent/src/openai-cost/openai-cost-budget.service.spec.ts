import { ConfigService } from '@nestjs/config';
import {
  OpenAICostBudgetService,
  estimateOpenAIResponseCostUsd,
} from './openai-cost-budget.service';

describe('OpenAICostBudgetService', () => {
  it('prices Luna tokens and web-search calls from Responses usage', () => {
    const cost = estimateOpenAIResponseCostUsd('gpt-5.6-luna', {
      usage: {
        input_tokens: 10_000,
        input_tokens_details: { cached_tokens: 2_000 },
        output_tokens: 1_000,
      },
      output: [{ type: 'web_search_call' }, { type: 'message' }],
    });
    expect(cost).toBeCloseTo(0.01284, 8);
  });

  it('links identification and search sessions by product URL', () => {
    const service = new OpenAICostBudgetService(config({}));
    const identification = service.begin('https://example.com/product/1#details');
    const search = service.claimForSearch('https://example.com/product/1');
    expect(search.id).toBe(identification.id);
  });

  it('uses the lean commercial budget and stage reserves by default', () => {
    const service = new OpenAICostBudgetService(config({}));
    expect(service.analysisBudgetUsd()).toBe(0.056);
    expect(service.searchPipelineBudgetUsd()).toBeCloseTo(0.051, 8);
    expect(service.stageReserveUsd('product_identification')).toBe(0.012);
    expect(service.stageReserveUsd('brand_official_discovery')).toBe(0.012);
    expect(service.stageReserveUsd('same_product_search')).toBe(0.027);
    expect(service.stageReserveUsd('ai_judgment')).toBe(0.005);
  });

  it('keeps concurrent analyses for the same URL in FIFO sessions', () => {
    const service = new OpenAICostBudgetService(config({}));
    const first = service.begin('https://example.com/product/1');
    const second = service.begin('https://example.com/product/1');
    expect(service.claimForSearch('https://example.com/product/1').id).toBe(first.id);
    expect(service.claimForSearch('https://example.com/product/1').id).toBe(second.id);
  });

  it('protects the required search reserve when optional discovery would exceed the budget', () => {
    const service = new OpenAICostBudgetService(config({
      OPENAI_ANALYSIS_COST_BUDGET_USD: '0.05',
    }));
    const session = service.begin('https://example.com/product/1');
    const identification = service.reserve(session, 'product_identification');
    expect(identification).not.toBeNull();
    service.settle(identification!, 'gpt-5.6-luna', {
      usage: { input_tokens: 10_000, output_tokens: 1_000 },
      output: [{ type: 'web_search_call' }],
    });

    expect(service.reserve(
      session,
      'brand_official_discovery',
      service.stageReserveUsd('same_product_search'),
    )).toBeNull();
  });

  it('keeps the measured successful live-search usage inside the 5.1-cent search pipeline budget with Luna', () => {
    const service = new OpenAICostBudgetService(config({}));
    const session = service.begin(
      'https://www.musinsa.com/products/2782655',
      service.searchPipelineBudgetUsd(),
    );

    settleStage(service, session, 'product_identification', 'gpt-5.6-luna', {
      input_tokens: 6_009,
      output_tokens: 473,
      web_search_calls: 1,
    });
    settleStage(service, session, 'brand_official_discovery', 'gpt-5.6-luna', {
      input_tokens: 13_005,
      cached_tokens: 4_595,
      output_tokens: 91,
      web_search_calls: 1,
    }, service.stageReserveUsd('same_product_search'));
    settleStage(service, session, 'same_product_search', 'gpt-5.6-luna', {
      input_tokens: 15_256,
      cached_tokens: 6_137,
      output_tokens: 1_347,
      web_search_calls: 2,
    });

    expect(service.isExceeded(session)).toBe(false);
    expect(service.remainingUsd(session)).toBeCloseTo(0.003785, 6);
  });
});

function settleStage(
  service: OpenAICostBudgetService,
  session: ReturnType<OpenAICostBudgetService['begin']>,
  stage: 'product_identification' | 'brand_official_discovery' | 'same_product_search',
  model: string,
  usage: {
    input_tokens: number;
    cached_tokens?: number;
    output_tokens: number;
    web_search_calls: number;
  },
  additionalReserveUsd = 0,
): void {
  const reservation = service.reserve(session, stage, additionalReserveUsd);
  expect(reservation).not.toBeNull();
  service.settle(reservation!, model, {
    usage: {
      input_tokens: usage.input_tokens,
      input_tokens_details: { cached_tokens: usage.cached_tokens ?? 0 },
      output_tokens: usage.output_tokens,
    },
    output: Array.from({ length: usage.web_search_calls }, () => ({
      type: 'web_search_call',
    })),
  });
}

function config(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}
