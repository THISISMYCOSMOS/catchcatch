import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  ProductSearchInput,
  ProductSearchResult,
  productSearchAiResultSchema,
  productSearchInputSchema,
  productSearchResultSchema,
} from './product-search.schema';
import {
  buildProductSearchPrompt,
  CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS,
} from './product-search.prompt';
import {
  assertAllowedSellerUrl,
  assertSellerMatchesUrl,
  FIXED_SELLER_DOMAINS,
  normalizeSellerPageUrl,
  parseBrandOfficialDomainRegistry,
} from '../ai-contracts/seller-domain.policy';
import { ProductIdentity } from '../ai-contracts/product-data.schema';

export type SearchProviderFailureCode =
  | 'SEARCH_CREDENTIALS_MISSING'
  | 'SEARCH_ACCESS_DENIED'
  | 'SEARCH_TOOL_UNAVAILABLE'
  | 'SEARCH_RATE_LIMITED'
  | 'SEARCH_NETWORK_ERROR'
  | 'SEARCH_PROVIDER_ERROR';

@Injectable()
export class ProductSearchService {
  private readonly logger = new Logger(ProductSearchService.name);

  constructor(private readonly config: ConfigService) {}

  async searchSameProduct(rawInput: ProductSearchInput): Promise<ProductSearchResult> {
    const input = productSearchInputSchema.parse(rawInput);
    if (this.config.get<string>('PRODUCT_DATA_MODE', 'sample') !== 'web_search') {
      throw new ServiceUnavailableException('PRODUCT_DATA_MODE must be web_search');
    }

    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw createSearchProviderUnavailableException(
        'SEARCH_CREDENTIALS_MISSING',
        false,
      );
    }

    const officialDomainRegistry = parseBrandOfficialDomainRegistry(
      this.config.get<string>('BRAND_OFFICIAL_DOMAINS_JSON'),
    );
    const registeredBrandOfficialDomain = input.brand_id
      ? officialDomainRegistry.get(input.brand_id) ?? null
      : null;
    const allowedDomains = buildAllowedSearchDomains(registeredBrandOfficialDomain);
    assertAllowedSellerUrl(input.product_url, allowedDomains);

    const client = new OpenAI({
      apiKey,
      timeout: Number(this.config.get<string>('OPENAI_TIMEOUT_MS', '20000')),
      maxRetries: 0,
    });

    try {
      const response = await client.responses.parse({
        model: this.config.get<string>('OPENAI_SEARCH_MODEL', this.config.get<string>('OPENAI_MODEL', 'gpt-5.6')),
        instructions: CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS,
        input: buildProductSearchPrompt(
          input,
          allowedDomains,
          registeredBrandOfficialDomain,
        ),
        tools: [
          {
            type: 'web_search',
            filters: { allowed_domains: allowedDomains },
          },
        ],
        tool_choice: 'required',
        include: ['web_search_call.action.sources'],
        store: false,
        text: {
          format: zodTextFormat(productSearchAiResultSchema, 'catchcatch_product_search'),
        },
      });

      if (!response.output_parsed) {
        throw new Error('OpenAI returned no parsed product search output');
      }

      const searchSourceUrls = collectWebSearchSourceUrls(response.output);
      const parsedResult = productSearchAiResultSchema.parse(response.output_parsed);
      assertAnchorProductUnchanged(input.anchor_product, parsedResult.anchor_product);
      for (const sellerResult of parsedResult.seller_results) {
        if (!sellerResult.source) {
          continue;
        }
        if (sellerResult.source.verification_status !== 'UNVERIFIED') {
          throw new Error('AI cannot pre-approve source verification');
        }
        assertAllowedSellerUrl(sellerResult.source.source_url, allowedDomains);
        assertSellerMatchesUrl(
          sellerResult.seller,
          sellerResult.source.source_url,
          registeredBrandOfficialDomain,
        );
        assertUrlWasReturnedByWebSearch(
          sellerResult.source.source_url,
          searchSourceUrls,
        );
      }
      const observedAt = new Date().toISOString();
      const verifiedResult = {
        ...parsedResult,
        seller_results: parsedResult.seller_results.map((sellerResult) => ({
          ...screenCandidateIdentity(input.anchor_product, {
            ...sellerResult,
            source: sellerResult.source
            ? {
                ...sellerResult.source,
                observed_at: observedAt,
                verification_status: 'URL_VERIFIED' as const,
              }
            : null,
          }),
        })),
      };
      return productSearchResultSchema.parse(verifiedResult);
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        this.logger.error(
          `OpenAI web search failed: status=${error.status}, code=${error.code ?? 'unknown'}, request_id=${error.requestID ?? 'unknown'}`,
        );
        const failure = classifyOpenAISearchFailure(error.status);
        throw createSearchProviderUnavailableException(
          failure.code,
          failure.retryable,
        );
      } else {
        this.logger.error('Product search output validation failed');
      }
      throw new ServiceUnavailableException({
        code: 'PRODUCT_SEARCH_OUTPUT_INVALID',
        provider: 'OPENAI_WEB_SEARCH',
        retryable: false,
      });
    }
  }
}

export function classifyOpenAISearchFailure(
  status: number | undefined,
): { code: SearchProviderFailureCode; retryable: boolean } {
  if (status === undefined) {
    return { code: 'SEARCH_NETWORK_ERROR', retryable: true };
  }
  if (status === 401) {
    return { code: 'SEARCH_CREDENTIALS_MISSING', retryable: false };
  }
  if (status === 403) {
    return { code: 'SEARCH_ACCESS_DENIED', retryable: false };
  }
  if (status === 429) {
    return { code: 'SEARCH_RATE_LIMITED', retryable: true };
  }
  if (status === 400 || status === 404) {
    return { code: 'SEARCH_TOOL_UNAVAILABLE', retryable: false };
  }
  return { code: 'SEARCH_PROVIDER_ERROR', retryable: status >= 500 };
}

function createSearchProviderUnavailableException(
  reason: SearchProviderFailureCode,
  retryable: boolean,
): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'PRODUCT_SEARCH_PROVIDER_UNAVAILABLE',
    provider: 'OPENAI_WEB_SEARCH',
    reason,
    retryable,
  });
}

export function buildAllowedSearchDomains(
  registeredBrandOfficialDomain: string | null,
): string[] {
  const domains: string[] = Object.values(FIXED_SELLER_DOMAINS);
  if (registeredBrandOfficialDomain) {
    if (!domains.includes(registeredBrandOfficialDomain)) {
      domains.push(registeredBrandOfficialDomain);
    }
  }
  return domains;
}

type WebSearchOutputItem = {
  type?: string;
  action?: {
    type?: string;
    url?: string | null;
    sources?: Array<{ url?: string }>;
  };
};

export function collectWebSearchSourceUrls(output: unknown): Set<string> {
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

function assertUrlWasReturnedByWebSearch(
  value: string,
  sourceUrls: Set<string>,
): void {
  if (!sourceUrls.has(normalizeSellerPageUrl(value))) {
    throw new Error('Source URL was not returned by web search');
  }
}

export function assertAnchorProductUnchanged(
  expected: ProductIdentity,
  actual: ProductIdentity,
): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error('AI changed the verified anchor product');
  }
}

type SellerSearchResult = ProductSearchResult['seller_results'][number];

export function screenCandidateIdentity(
  anchor: ProductIdentity,
  sellerResult: SellerSearchResult,
): SellerSearchResult {
  if (sellerResult.availability !== 'AVAILABLE' || !sellerResult.candidate_offer) {
    return sellerResult;
  }
  const candidate = sellerResult.candidate_offer;
  const issues: string[] = [];
  compareRequiredIdentity('brand', anchor.brand, candidate.brand, issues);
  compareRequiredIdentity(
    'product_name',
    anchor.normalized_product_name,
    candidate.product_name,
    issues,
    true,
  );
  compareRequiredIdentity('product_type', anchor.product_type, candidate.product_type, issues);
  compareAnchorSpecificIdentity('option', anchor.option, candidate.option, issues);
  compareAnchorSpecificIdentity(
    'shade_or_scent',
    anchor.shade_or_scent,
    candidate.shade_or_scent,
    issues,
  );
  compareAnchorSpecificIdentity(
    'version_or_renewal',
    anchor.version_or_renewal,
    candidate.version_or_renewal,
    issues,
  );
  if (issues.length === 0) {
    return sellerResult;
  }
  return {
    ...sellerResult,
    availability: 'UNKNOWN',
    candidate_offer: null,
    match_evidence: [],
    mismatch_reasons: [...sellerResult.mismatch_reasons, ...issues],
  };
}

function compareRequiredIdentity(
  field: string,
  expected: string | null,
  actual: string | null,
  issues: string[],
  allowContainment = false,
): void {
  if (!expected || !actual) {
    issues.push(`${field} is missing`);
    return;
  }
  const normalizedExpected = normalizeIdentityText(expected);
  const normalizedActual = normalizeIdentityText(actual);
  const matches = allowContainment
    ? normalizedActual.includes(normalizedExpected) || normalizedExpected.includes(normalizedActual)
    : normalizedActual === normalizedExpected;
  if (!matches) {
    issues.push(`${field} conflicts with the verified anchor`);
  }
}

function compareAnchorSpecificIdentity(
  field: string,
  expected: string | null,
  actual: string | null,
  issues: string[],
): void {
  if (!expected) {
    return;
  }
  if (!actual) {
    issues.push(`${field} is missing`);
    return;
  }
  if (normalizeIdentityText(actual) !== normalizeIdentityText(expected)) {
    issues.push(`${field} conflicts with the verified anchor`);
  }
}

function normalizeIdentityText(value: string): string {
  return value.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}
