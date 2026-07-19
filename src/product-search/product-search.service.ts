import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  ProductSearchInput,
  ProductSearchResult,
  productSearchInputSchema,
  productSearchResultSchema,
} from './product-search.schema';
import {
  buildProductSearchPrompt,
  CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS,
} from './product-search.prompt';

const FIXED_SELLER_DOMAINS = ['oliveyoung.co.kr', 'musinsa.com', 'coupang.com'] as const;

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
      throw new ServiceUnavailableException('OPENAI_API_KEY is required in web_search mode');
    }

    const allowedDomains = buildAllowedSearchDomains(input);
    assertAllowedUrl(input.product_url, allowedDomains);

    const client = new OpenAI({
      apiKey,
      timeout: Number(this.config.get<string>('OPENAI_TIMEOUT_MS', '20000')),
      maxRetries: 0,
    });

    try {
      const response = await client.responses.parse({
        model: this.config.get<string>('OPENAI_SEARCH_MODEL', this.config.get<string>('OPENAI_MODEL', 'gpt-5.6')),
        instructions: CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS,
        input: buildProductSearchPrompt(input, allowedDomains),
        tools: [
          {
            type: 'web_search',
            filters: { allowed_domains: allowedDomains },
          },
        ],
        tool_choice: 'required',
        include: ['web_search_call.action.sources'],
        text: {
          format: zodTextFormat(productSearchResultSchema, 'catchcatch_product_search'),
        },
      });

      if (!response.output_parsed) {
        throw new Error('OpenAI returned no parsed product search output');
      }

      for (const offer of response.output_parsed.offers) {
        assertAllowedUrl(offer.source_url, allowedDomains);
        assertSellerMatchesUrl(
          offer.seller,
          offer.source_url,
          input.brand_official_domain,
        );
      }
      const sellers = new Set(response.output_parsed.offers.map((offer) => offer.seller));
      if (sellers.size !== response.output_parsed.offers.length) {
        throw new Error('Search output contains duplicate sellers');
      }
      assertAllowedUrl(response.output_parsed.anchor_product.source_url, allowedDomains);
      return response.output_parsed;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        this.logger.error(
          `OpenAI web search failed: status=${error.status}, code=${error.code ?? 'unknown'}, request_id=${error.requestID ?? 'unknown'}`,
        );
      } else {
        this.logger.error('Product search output validation failed');
      }
      throw new ServiceUnavailableException('PRODUCT_SEARCH_FAILED');
    }
  }
}

export function buildAllowedSearchDomains(input: ProductSearchInput): string[] {
  const domains: string[] = [...FIXED_SELLER_DOMAINS];
  if (input.brand_official_domain) {
    const normalized = normalizeDomain(input.brand_official_domain);
    if (!domains.includes(normalized)) {
      domains.push(normalized);
    }
  }
  return domains;
}

function normalizeDomain(value: string): string {
  const withProtocol = value.includes('://') ? value : `https://${value}`;
  return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, '');
}

function assertAllowedUrl(value: string, allowedDomains: string[]): void {
  const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  const isAllowed = allowedDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  if (!isAllowed) {
    throw new Error('URL is outside registered seller domains');
  }
}

function assertSellerMatchesUrl(
  seller: 'OLIVE_YOUNG' | 'MUSINSA_BEAUTY' | 'COUPANG' | 'BRAND_OFFICIAL',
  value: string,
  brandOfficialDomain: string | null,
): void {
  const expectedDomain = seller === 'BRAND_OFFICIAL'
    ? brandOfficialDomain && normalizeDomain(brandOfficialDomain)
    : {
        OLIVE_YOUNG: 'oliveyoung.co.kr',
        MUSINSA_BEAUTY: 'musinsa.com',
        COUPANG: 'coupang.com',
      }[seller];
  if (!expectedDomain) {
    throw new Error('Brand official domain is not registered');
  }
  assertAllowedUrl(value, [expectedDomain]);
}
