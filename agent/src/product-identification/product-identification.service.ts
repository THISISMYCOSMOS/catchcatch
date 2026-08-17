import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  assertAllowedSellerUrl,
  normalizeSellerPageUrl,
  sellerPageUrlsReferToSameProduct,
} from '../ai-contracts/seller-domain.policy';
import {
  buildProductIdentificationPrompt,
  CATCHCATCH_PRODUCT_IDENTIFICATION_INSTRUCTIONS,
} from './product-identification.prompt';
import {
  ProductIdentificationInput,
  ProductIdentificationResult,
  productIdentificationAiResultSchema,
  productIdentificationInputSchema,
  validateProductIdentificationResult,
} from './product-identification.schema';
import { parseRequestInput } from '../ai-contracts/request-input';
import { logOpenAIUsage } from '../openai-usage/openai-usage.logger';
import {
  OpenAICostBudgetService,
} from '../openai-cost/openai-cost-budget.service';

const SAMPLE_DATA_WARNING = 'This is sample data, not a real identification result (PRODUCT_DATA_MODE=sample).';

type WebSearchOutputItem = {
  type?: string;
  action?: {
    url?: string | null;
    sources?: Array<{ url?: string }>;
  };
};

@Injectable()
export class ProductIdentificationService {
  private readonly logger = new Logger(ProductIdentificationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly costBudget: OpenAICostBudgetService = new OpenAICostBudgetService(config),
  ) {}

  async identify(rawInput: unknown): Promise<ProductIdentificationResult> {
    const input = parseRequestInput(productIdentificationInputSchema, rawInput);
    assertAllowedSellerUrl(input.product_url, input.allowed_domains);

    const mode = this.config.get<string>('PRODUCT_DATA_MODE', 'sample');
    if (mode === 'sample') {
      return this.createSampleIdentification(input);
    }
    if (mode !== 'web_search') {
      throw new ServiceUnavailableException('PRODUCT_DATA_MODE must be sample or web_search');
    }

    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: 'PRODUCT_IDENTIFICATION_PROVIDER_UNAVAILABLE',
        reason: 'SEARCH_CREDENTIALS_MISSING',
        retryable: false,
      });
    }

    const client = new OpenAI({
      apiKey,
      timeout: Number(this.config.get<string>('OPENAI_TIMEOUT_MS', '20000')),
      maxRetries: 0,
    });

    const model = this.config.get<string>(
      'OPENAI_IDENTIFICATION_MODEL',
      'gpt-5.6-luna',
    );
    const budgetSession = this.costBudget.begin(
      input.product_url,
      this.costBudget.searchPipelineBudgetUsd(),
    );
    const reservation = this.costBudget.reserve(
      budgetSession,
      'product_identification',
    );
    if (!reservation) {
      throw new ServiceUnavailableException({
        code: 'ANALYSIS_COST_BUDGET_EXCEEDED',
        stage: 'product_identification',
        retryable: false,
      });
    }
    try {
      const response = await client.responses.parse({
        model,
        instructions: CATCHCATCH_PRODUCT_IDENTIFICATION_INSTRUCTIONS,
        input: buildProductIdentificationPrompt(input),
        tools: [{
          type: 'web_search',
          search_context_size: resolveWebSearchContextSize(this.config),
          filters: { allowed_domains: input.allowed_domains },
        }],
        tool_choice: 'required',
        max_tool_calls: 1,
        max_output_tokens: resolvePositiveInteger(
          this.config.get<string>('OPENAI_IDENTIFICATION_MAX_OUTPUT_TOKENS'),
          1_200,
        ),
        reasoning: {
          effort: resolveReasoningEffort(
            this.config.get<string>('OPENAI_IDENTIFICATION_REASONING_EFFORT', 'low'),
          ),
        },
        include: ['web_search_call.action.sources'],
        store: false,
        text: {
          format: zodTextFormat(
            productIdentificationAiResultSchema,
            'catchcatch_product_identification',
          ),
        },
      });
      this.costBudget.settle(reservation, model, response);
      logOpenAIUsage(this.config, this.logger, 'product_identification', model, response);

      if (this.costBudget.isExceeded(budgetSession)) {
        throw new ServiceUnavailableException({
          code: 'ANALYSIS_COST_BUDGET_EXCEEDED',
          stage: 'product_identification',
          retryable: false,
        });
      }

      if (!response.output_parsed) {
        throw new Error('OpenAI returned no parsed identification output');
      }
      assertInputUrlWasSearched(input, response.output);
      return validateProductIdentificationResult(input, response.output_parsed);
    } catch (error) {
      this.costBudget.release(reservation);
      if (error instanceof ServiceUnavailableException) throw error;
      if (error instanceof OpenAI.APIError) {
        this.logger.error(
          `OpenAI product identification failed: status=${error.status}, code=${error.code ?? 'unknown'}, request_id=${error.requestID ?? 'unknown'}, message=${error.message}`,
        );
        throw new ServiceUnavailableException({
          code: 'PRODUCT_IDENTIFICATION_PROVIDER_UNAVAILABLE',
          reason: classifyProviderFailure(error.status),
          retryable: error.status === 429 || error.status === undefined || error.status >= 500,
        });
      }
      this.logger.error(
        `Product identification output validation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException({
        code: 'PRODUCT_IDENTIFICATION_OUTPUT_INVALID',
        retryable: false,
      });
    }
  }

  // Deterministic, non-network fixture path used when PRODUCT_DATA_MODE is
  // "sample" (the .env.example default). It is run through the same
  // validateProductIdentificationResult pipeline the real web_search path
  // uses, so it is validated by the exact same zod schemas and source-url
  // invariants without requiring OPENAI_API_KEY.
  private createSampleIdentification(
    input: ProductIdentificationInput,
  ): ProductIdentificationResult {
    const sampleAiResult = {
      identification_status: 'IDENTIFIED' as const,
      anchor_product: {
        brand: 'CatchCatch Sample Brand',
        normalized_product_name: 'CatchCatch Sample Product',
        product_type: 'Sample cosmetic',
        option: null,
        shade_or_scent: null,
        version_or_renewal: null,
        components: [],
      },
      preview: {
        seller: null,
        listed_price: 10000,
        image_url: null,
      },
      source: {
        source_type: 'SELLER_PAGE' as const,
        source_url: input.product_url,
        acquisition_method: 'AI_WEB_SEARCH' as const,
        verification_status: 'UNVERIFIED' as const,
      },
      warnings: [SAMPLE_DATA_WARNING],
    };
    return validateProductIdentificationResult(input, sampleAiResult);
  }
}

function resolvePositiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function resolveReasoningEffort(
  raw: string | undefined,
): 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  return raw === 'none' || raw === 'medium' || raw === 'high' || raw === 'xhigh' || raw === 'max'
    ? raw
    : 'low';
}

function resolveWebSearchContextSize(
  config: ConfigService,
): 'low' | 'medium' | 'high' {
  const value = config.get<string>('OPENAI_WEB_SEARCH_CONTEXT_SIZE', 'low');
  return value === 'medium' || value === 'high' ? value : 'low';
}

function assertInputUrlWasSearched(
  input: ProductIdentificationInput,
  output: unknown,
): void {
  const searchedUrls = collectSearchUrls(output);
  if (![...searchedUrls].some((url) => sellerPageUrlsReferToSameProduct(url, input.product_url))) {
    throw new Error('Input product URL was not returned by web search');
  }
}

function collectSearchUrls(output: unknown): Set<string> {
  if (!Array.isArray(output)) {
    return new Set();
  }
  const urls = new Set<string>();
  for (const rawItem of output) {
    const item = rawItem as WebSearchOutputItem;
    if (item.type !== 'web_search_call' || !item.action) {
      continue;
    }
    for (const source of item.action.sources ?? []) {
      if (source.url) {
        urls.add(normalizeSellerPageUrl(source.url));
      }
    }
    if (item.action.url) {
      urls.add(normalizeSellerPageUrl(item.action.url));
    }
  }
  return urls;
}

function classifyProviderFailure(status: number | undefined): string {
  if (status === undefined) return 'SEARCH_NETWORK_ERROR';
  if (status === 401) return 'SEARCH_CREDENTIALS_MISSING';
  if (status === 403) return 'SEARCH_ACCESS_DENIED';
  if (status === 429) return 'SEARCH_RATE_LIMITED';
  if (status === 400 || status === 404) return 'SEARCH_TOOL_UNAVAILABLE';
  return 'SEARCH_PROVIDER_ERROR';
}
