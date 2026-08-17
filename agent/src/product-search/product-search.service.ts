import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  ProductSearchAiResult,
  ProductSearchInput,
  ProductSearchResult,
  brandOfficialDomainCandidateSchema,
  collectAnchorProductWarnings,
  mergeWarnings,
  productSearchAiResultSchema,
  productSearchInputSchema,
  productSearchResultSchema,
} from './product-search.schema';
import {
  buildProductSearchPrompt,
  CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS,
} from './product-search.prompt';
import {
  ConfigurationCandidateAi,
  ConfigurationCandidateResult,
  ConfigurationSellerAiResult,
  ProductConfigurationSearchAiResult,
  ProductConfigurationSearchInput,
  ProductConfigurationSearchResult,
  productConfigurationSearchAiResultSchema,
  productConfigurationSearchInputSchema,
  productConfigurationSearchResultSchema,
} from './product-configuration-search.schema';
import {
  buildProductConfigurationSearchPrompt,
  CATCHCATCH_PRODUCT_CONFIGURATION_SEARCH_INSTRUCTIONS,
} from './product-configuration-search.prompt';
import {
  buildBrandOfficialDomainCandidatePrompt,
  CATCHCATCH_BRAND_OFFICIAL_DOMAIN_INSTRUCTIONS,
} from './brand-official-domain.prompt';
import { BrandOfficialDomainCache } from './brand-official-domain.cache';
import {
  assertAllowedSellerUrl,
  assertSellerMatchesUrl,
  brandNameMismatchWarning,
  FIXED_SELLER_DOMAINS,
  foreignStorefrontWarning,
  gateBrandOfficialDomainCandidate,
  normalizeDomain,
  normalizeSellerPageUrl,
  sellerPageUrlsReferToSameProduct,
} from '../ai-contracts/seller-domain.policy';
import {
  ProductIdentity,
  Seller,
  SourceMetadata,
  sellerSchema,
} from '../ai-contracts/product-data.schema';
import { parseRequestInput } from '../ai-contracts/request-input';
import { logOpenAIUsage } from '../openai-usage/openai-usage.logger';

const SAMPLE_DATA_WARNING = 'This is sample data, not a real seller result (PRODUCT_DATA_MODE=sample).';
const SAMPLE_BRAND_OFFICIAL_WARNING = 'Brand-official domain discovery does not run in sample mode (PRODUCT_DATA_MODE=sample); BRAND_OFFICIAL is always reported as UNKNOWN.';

// Brand names come from AI-extracted page data, not from a trusted registry,
// so an absurdly long one is a sign of junk or a crafted input rather than a
// real brand. Skipping discovery for those keeps garbage out of the cache
// (whose key is this same text) and out of the discovery prompt.
const MAX_DISCOVERY_BRAND_LENGTH = 100;

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

  // In-process, self-populating cache of brand-official domains that have
  // already passed gateBrandOfficialDomainCandidate, keyed by normalized
  // brand name. No persistence, no database — it exists only to avoid
  // re-running the discovery call for a brand already resolved earlier in
  // this process's lifetime (T5 point 6), and it is bounded by TTL and size
  // so a single wrong discovery cannot be reused indefinitely.
  private readonly brandOfficialDomainCache = new BrandOfficialDomainCache();

  constructor(private readonly config: ConfigService) {}

  async searchSameProduct(rawInput: unknown): Promise<ProductSearchResult> {
    const input = parseRequestInput(productSearchInputSchema, rawInput);
    const relaxedFieldWarnings = collectAnchorProductWarnings(input.anchor_product);

    const mode = this.config.get<string>('PRODUCT_DATA_MODE', 'sample');
    if (mode === 'sample') {
      const allowedDomains = buildAllowedSearchDomains(null);
      assertAllowedSellerUrl(input.product_url, allowedDomains);
      return this.createSampleSearchResult(input, relaxedFieldWarnings);
    }
    if (mode !== 'web_search') {
      throw new ServiceUnavailableException('PRODUCT_DATA_MODE must be sample or web_search');
    }

    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw createSearchProviderUnavailableException(
        'SEARCH_CREDENTIALS_MISSING',
        false,
      );
    }

    const client = new OpenAI({
      apiKey,
      timeout: Number(this.config.get<string>('OPENAI_TIMEOUT_MS', '20000')),
      maxRetries: 0,
    });

    // T5: brand-official domain is no longer a human-curated registry keyed
    // by brand_id (Core no longer supplies a meaningful one). It is
    // discovered from the identified brand name and gated in code before it
    // is ever added to the search allowlist.
    const brandDiscovery = input.anchor_product.brand
      ? await this.discoverBrandOfficialDomain(client, input.anchor_product.brand)
      : { domain: null as string | null, warnings: [] as string[] };
    const allowedDomains = buildAllowedSearchDomains(brandDiscovery.domain);
    assertAllowedSellerUrl(input.product_url, allowedDomains);
    const preSearchWarnings = mergeWarnings(
      relaxedFieldWarnings,
      brandDiscovery.warnings,
    );

    const model = this.resolveSearchModel();
    try {
      const response = await client.responses.parse({
        model,
        instructions: CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS,
        input: buildProductSearchPrompt(
          input,
          allowedDomains,
          brandDiscovery.domain,
        ),
        tools: [
          {
            type: 'web_search',
            search_context_size: this.resolveWebSearchContextSize(),
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
      logOpenAIUsage(this.config, this.logger, 'same_product_search', model, response);

      if (!response.output_parsed) {
        throw new Error('OpenAI returned no parsed product search output');
      }

      const searchSourceUrls = collectWebSearchSourceUrls(response.output);
      const parsedResult = productSearchAiResultSchema.parse(response.output_parsed);
      assertAnchorProductUnchanged(input.anchor_product, parsedResult.anchor_product);

      const observedAt = new Date().toISOString();
      const promoted = parsedResult.seller_results.map((sellerResult) => verifyAndPromoteSellerResult(
        sellerResult,
        {
          allowedDomains,
          brandOfficialDomain: brandDiscovery.domain,
          searchSourceUrls,
          observedAt,
        },
      ));
      const screened = promoted.map(({ result }) => screenCandidateIdentity(input.anchor_product, result));

      const verifiedResult = {
        ...parsedResult,
        warnings: mergeWarnings(
          parsedResult.warnings,
          preSearchWarnings,
          promoted.map((entry) => entry.warning).filter((warning): warning is string => Boolean(warning)),
          screened.flatMap((entry) => entry.warnings),
        ),
        seller_results: screened.map((entry) => entry.result),
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

  async searchAlternativeConfigurations(
    rawInput: unknown,
  ): Promise<ProductConfigurationSearchResult> {
    const input = parseRequestInput(productConfigurationSearchInputSchema, rawInput);
    const relaxedFieldWarnings = collectAnchorProductWarnings(input.anchor_product);
    const targetSellers = resolveConfigurationTargetSellers(input);
    if (targetSellers.length === 0) {
      throw new ServiceUnavailableException({
        code: 'PRODUCT_CONFIGURATION_SEARCH_TARGET_UNAVAILABLE',
        retryable: false,
      });
    }
    const maxCandidatesPerSeller = input.max_candidates_per_seller ?? 2;
    const mode = this.config.get<string>('PRODUCT_DATA_MODE', 'sample');

    if (mode === 'sample') {
      const allowedDomains = buildAllowedSearchDomains(null);
      assertAllowedSellerUrl(input.product_url, allowedDomains);
      return this.createSampleConfigurationSearchResult(
        input,
        relaxedFieldWarnings,
        targetSellers,
      );
    }
    if (mode !== 'web_search') {
      throw new ServiceUnavailableException('PRODUCT_DATA_MODE must be sample or web_search');
    }

    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw createSearchProviderUnavailableException('SEARCH_CREDENTIALS_MISSING', false);
    }

    const client = new OpenAI({
      apiKey,
      timeout: Number(this.config.get<string>(
        'OPENAI_CONFIGURATION_PRIMARY_TIMEOUT_MS',
        '18000',
      )),
      maxRetries: 0,
    });
    const providedBrandDomain = resolveProvidedBrandOfficialDomain(
      input.registered_brand_official_domain,
    );
    const brandDiscovery = providedBrandDomain.domain
      ? providedBrandDomain
      : targetSellers.includes('BRAND_OFFICIAL') && input.anchor_product.brand
        ? await this.discoverBrandOfficialDomain(
          client,
          input.anchor_product.brand,
          this.resolveConfigurationSearchModel(),
        )
        : providedBrandDomain;
    assertAllowedSellerUrl(
      input.product_url,
      buildAllowedSearchDomains(brandDiscovery.domain),
    );
    const model = this.resolveConfigurationSearchModel();
    const reasoningEffort = this.resolveConfigurationReasoningEffort();
    const maxOutputTokens = this.resolveConfigurationMaxOutputTokens();
    const fallbackModel = this.resolveConfigurationFallbackModel();
    const fallbackClient = fallbackModel && fallbackModel !== model
      ? new OpenAI({
        apiKey,
        timeout: this.resolveConfigurationFallbackTimeout(),
        maxRetries: 0,
      })
      : null;
    try {
      const searches = await Promise.allSettled(targetSellers.map(async (seller) => {
        if (seller === 'MUSINSA_BEAUTY') {
          const directResult = await this.searchMusinsaDirect(
            input,
            maxCandidatesPerSeller,
          );
          if (directResult) {
            return directResult;
          }
        }
        const sellerSearchContextSize = this.resolveConfigurationWebSearchContextSize(seller);
        const allowedDomains = buildAllowedSearchDomainsForSellers(
          [seller],
          brandDiscovery.domain,
        );
        if (allowedDomains.length === 0) {
          return {
            sellerResult: {
              seller,
              availability: 'UNKNOWN' as const,
              candidates: [],
              notes: ['No verified domain is available for this seller'],
            },
            warnings: [`${seller}: no verified seller domain was available; web search was skipped`],
          };
        }

        const executeSearch = async (
          activeClient: OpenAI,
          activeModel: string,
          attempt: 'primary' | 'fallback',
        ) => {
          const response = await activeClient.responses.parse({
            model: activeModel,
            instructions: CATCHCATCH_PRODUCT_CONFIGURATION_SEARCH_INSTRUCTIONS,
            input: buildProductConfigurationSearchPrompt(
              input,
              allowedDomains,
              brandDiscovery.domain,
              [seller],
              maxCandidatesPerSeller,
            ),
            reasoning: { effort: reasoningEffort },
            max_output_tokens: maxOutputTokens,
            tools: [{
              type: 'web_search',
              search_context_size: sellerSearchContextSize,
              filters: { allowed_domains: allowedDomains },
            }],
            tool_choice: 'required',
            include: ['web_search_call.action.sources'],
            store: false,
            text: {
              format: zodTextFormat(
                productConfigurationSearchAiResultSchema,
                'catchcatch_product_configuration_search',
              ),
            },
          });
          logOpenAIUsage(
            this.config,
            this.logger,
            `configuration_search:${seller}:${attempt}`,
            activeModel,
            response,
          );

          if (!response.output_parsed) {
            throw new Error('OpenAI returned no parsed product configuration search output');
          }
          const parsedResult = productConfigurationSearchAiResultSchema.parse(response.output_parsed);
          assertAnchorProductUnchanged(input.anchor_product, parsedResult.anchor_product);
          if (
            parsedResult.seller_results.length !== 1 ||
            parsedResult.seller_results[0].seller !== seller
          ) {
            throw new Error(`Expected exactly one ${seller} result`);
          }
        const verified = await this.verifyConfigurationSellerResult(
            input,
            parsedResult.seller_results[0],
            allowedDomains,
            brandDiscovery.domain,
            collectWebSearchSourceUrls(response.output),
            maxCandidatesPerSeller,
          );
          return {
            ...verified,
            warnings: mergeWarnings(parsedResult.warnings, verified.warnings),
          };
        };

        try {
          return await executeSearch(client, model, 'primary');
        } catch (primaryError) {
          if (!fallbackClient || !fallbackModel) {
            throw primaryError;
          }
          this.logger.warn(
            `${seller} ${model} configuration search failed; retrying once with ${fallbackModel}: ${describeConfigurationSearchFailure(primaryError)}`,
          );
          const fallback = await executeSearch(fallbackClient, fallbackModel, 'fallback');
          return {
            ...fallback,
            warnings: mergeWarnings(
              fallback.warnings,
              [`${seller}: primary ${model} search failed; ${fallbackModel} fallback was used`],
            ),
          };
        }
      }));

      const resultWarnings: string[] = [];
      const sellerResults = searches.map((search, index) => {
        const seller = targetSellers[index];
        if (search.status === 'fulfilled') {
          resultWarnings.push(...search.value.warnings);
          return search.value.sellerResult;
        }
        const reason = describeConfigurationSearchFailure(search.reason);
        resultWarnings.push(`${seller}: ${reason}`);
        return {
          seller,
          availability: 'UNKNOWN' as const,
          candidates: [],
          notes: [reason],
        };
      });

      return productConfigurationSearchResultSchema.parse({
        anchor_product: input.anchor_product,
        seller_results: sellerResults,
        warnings: mergeWarnings(
          relaxedFieldWarnings,
          brandDiscovery.warnings,
          resultWarnings,
        ),
      });
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        this.logger.error(
          `OpenAI configuration web search failed: status=${error.status}, code=${error.code ?? 'unknown'}, request_id=${error.requestID ?? 'unknown'}`,
        );
        const failure = classifyOpenAISearchFailure(error.status);
        throw createSearchProviderUnavailableException(failure.code, failure.retryable);
      }
      this.logger.error(
        `Product configuration search output validation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException({
        code: 'PRODUCT_CONFIGURATION_SEARCH_OUTPUT_INVALID',
        provider: 'OPENAI_WEB_SEARCH',
        retryable: false,
      });
    }
  }

  private async verifyConfigurationSellerResult(
    input: ProductConfigurationSearchInput,
    sellerResult: ConfigurationSellerAiResult,
    allowedDomains: string[],
    brandOfficialDomain: string | null,
    searchSourceUrls: Set<string>,
    maxCandidatesPerSeller: number,
  ): Promise<{ sellerResult: ProductConfigurationSearchResult['seller_results'][number]; warnings: string[] }> {
    const candidates: ConfigurationCandidateResult[] = [];
    const notes = [...sellerResult.notes];
    const warnings: string[] = [];
    const observedAt = new Date().toISOString();
    for (const candidate of sellerResult.candidates.slice(0, maxCandidatesPerSeller)) {
      const promoted = verifyAndPromoteConfigurationCandidate(candidate, sellerResult.seller, {
        allowedDomains,
        brandOfficialDomain,
        searchSourceUrls,
        observedAt,
        inputProductUrl: input.product_url,
      });
      if (!promoted.result) {
        notes.push(promoted.reason);
        warnings.push(`${sellerResult.seller}: ${promoted.reason}`);
        continue;
      }
      const screened = screenAlternativeConfigurationCandidate(
        input.anchor_product,
        promoted.result.candidate_offer,
        promoted.result.relation_type,
      );
      warnings.push(...screened.warnings.map((warning) => `${sellerResult.seller}: ${warning}`));
      if (!screened.accepted) {
        const reason = screened.reasons.join('; ');
        notes.push(reason);
        warnings.push(`${sellerResult.seller}: rejected configuration candidate: ${reason}`);
        continue;
      }
      const directVerification = await this.verifyDynamicSellerPage(
        sellerResult.seller,
        promoted.result,
      );
      warnings.push(...directVerification.warnings.map((warning) => `${sellerResult.seller}: ${warning}`));
      if (!directVerification.candidate) {
        notes.push('Direct seller-page verification reported that the offer is not purchasable');
        continue;
      }
      candidates.push(buildConfigurationCandidateResult(
        input.anchor_product,
        directVerification.candidate,
      ));
    }
    return {
      sellerResult: {
        seller: sellerResult.seller,
        availability: candidates.length > 0
          ? 'AVAILABLE'
          : sellerResult.availability === 'NOT_AVAILABLE'
            ? 'NOT_AVAILABLE'
            : 'UNKNOWN',
        candidates,
        notes,
      },
      warnings,
    };
  }

  private async searchMusinsaDirect(
    input: ProductConfigurationSearchInput,
    maxCandidatesPerSeller: number,
  ): Promise<{
    sellerResult: ProductConfigurationSearchResult['seller_results'][number];
    warnings: string[];
  } | null> {
    try {
      const query = [input.anchor_product.brand, input.anchor_product.normalized_product_name]
        .filter(Boolean)
        .join(' ');
      const searchUrl = `https://www.musinsa.com/search/goods?keyword=${encodeURIComponent(query)}`;
      const searchResponse = await fetch(searchUrl, {
        signal: AbortSignal.timeout(this.resolveSellerPageVerificationTimeout()),
        headers: { 'user-agent': 'CatchCatch/1.0 seller-search-adapter' },
      });
      if (!searchResponse.ok) {
        throw new Error(`search HTTP ${searchResponse.status}`);
      }
      const productUrls = extractMusinsaProductUrls(await searchResponse.text(), 5);
      if (productUrls.length === 0) {
        throw new Error('no product URLs were present in the search page');
      }

      const detailResults = await Promise.allSettled(productUrls.map(async (sourceUrl) => {
        const response = await fetch(sourceUrl, {
          redirect: 'manual',
          signal: AbortSignal.timeout(this.resolveSellerPageVerificationTimeout()),
          headers: { 'user-agent': 'CatchCatch/1.0 seller-search-adapter' },
        });
        if (!response.ok) {
          throw new Error(`detail HTTP ${response.status}`);
        }
        return { sourceUrl, facts: extractMusinsaSellerPageFacts(await response.text()) };
      }));
      const successfulDetails = detailResults.flatMap((result) => (
        result.status === 'fulfilled' ? [result.value] : []
      ));
      if (successfulDetails.length === 0) {
        throw new Error('all product detail requests failed');
      }

      const observedAt = new Date().toISOString();
      const candidates: ConfigurationCandidateResult[] = [];
      for (const detail of successfulDetails) {
        if (
          detail.facts.available !== true ||
          !detail.facts.productName ||
          detail.facts.listedSalePrice === null
        ) {
          continue;
        }
        const directCandidate = buildMusinsaDirectConfigurationCandidate(
          input.anchor_product,
          detail.sourceUrl,
          detail.facts,
          observedAt,
        );
        if (!directCandidate) {
          continue;
        }
        const screened = screenAlternativeConfigurationCandidate(
          input.anchor_product,
          directCandidate.candidate_offer,
          directCandidate.relation_type,
        );
        if (!screened.accepted) {
          continue;
        }
        candidates.push(buildConfigurationCandidateResult(
          input.anchor_product,
          directCandidate,
        ));
        if (candidates.length >= maxCandidatesPerSeller) {
          break;
        }
      }

      return {
        sellerResult: {
          seller: 'MUSINSA_BEAUTY',
          availability: candidates.length > 0 ? 'AVAILABLE' : 'UNKNOWN',
          candidates,
          notes: candidates.length > 0
            ? ['Direct Musinsa search and product metadata were used']
            : ['Direct Musinsa search found no verified alternative configuration'],
        },
        warnings: ['MUSINSA_BEAUTY: direct seller search succeeded; OpenAI web search was skipped'],
      };
    } catch (error) {
      this.logger.warn(
        `Direct Musinsa search failed; falling back to OpenAI web search: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  private async verifyDynamicSellerPage(
    seller: Seller,
    candidate: PromotedConfigurationCandidate,
  ): Promise<{
    candidate: PromotedConfigurationCandidate | null;
    warnings: string[];
  }> {
    if (seller !== 'MUSINSA_BEAUTY') {
      return { candidate, warnings: [] };
    }

    try {
      const response = await fetch(candidate.source.source_url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(this.resolveSellerPageVerificationTimeout()),
        headers: { 'user-agent': 'CatchCatch/1.0 seller-page-verifier' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (contentLength > 2_000_000) {
        throw new Error('seller page exceeded the 2 MB verification limit');
      }
      const facts = extractMusinsaSellerPageFacts(await response.text());
      if (facts.available === false) {
        return { candidate: null, warnings: ['direct seller page reports the offer is not purchasable'] };
      }
      if (facts.listedSalePrice === null) {
        throw new Error('current public sale price was not present in page metadata');
      }
      const corrected = candidate.candidate_offer.listed_sale_price !== facts.listedSalePrice;
      return {
        candidate: {
          ...candidate,
          candidate_offer: {
            ...candidate.candidate_offer,
            listed_sale_price: facts.listedSalePrice,
            list_price: facts.listPrice,
          },
          source: {
            ...candidate.source,
            verification_status: 'CONTENT_VERIFIED',
          },
        },
        warnings: corrected
          ? [`direct seller page corrected the AI sale price to ${facts.listedSalePrice}`]
          : [],
      };
    } catch (error) {
      return {
        candidate: {
          ...candidate,
          candidate_offer: {
            ...candidate.candidate_offer,
            list_price: null,
            listed_sale_price: null,
            public_coupon_amount: null,
            automatic_discount_amount: null,
          },
        },
        warnings: [
          `direct seller-page price verification failed; AI price was cleared (${error instanceof Error ? error.message : 'unknown error'})`,
        ],
      };
    }
  }

  // Brand-official discovery is a separate web search driven by the brand
  // extracted from the input product page. A candidate is promoted only when
  // its evidence URL is also present in the provider-returned source list and
  // the domain passes the deterministic gate. Any failure degrades to no
  // official domain, leaving BRAND_OFFICIAL as UNKNOWN.
  private async discoverBrandOfficialDomain(
    client: OpenAI,
    brand: string,
    model = this.resolveSearchModel(),
  ): Promise<{ domain: string | null; warnings: string[] }> {
    const cacheKey = normalizeBrandCacheKey(brand);
    if (!cacheKey || brand.length > MAX_DISCOVERY_BRAND_LENGTH) {
      return { domain: null, warnings: [] };
    }
    const cachedDomain = this.brandOfficialDomainCache.get(cacheKey);
    if (cachedDomain) {
      return { domain: cachedDomain, warnings: buildBrandOfficialDomainWarnings(brand, cachedDomain) };
    }

    try {
      const response = await client.responses.parse({
        model,
        instructions: CATCHCATCH_BRAND_OFFICIAL_DOMAIN_INSTRUCTIONS,
        input: buildBrandOfficialDomainCandidatePrompt(brand),
        tools: [{
          type: 'web_search',
          search_context_size: this.resolveWebSearchContextSize(),
        }],
        tool_choice: 'required',
        include: ['web_search_call.action.sources'],
        store: false,
        text: {
          format: zodTextFormat(brandOfficialDomainCandidateSchema, 'catchcatch_brand_official_domain_candidate'),
        },
      });
      logOpenAIUsage(this.config, this.logger, 'brand_official_discovery', model, response);

      const parsed = brandOfficialDomainCandidateSchema.parse(response.output_parsed);
      const candidate = parsed.candidate_domain;
      if (!candidate) {
        return { domain: null, warnings: [] };
      }

      const gate = gateBrandOfficialDomainCandidate(candidate);
      if (!gate.accepted) {
        this.logger.warn(
          `Rejected brand-official domain candidate "${candidate}" for brand "${brand}": ${gate.reason}`,
        );
        return { domain: null, warnings: [] };
      }
      const sourceUrls = collectWebSearchSourceUrls(response.output);
      if (!hasBrandOfficialDomainSearchEvidence(
        gate.domain,
        parsed.evidence_urls,
        sourceUrls,
      )) {
        this.logger.warn(
          `Rejected brand-official domain candidate "${gate.domain}" for brand "${brand}": no matching web_search source evidence`,
        );
        return { domain: null, warnings: [] };
      }

      this.brandOfficialDomainCache.set(cacheKey, gate.domain);
      this.logger.log(`Promoted web-searched brand-official domain ${gate.domain} for brand "${brand}"`);
      return { domain: gate.domain, warnings: buildBrandOfficialDomainWarnings(brand, gate.domain) };
    } catch (error) {
      this.logger.warn(
        `Brand-official domain discovery failed for brand "${brand}": ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { domain: null, warnings: [] };
    }
  }

  private resolveSearchModel(): string {
    return this.config.get<string>(
      'OPENAI_SEARCH_MODEL',
      this.config.get<string>('OPENAI_MODEL', 'gpt-5.6'),
    );
  }

  private resolveConfigurationSearchModel(): string {
    return this.config.get<string>(
      'OPENAI_CONFIGURATION_SEARCH_MODEL',
      this.resolveSearchModel(),
    );
  }

  private resolveConfigurationFallbackModel(): string | null {
    const value = this.config.get<string>(
      'OPENAI_CONFIGURATION_FALLBACK_MODEL',
      'gpt-5.6-sol',
    ).trim();
    return value || null;
  }

  private resolveConfigurationFallbackTimeout(): number {
    const configured = Number(this.config.get<string>(
      'OPENAI_CONFIGURATION_FALLBACK_TIMEOUT_MS',
      '10000',
    ));
    return Number.isFinite(configured) && configured >= 1000
      ? configured
      : 10000;
  }

  private resolveSellerPageVerificationTimeout(): number {
    const configured = Number(this.config.get<string>(
      'SELLER_PAGE_VERIFICATION_TIMEOUT_MS',
      '3000',
    ));
    return Number.isFinite(configured) && configured >= 500
      ? configured
      : 3000;
  }

  private resolveWebSearchContextSize(): 'low' | 'medium' | 'high' {
    const value = this.config.get<string>('OPENAI_WEB_SEARCH_CONTEXT_SIZE', 'low');
    return value === 'medium' || value === 'high' ? value : 'low';
  }

  private resolveConfigurationWebSearchContextSize(
    seller: Seller,
  ): 'low' | 'medium' | 'high' {
    const value = this.config.get<string>(
      `OPENAI_WEB_SEARCH_CONTEXT_SIZE_${seller}`,
      this.resolveWebSearchContextSize(),
    );
    return value === 'medium' || value === 'high' ? value : 'low';
  }

  private resolveConfigurationReasoningEffort(): 'none' | 'low' | 'medium' | 'high' {
    const value = this.config.get<string>('OPENAI_CONFIGURATION_REASONING_EFFORT', 'low');
    return value === 'none' || value === 'medium' || value === 'high' ? value : 'low';
  }

  private resolveConfigurationMaxOutputTokens(): number {
    const configured = Number(this.config.get<string>(
      'OPENAI_CONFIGURATION_MAX_OUTPUT_TOKENS',
      '4000',
    ));
    return Number.isInteger(configured) && configured >= 1000 && configured <= 16000
      ? configured
      : 4000;
  }

  // Deterministic, non-network fixture path used when PRODUCT_DATA_MODE is
  // "sample" (the .env.example default). It fills seller_results the same
  // shape the real OpenAI web_search path produces and runs it through the
  // same AI-result schema, anchor-unchanged assertion, and identity
  // screening, so it exercises the same output contract Core relies on
  // without requiring OPENAI_API_KEY. Sample mode never calls OpenAI, so
  // brand-official discovery never runs here — BRAND_OFFICIAL is always
  // reported as an honest UNKNOWN, not a fabricated match.
  private createSampleSearchResult(
    input: ProductSearchInput,
    relaxedFieldWarnings: string[],
  ): ProductSearchResult {
    const matchedSeller = identifySellerForUrl(input.product_url, null) ?? sellerSchema.options[0];
    const sampleOffer = buildSampleOfferFromAnchor(input.anchor_product);

    const rawAiResult: ProductSearchAiResult = {
      anchor_product: input.anchor_product,
      warnings: [SAMPLE_DATA_WARNING, SAMPLE_BRAND_OFFICIAL_WARNING],
      seller_results: sellerSchema.options.map((seller) => {
        if (seller === matchedSeller) {
          return {
            seller,
            availability: 'AVAILABLE' as const,
            candidate_offer: sampleOffer,
            match_evidence: ['Sample data filled for the seller matching the input URL'],
            mismatch_reasons: [],
            source: {
              source_type: 'SELLER_PAGE' as const,
              source_url: input.product_url,
              acquisition_method: 'AI_WEB_SEARCH' as const,
              verification_status: 'UNVERIFIED' as const,
            },
          };
        }
        if (seller === 'BRAND_OFFICIAL') {
          return {
            seller,
            availability: 'UNKNOWN' as const,
            candidate_offer: null,
            match_evidence: [],
            mismatch_reasons: [],
            source: null,
          };
        }
        return {
          seller,
          availability: 'NOT_AVAILABLE' as const,
          candidate_offer: null,
          match_evidence: [],
          mismatch_reasons: [],
          source: null,
        };
      }),
    };

    const parsedResult = productSearchAiResultSchema.parse(rawAiResult);
    assertAnchorProductUnchanged(input.anchor_product, parsedResult.anchor_product);
    const observedAt = new Date().toISOString();
    const screened = parsedResult.seller_results.map((sellerResult) => screenCandidateIdentity(input.anchor_product, {
      ...sellerResult,
      source: sellerResult.source
        ? {
            ...sellerResult.source,
            observed_at: observedAt,
            verification_status: 'URL_VERIFIED' as const,
          }
        : null,
    }));
    const verifiedResult = {
      ...parsedResult,
      warnings: mergeWarnings(
        parsedResult.warnings,
        relaxedFieldWarnings,
        screened.flatMap((entry) => entry.warnings),
      ),
      seller_results: screened.map((entry) => entry.result),
    };
    return productSearchResultSchema.parse(verifiedResult);
  }

  private createSampleConfigurationSearchResult(
    input: ProductConfigurationSearchInput,
    relaxedFieldWarnings: string[],
    targetSellers: Seller[],
  ): ProductConfigurationSearchResult {
    const matchedSeller = identifySellerForUrl(input.product_url, null) ?? sellerSchema.options[0];
    const candidateOffer = buildSampleOfferFromAnchor(input.anchor_product);
    candidateOffer.option = candidateOffer.option
      ? `${candidateOffer.option} / 다른 구성 (샘플)`
      : '다른 구성 (샘플)';
    candidateOffer.components = buildSampleAlternativeComponents(input.anchor_product.components);
    const observedAt = new Date().toISOString();

    const rawResult: ProductConfigurationSearchAiResult = {
      anchor_product: input.anchor_product,
      seller_results: targetSellers.map((seller) => ({
        seller,
        availability: seller === matchedSeller ? 'AVAILABLE' as const : 'UNKNOWN' as const,
        candidates: seller === matchedSeller ? [{
          candidate_offer: candidateOffer,
          relation_type: 'SAME_PRODUCT_CONFIGURATION' as const,
          relation_evidence: ['Sample candidate copied from the verified anchor identity'],
          configuration_difference_evidence: ['Sample candidate quantity or option differs from the anchor'],
          source: {
            source_type: 'SELLER_PAGE' as const,
            source_url: input.product_url,
            acquisition_method: 'AI_WEB_SEARCH' as const,
            verification_status: 'UNVERIFIED' as const,
          },
        }] : [],
        notes: [],
      })),
      warnings: [
        SAMPLE_DATA_WARNING,
        ...(targetSellers.includes('BRAND_OFFICIAL') ? [SAMPLE_BRAND_OFFICIAL_WARNING] : []),
      ],
    };
    const parsed = productConfigurationSearchAiResultSchema.parse(rawResult);
    const sellerResults = parsed.seller_results.map((sellerResult) => ({
      ...sellerResult,
      candidates: sellerResult.candidates.map((candidate) => buildConfigurationCandidateResult(
        input.anchor_product,
        {
          ...candidate,
          source: {
            ...candidate.source,
            observed_at: observedAt,
            verification_status: 'URL_VERIFIED' as const,
          },
        },
      )),
    }));
    return productConfigurationSearchResultSchema.parse({
      anchor_product: input.anchor_product,
      seller_results: sellerResults,
      warnings: mergeWarnings(parsed.warnings, relaxedFieldWarnings),
    });
  }
}

// Warnings attached to every request whose search used a discovered
// brand-official domain, on a fresh discovery and on a cache hit alike.
// The first one is unconditional and deliberately so: passing the gate only
// means the candidate was not one of the classes we can recognise as wrong
// (tenancy host, fixed seller, IDN, malformed). Nothing in the pipeline
// checks that the domain is really the brand's, so the result must not be
// handed downstream as if it were a verified fact. The foreign-storefront
// warning stays a separate, conditional line.
export function buildBrandOfficialDomainWarnings(
  brand: string,
  domain: string,
): string[] {
  const warnings = [
    `BRAND_OFFICIAL domain ${domain} was discovered by web_search for brand "${brand}", matched a returned source URL, and passed rule-based checks; it is not verified at seller-page content level and requires separate verification.`,
  ];
  for (const conditionalWarning of [
    brandNameMismatchWarning(brand, domain),
    foreignStorefrontWarning(domain),
  ]) {
    if (conditionalWarning) {
      warnings.push(conditionalWarning);
    }
  }
  return warnings;
}

// Normalizes a brand name into a cache key. Mirrors the identity-text
// normalization used elsewhere in this file (NFKC + strip whitespace/case)
// so "Innisfree" and "이니스프리 " reliably collide with themselves across
// requests without pulling in a separate normalization scheme.
function normalizeBrandCacheKey(brand: string): string {
  return brand.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

// Resolves which registered seller a product URL belongs to, using the same
// fixed domain map and brand-official domain the real search flow validates
// against. Returns null only if the URL matches neither, which should not
// happen once assertAllowedSellerUrl has already accepted the URL.
export function identifySellerForUrl(
  url: string,
  registeredBrandOfficialDomain: string | null,
): Seller | null {
  const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  for (const [seller, domain] of Object.entries(FIXED_SELLER_DOMAINS) as Array<[Seller, string]>) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return seller;
    }
  }
  if (registeredBrandOfficialDomain) {
    const officialHost = normalizeDomain(registeredBrandOfficialDomain);
    if (hostname === officialHost || hostname.endsWith(`.${officialHost}`)) {
      return 'BRAND_OFFICIAL';
    }
  }
  return null;
}

export function buildSampleOfferFromAnchor(anchor: ProductIdentity) {
  return {
    product_name: anchor.normalized_product_name,
    brand: anchor.brand,
    product_type: anchor.product_type,
    option: anchor.option,
    shade_or_scent: anchor.shade_or_scent,
    version_or_renewal: anchor.version_or_renewal,
    list_price: 10000,
    listed_sale_price: 9000,
    public_coupon_amount: null,
    automatic_discount_amount: null,
    shipping_fee: 0,
    discount_conditions: [] as string[],
    shipping_condition: null,
    components: anchor.components,
  };
}

function buildSampleAlternativeComponents(
  components: ProductIdentity['components'],
): ProductIdentity['components'] {
  let changed = false;
  return components.map((component) => {
    if (!changed && component.type === 'MAIN') {
      changed = true;
      return { ...component, quantity: (component.quantity ?? 1) + 1 };
    }
    return { ...component };
  });
}

type PromotedConfigurationCandidate = Omit<ConfigurationCandidateAi, 'source'> & {
  source: SourceMetadata;
};

export function verifyAndPromoteConfigurationCandidate(
  candidate: ConfigurationCandidateAi,
  seller: Seller,
  context: {
    allowedDomains: readonly string[];
    brandOfficialDomain: string | null;
    searchSourceUrls: ReadonlySet<string>;
    observedAt: string;
    inputProductUrl?: string;
  },
): { result: PromotedConfigurationCandidate | null; reason: string } {
  if (candidate.source.verification_status !== 'UNVERIFIED') {
    throw new Error('AI cannot pre-approve source verification');
  }
  assertAllowedSellerUrl(candidate.source.source_url, context.allowedDomains);
  try {
    assertSellerMatchesUrl(seller, candidate.source.source_url, context.brandOfficialDomain);
  } catch (error) {
    return {
      result: null,
      reason: error instanceof Error ? error.message : 'seller domain mismatch',
    };
  }
  assertUrlWasReturnedByWebSearch(candidate.source.source_url, context.searchSourceUrls);
  if (
    seller === 'COUPANG' &&
    context.inputProductUrl &&
    !isCoupangConfigurationUrlBoundToDifferentOption(
      context.inputProductUrl,
      candidate.source.source_url,
      context.searchSourceUrls,
    )
  ) {
    return {
      result: null,
      reason: 'Coupang configuration candidate is not bound to a different option-specific itemId/vendorItemId',
    };
  }
  return {
    result: {
      ...candidate,
      source: {
        ...candidate.source,
        observed_at: context.observedAt,
        verification_status: 'URL_VERIFIED',
      },
    },
    reason: '',
  };
}

type SearchedConfigurationOffer = ConfigurationCandidateAi['candidate_offer'];

export function screenAlternativeConfigurationCandidate(
  anchor: ProductIdentity,
  candidate: SearchedConfigurationOffer,
  relationType: ConfigurationCandidateAi['relation_type'] = 'SAME_PRODUCT_CONFIGURATION',
): { accepted: boolean; reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];
  compareRequiredIdentity('brand', anchor.brand, candidate.brand, reasons);
  compareConfigurationProductName(
    anchor.normalized_product_name,
    candidate.product_name,
    reasons,
  );
  if (anchor.product_type === null) {
    warnings.push('candidate product_type was not compared because the anchor product_type is unknown');
  } else {
    compareRequiredIdentity(
      'product_type',
      anchor.product_type,
      candidate.product_type,
      reasons,
      true,
    );
  }
  compareAnchorSpecificIdentity('shade_or_scent', anchor.shade_or_scent, candidate.shade_or_scent, reasons);
  if (relationType === 'SAME_PRODUCT_CONFIGURATION') {
    compareAnchorSpecificIdentity(
      'version_or_renewal',
      anchor.version_or_renewal,
      candidate.version_or_renewal,
      reasons,
    );
  } else {
    warnings.push('same-line variant may have a different formula or version; equivalent price is reference-only');
  }

  const optionChanged = normalizeNullableIdentityText(anchor.option) !==
    normalizeNullableIdentityText(candidate.option);
  const componentsChanged = JSON.stringify(anchor.components) !== JSON.stringify(candidate.components);
  if (!optionChanged && !componentsChanged) {
    reasons.push('candidate configuration is identical to the verified anchor');
  }
  return { accepted: reasons.length === 0, reasons, warnings };
}

function isCoupangConfigurationUrlBoundToDifferentOption(
  inputProductUrl: string,
  candidateUrl: string,
  searchSourceUrls: ReadonlySet<string>,
): boolean {
  const input = new URL(normalizeSellerPageUrl(inputProductUrl));
  const candidate = new URL(normalizeSellerPageUrl(candidateUrl));
  if (
    input.hostname.toLowerCase().replace(/^www\./, '') !== 'coupang.com' ||
    candidate.hostname.toLowerCase().replace(/^www\./, '') !== 'coupang.com' ||
    input.pathname !== candidate.pathname
  ) {
    return true;
  }

  const optionKeys = ['itemId', 'vendorItemId'] as const;
  const candidateHasOptionId = optionKeys.some((key) => candidate.searchParams.has(key));
  const differsFromInput = optionKeys.some((key) => {
    const inputValue = input.searchParams.get(key);
    const candidateValue = candidate.searchParams.get(key);
    return inputValue !== null && candidateValue !== null && inputValue !== candidateValue;
  });
  if (!candidateHasOptionId || !differsFromInput) {
    return false;
  }

  return [...searchSourceUrls].some((rawSourceUrl) => {
    const source = new URL(normalizeSellerPageUrl(rawSourceUrl));
    if (source.hostname.toLowerCase().replace(/^www\./, '') !== 'coupang.com') {
      return false;
    }
    if (source.pathname !== candidate.pathname) {
      return false;
    }
    return optionKeys.some((key) => {
      const candidateValue = candidate.searchParams.get(key);
      return candidateValue !== null && source.searchParams.get(key) === candidateValue;
    });
  });
}

export function buildConfigurationCandidateResult(
  anchor: ProductIdentity,
  candidate: PromotedConfigurationCandidate,
): ConfigurationCandidateResult {
  const anchorTotal = calculateMainCapacityTotal(
    anchor.components,
    anchor.normalized_product_name,
  );
  const candidateTotal = calculateMainCapacityTotal(
    candidate.candidate_offer.components,
    candidate.candidate_offer.product_name,
  );
  const basis = candidate.candidate_offer.listed_sale_price !== null
    ? { price_basis: 'LISTED_SALE_PRICE' as const, price: candidate.candidate_offer.listed_sale_price }
    : candidate.candidate_offer.list_price !== null
      ? { price_basis: 'LIST_PRICE' as const, price: candidate.candidate_offer.list_price }
      : { price_basis: null, price: null };

  let comparisonStatus: ConfigurationCandidateResult['comparison_status'] = 'UNKNOWN';
  let capacityUnit: ConfigurationCandidateResult['capacity_unit'] = null;
  let equivalentPrice: number | null = null;
  if (anchorTotal && candidateTotal) {
    if (anchorTotal.unit !== candidateTotal.unit) {
      comparisonStatus = 'NOT_COMPARABLE';
    } else {
      capacityUnit = anchorTotal.unit;
      comparisonStatus = anchorTotal.totalAmount === candidateTotal.totalAmount
        ? 'DIRECTLY_COMPARABLE'
        : 'UNIT_COMPARABLE';
      if (basis.price !== null) {
        equivalentPrice = Math.round(
          basis.price * anchorTotal.totalAmount / candidateTotal.totalAmount,
        );
      }
    }
  }

  return {
    ...candidate,
    configuration_summary: summarizeConfiguration(candidate.candidate_offer),
    comparison_status: comparisonStatus,
    price_basis: basis.price_basis,
    basis_price: basis.price,
    capacity_unit: capacityUnit,
    anchor_main_total_amount: anchorTotal?.totalAmount ?? null,
    candidate_main_total_amount: candidateTotal?.totalAmount ?? null,
    equivalent_price: equivalentPrice,
    equivalent_price_scope: equivalentPrice === null
      ? null
      : candidate.relation_type === 'SAME_LINE_VARIANT'
        ? 'REFERENCE_ONLY'
        : 'DIRECT',
  };
}

export function calculateMainCapacityTotal(
  components: ProductIdentity['components'],
  expectedProductName?: string | null,
): { unit: 'ML' | 'G'; totalAmount: number } | null {
  const comparableNames = [
    expectedProductName,
    ...components
      .filter((component) => component.type === 'MAIN')
      .map((component) => component.name),
  ]
    .filter((name): name is string => Boolean(name))
    .map(normalizeComparableComponentName)
    .filter(Boolean);
  const comparableComponents = components.filter((component) => {
    if (component.type === 'MAIN') {
      return true;
    }
    if (!['REFILL', 'MINI', 'TRAVEL'].includes(component.type) || !component.name) {
      return false;
    }
    const componentName = normalizeComparableComponentName(component.name);
    return comparableNames.some((name) => (
      componentName.includes(name) || name.includes(componentName)
    ));
  });
  if (comparableComponents.length === 0) {
    return null;
  }
  let unit: 'ML' | 'G' | null = null;
  let totalAmount = 0;
  for (const component of comparableComponents) {
    if (
      component.capacity_value === null ||
      component.capacity_unit === null ||
      component.quantity === null
    ) {
      return null;
    }
    if (unit !== null && unit !== component.capacity_unit) {
      return null;
    }
    unit = component.capacity_unit;
    totalAmount += component.capacity_value * component.quantity;
  }
  return unit && totalAmount > 0 ? { unit, totalAmount } : null;
}

function normalizeComparableComponentName(value: string): string {
  return normalizeConfigurationProductName(value)
    .replace(/(?:리필|미니|여행용|트래블|본품|증정|기획|세트|더블)/g, '');
}

function summarizeConfiguration(offer: SearchedConfigurationOffer): string {
  const parts = offer.components.map((component) => {
    const label = component.name ?? component.type;
    const capacity = component.capacity_value !== null && component.capacity_unit !== null
      ? `${component.capacity_value}${component.capacity_unit.toLowerCase()}`
      : '용량 미확인';
    const quantity = component.quantity !== null ? `${component.quantity}개` : '수량 미확인';
    return `${label} ${capacity} × ${quantity}`;
  });
  if (parts.length > 0) {
    return parts.join(', ');
  }
  return offer.option ?? '구성 정보 확인 필요';
}

function normalizeNullableIdentityText(value: string | null): string {
  return value === null ? '' : normalizeIdentityText(value);
}

function compareConfigurationProductName(
  expected: string | null,
  actual: string | null,
  issues: string[],
): void {
  if (!expected || !actual) {
    issues.push('product_name is missing');
    return;
  }
  const normalizedExpected = normalizeConfigurationProductName(expected);
  const normalizedActual = normalizeConfigurationProductName(actual);
  if (
    !normalizedExpected ||
    !normalizedActual ||
    (!normalizedActual.includes(normalizedExpected) &&
      !normalizedExpected.includes(normalizedActual))
  ) {
    issues.push('product_name conflicts with the verified anchor');
  }
}

function normalizeConfigurationProductName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*(?:증정|클렌저|미니|마스크|파우치|gift)[^)]*\)/gi, ' ')
    .replace(/spf\s*\d+\+?/gi, ' ')
    .replace(/pa\s*\+{1,4}/gi, ' ')
    .replace(/\d+(?:\.\d+)?\s*(?:ml|g)\b/gi, ' ')
    .replace(/\b\d+\s*(?:개|입|pack)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}]/gu, '');
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

export function resolveConfigurationTargetSellers(
  input: Pick<ProductConfigurationSearchInput, 'product_url' | 'target_sellers'>,
): Seller[] {
  const sourceSeller = identifySellerForUrl(input.product_url, null);
  const requested = input.target_sellers ?? sellerSchema.options;
  return requested.filter((seller) => seller !== sourceSeller);
}

export function buildAllowedSearchDomainsForSellers(
  sellers: readonly Seller[],
  registeredBrandOfficialDomain: string | null,
): string[] {
  const domains: string[] = [];
  for (const seller of sellers) {
    const domain = seller === 'BRAND_OFFICIAL'
      ? registeredBrandOfficialDomain
      : FIXED_SELLER_DOMAINS[seller];
    if (domain && !domains.includes(domain)) {
      domains.push(domain);
    }
  }
  return domains;
}

function resolveProvidedBrandOfficialDomain(
  candidate: string | null | undefined,
): { domain: string | null; warnings: string[] } {
  if (!candidate) {
    return { domain: null, warnings: [] };
  }
  const gate = gateBrandOfficialDomainCandidate(candidate);
  if (!gate.accepted) {
    return {
      domain: null,
      warnings: [`Ignored unverified brand-official domain: ${gate.reason}`],
    };
  }
  return {
    domain: gate.domain,
    warnings: [`Reused verified brand-official domain ${gate.domain}; discovery call was skipped`],
  };
}

function describeConfigurationSearchFailure(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    const failure = classifyOpenAISearchFailure(error.status);
    return `web search failed (${failure.code}, retryable=${failure.retryable})`;
  }
  return `configuration search failed (${error instanceof Error ? error.message : 'unknown error'})`;
}

export function extractMusinsaSellerPageFacts(html: string): {
  productName: string | null;
  listedSalePrice: number | null;
  listPrice: number | null;
  available: boolean | null;
} {
  const metadata = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const property = readHtmlAttribute(tag, 'property');
    const content = readHtmlAttribute(tag, 'content');
    if (property && content !== null) {
      metadata.set(property.toLowerCase(), content.trim());
    }
  }
  const salePrice = parsePositiveInteger(metadata.get('product:price:amount'));
  const listPrice = parsePositiveInteger(metadata.get('product:price:normal_price'));
  const availability = metadata.get('product:availability');
  const rawTitle = metadata.get('og:title') ?? null;
  return {
    productName: rawTitle?.replace(/\s*-\s*후기\s*\|\s*무신사\s*$/i, '').trim() || null,
    listedSalePrice: salePrice,
    listPrice,
    available: availability === undefined
      ? null
      : /^(?:주문가능|in stock|available)$/i.test(availability),
  };
}

export function extractMusinsaProductUrls(html: string, limit = 5): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/(?:https?:\\?\/\\?\/www\.musinsa\.com)?\\?\/products\\?\/(\d+)/gi)) {
    const url = `https://www.musinsa.com/products/${match[1]}`;
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
    if (urls.length >= limit) {
      break;
    }
  }
  return urls;
}

function buildMusinsaDirectConfigurationCandidate(
  anchor: ProductIdentity,
  sourceUrl: string,
  facts: ReturnType<typeof extractMusinsaSellerPageFacts>,
  observedAt: string,
): PromotedConfigurationCandidate | null {
  if (!facts.productName || facts.listedSalePrice === null) {
    return null;
  }
  const components = parseMusinsaTitleComponents(
    facts.productName,
    anchor.normalized_product_name,
  );
  if (components.length === 0) {
    return null;
  }
  return {
    relation_type: 'SAME_PRODUCT_CONFIGURATION',
    candidate_offer: {
      product_name: facts.productName,
      brand: anchor.brand,
      product_type: anchor.product_type,
      option: facts.productName,
      shade_or_scent: anchor.shade_or_scent,
      version_or_renewal: anchor.version_or_renewal,
      list_price: facts.listPrice,
      listed_sale_price: facts.listedSalePrice,
      public_coupon_amount: null,
      automatic_discount_amount: null,
      shipping_fee: null,
      discount_conditions: [],
      shipping_condition: null,
      components,
    },
    relation_evidence: ['Musinsa product metadata contains the anchor product name'],
    configuration_difference_evidence: ['Musinsa product title provides a different capacity or bundle'],
    source: {
      source_type: 'SELLER_PAGE',
      source_url: sourceUrl,
      acquisition_method: 'DIRECT_HTTP',
      verification_status: 'CONTENT_VERIFIED',
      observed_at: observedAt,
    },
  };
}

export function parseMusinsaTitleComponents(
  productName: string,
  anchorProductName: string | null,
): ProductIdentity['components'] {
  if (!anchorProductName) {
    return [];
  }
  const normalizedTitle = normalizeConfigurationProductName(productName);
  const normalizedAnchor = normalizeConfigurationProductName(anchorProductName);
  if (!normalizedTitle.includes(normalizedAnchor)) {
    return [];
  }
  const mainMatch = productName.match(/(\d+(?:\.\d+)?)\s*(ml|g)\b/i);
  if (!mainMatch) {
    return [];
  }
  const lowered = productName.toLowerCase();
  const mainQuantity = /(?:1\s*\+\s*1|더블)/.test(lowered)
    ? 2
    : Number(lowered.match(/\b(?:x|×|\*)\s*(\d+)\b/i)?.[1] ?? '1');
  const unit = mainMatch[2].toUpperCase() as 'ML' | 'G';
  const components: ProductIdentity['components'] = [{
    type: 'MAIN',
    name: anchorProductName,
    capacity_value: Number(mainMatch[1]),
    capacity_unit: unit,
    quantity: mainQuantity,
  }];
  const giftText = [...productName.matchAll(/\((?:\+)?([^)]*)\)/g)]
    .map((match) => match[1])
    .find((text) => /\d+(?:\.\d+)?\s*(?:ml|g)\b/i.test(text)) ?? '';
  const giftMatch = giftText.match(/([^+,(]*?)\s*(\d+(?:\.\d+)?)\s*(ml|g)\b/i);
  if (giftMatch) {
    components.push({
      type: 'OTHER_COSMETIC',
      name: giftMatch[1].trim() || '추가 화장품',
      capacity_value: Number(giftMatch[2]),
      capacity_unit: giftMatch[3].toUpperCase() as 'ML' | 'G',
      quantity: 1,
    });
  }
  return components;
}

function readHtmlAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
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

export function hasBrandOfficialDomainSearchEvidence(
  candidateDomain: string,
  evidenceUrls: readonly string[],
  sourceUrls: ReadonlySet<string>,
): boolean {
  const domain = normalizeDomain(candidateDomain);
  return evidenceUrls.some((rawEvidenceUrl) => {
    try {
      const evidenceUrl = normalizeSellerPageUrl(rawEvidenceUrl);
      const hostname = new URL(evidenceUrl).hostname.toLowerCase().replace(/^www\./, '');
      return (
        (hostname === domain || hostname.endsWith(`.${domain}`)) &&
        sourceUrls.has(evidenceUrl)
      );
    } catch {
      return false;
    }
  });
}

function assertUrlWasReturnedByWebSearch(
  value: string,
  sourceUrls: ReadonlySet<string>,
): void {
  if (![...sourceUrls].some((url) => sellerPageUrlsReferToSameProduct(url, value))) {
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

type AiSellerResult = ProductSearchAiResult['seller_results'][number];
type SellerSearchResult = ProductSearchResult['seller_results'][number];

// T6: assertSellerMatchesUrl is a strict, throwing assertion (correct for
// its other caller, product-identification, which has only one result to
// accept or reject). Here there are up to four independent seller entries
// in one response, and one of them citing a domain that does not match its
// seller code — most commonly BRAND_OFFICIAL when no brand-official domain
// was discovered/gated this request — must not discard the other, good
// entries. So the mismatch is caught locally and downgrades only this one
// entry to UNKNOWN with a warning, the same shape screenCandidateIdentity
// already uses for identity mismatches. assertAllowedSellerUrl and
// assertUrlWasReturnedByWebSearch stay hard, request-level failures: they
// signal the model cited something entirely outside what web_search was
// even allowed to touch, a stronger and more general trust violation than
// "this one seller's URL doesn't match its own domain."
export function verifyAndPromoteSellerResult(
  sellerResult: AiSellerResult,
  context: {
    allowedDomains: readonly string[];
    brandOfficialDomain: string | null;
    searchSourceUrls: ReadonlySet<string>;
    observedAt: string;
  },
): { result: SellerSearchResult; warning: string | null } {
  if (!sellerResult.source) {
    return { result: { ...sellerResult, source: null }, warning: null };
  }
  if (sellerResult.source.verification_status !== 'UNVERIFIED') {
    throw new Error('AI cannot pre-approve source verification');
  }
  assertAllowedSellerUrl(sellerResult.source.source_url, context.allowedDomains);
  try {
    assertSellerMatchesUrl(
      sellerResult.seller,
      sellerResult.source.source_url,
      context.brandOfficialDomain,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'seller domain mismatch';
    return {
      result: {
        ...sellerResult,
        availability: 'UNKNOWN',
        candidate_offer: null,
        match_evidence: [],
        mismatch_reasons: [...sellerResult.mismatch_reasons, reason],
        source: null,
      },
      warning: `Seller result for ${sellerResult.seller} was downgraded to UNKNOWN: ${reason}`,
    };
  }
  assertUrlWasReturnedByWebSearch(sellerResult.source.source_url, context.searchSourceUrls);
  return {
    result: {
      ...sellerResult,
      source: {
        ...sellerResult.source,
        observed_at: context.observedAt,
        verification_status: 'URL_VERIFIED' as const,
      },
    },
    warning: null,
  };
}

export function screenCandidateIdentity(
  anchor: ProductIdentity,
  sellerResult: SellerSearchResult,
): { result: SellerSearchResult; warnings: string[] } {
  if (sellerResult.availability !== 'AVAILABLE' || !sellerResult.candidate_offer) {
    return { result: sellerResult, warnings: [] };
  }
  const candidate = sellerResult.candidate_offer;
  const issues: string[] = [];
  const warnings: string[] = [];
  compareRequiredIdentity('brand', anchor.brand, candidate.brand, issues);
  compareRequiredIdentity(
    'product_name',
    anchor.normalized_product_name,
    candidate.product_name,
    issues,
    true,
  );
  // T7: a null anchor product_type is not evidence of anything — it means
  // identification never resolved one (T4), not that the candidate's
  // product_type is wrong. Treat it as non-discriminating: skip the
  // comparison instead of counting the anchor's own gap as a candidate
  // mismatch, and say so via a warning. A null on the candidate side with a
  // known anchor product_type is unchanged: that is still a real gap in the
  // candidate's own data and keeps counting as a mismatch.
  if (anchor.product_type === null) {
    warnings.push(
      `${sellerResult.seller}: candidate product_type was not compared because the anchor product_type is unknown`,
    );
  } else {
    compareRequiredIdentity('product_type', anchor.product_type, candidate.product_type, issues);
  }
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
    return { result: sellerResult, warnings };
  }
  return {
    result: {
      ...sellerResult,
      availability: 'UNKNOWN',
      candidate_offer: null,
      match_evidence: [],
      mismatch_reasons: [...sellerResult.mismatch_reasons, ...issues],
    },
    warnings,
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
