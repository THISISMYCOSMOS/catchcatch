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

    try {
      const response = await client.responses.parse({
        model: this.config.get<string>('OPENAI_SEARCH_MODEL', this.config.get<string>('OPENAI_MODEL', 'gpt-5.6')),
        instructions: CATCHCATCH_PRODUCT_SEARCH_INSTRUCTIONS,
        input: buildProductSearchPrompt(
          input,
          allowedDomains,
          brandDiscovery.domain,
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
        'OPENAI_CONFIGURATION_SEARCH_TIMEOUT_MS',
        '25000',
      )),
      maxRetries: 0,
    });
    const brandDiscovery = targetSellers.includes('BRAND_OFFICIAL') && input.anchor_product.brand
      ? await this.discoverBrandOfficialDomain(client, input.anchor_product.brand)
      : { domain: null as string | null, warnings: [] as string[] };
    assertAllowedSellerUrl(
      input.product_url,
      buildAllowedSearchDomains(brandDiscovery.domain),
    );
    const allowedDomains = buildAllowedSearchDomainsForSellers(
      targetSellers,
      brandDiscovery.domain,
    );
    if (allowedDomains.length === 0) {
      throw new ServiceUnavailableException({
        code: 'PRODUCT_CONFIGURATION_SEARCH_TARGET_UNAVAILABLE',
        retryable: false,
      });
    }

    try {
      const response = await client.responses.parse({
        model: this.config.get<string>(
          'OPENAI_SEARCH_MODEL',
          this.config.get<string>('OPENAI_MODEL', 'gpt-5.6'),
        ),
        instructions: CATCHCATCH_PRODUCT_CONFIGURATION_SEARCH_INSTRUCTIONS,
        input: buildProductConfigurationSearchPrompt(
          input,
          allowedDomains,
          brandDiscovery.domain,
          targetSellers,
          maxCandidatesPerSeller,
        ),
        tools: [{
          type: 'web_search',
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

      if (!response.output_parsed) {
        throw new Error('OpenAI returned no parsed product configuration search output');
      }

      const parsedResult = productConfigurationSearchAiResultSchema.parse(response.output_parsed);
      assertAnchorProductUnchanged(input.anchor_product, parsedResult.anchor_product);
      const searchSourceUrls = collectWebSearchSourceUrls(response.output);
      const observedAt = new Date().toISOString();
      const resultWarnings: string[] = [];
      const parsedResultsBySeller = new Map(
        parsedResult.seller_results.map((sellerResult) => [sellerResult.seller, sellerResult]),
      );
      const missingSellers = targetSellers.filter((seller) => !parsedResultsBySeller.has(seller));
      if (missingSellers.length > 0) {
        throw new Error(`Requested seller results missing: ${missingSellers.join(', ')}`);
      }
      const sellerResults = targetSellers.map((seller) => {
        const sellerResult = parsedResultsBySeller.get(seller)!;
        const candidates: ConfigurationCandidateResult[] = [];
        const notes = [...sellerResult.notes];
        for (const candidate of sellerResult.candidates.slice(0, maxCandidatesPerSeller)) {
          const promoted = verifyAndPromoteConfigurationCandidate(candidate, sellerResult.seller, {
            allowedDomains,
            brandOfficialDomain: brandDiscovery.domain,
            searchSourceUrls,
            observedAt,
          });
          if (!promoted.result) {
            notes.push(promoted.reason);
            resultWarnings.push(`${sellerResult.seller}: ${promoted.reason}`);
            continue;
          }
          const screened = screenAlternativeConfigurationCandidate(
            input.anchor_product,
            promoted.result.candidate_offer,
          );
          resultWarnings.push(...screened.warnings.map((warning) => `${sellerResult.seller}: ${warning}`));
          if (!screened.accepted) {
            const reason = screened.reasons.join('; ');
            notes.push(reason);
            resultWarnings.push(`${sellerResult.seller}: rejected configuration candidate: ${reason}`);
            continue;
          }
          candidates.push(buildConfigurationCandidateResult(input.anchor_product, promoted.result));
        }

        return {
          seller: sellerResult.seller,
          availability: candidates.length > 0
            ? 'AVAILABLE' as const
            : sellerResult.availability === 'NOT_AVAILABLE'
              ? 'NOT_AVAILABLE' as const
              : 'UNKNOWN' as const,
          candidates,
          notes,
        };
      });

      return productConfigurationSearchResultSchema.parse({
        anchor_product: parsedResult.anchor_product,
        seller_results: sellerResults,
        warnings: mergeWarnings(
          parsedResult.warnings,
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

  // T5 discovery step: a separate, tool-free OpenAI call asking the model to
  // recall (not search) a candidate brand-official domain from the brand
  // name alone. Never throws — any failure (no candidate, malformed output,
  // network/API error, or a candidate that fails the rule-based gate)
  // degrades to "no domain discovered", which is a normal, handled outcome
  // for the caller (BRAND_OFFICIAL stays UNKNOWN), not a search failure.
  private async discoverBrandOfficialDomain(
    client: OpenAI,
    brand: string,
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
        model: this.config.get<string>('OPENAI_SEARCH_MODEL', this.config.get<string>('OPENAI_MODEL', 'gpt-5.6')),
        instructions: CATCHCATCH_BRAND_OFFICIAL_DOMAIN_INSTRUCTIONS,
        input: buildBrandOfficialDomainCandidatePrompt(brand),
        store: false,
        text: {
          format: zodTextFormat(brandOfficialDomainCandidateSchema, 'catchcatch_brand_official_domain_candidate'),
        },
      });

      const candidate = response.output_parsed?.candidate_domain;
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

      this.brandOfficialDomainCache.set(cacheKey, gate.domain);
      this.logger.log(`Promoted brand-official domain ${gate.domain} for brand "${brand}"`);
      return { domain: gate.domain, warnings: buildBrandOfficialDomainWarnings(brand, gate.domain) };
    } catch (error) {
      this.logger.warn(
        `Brand-official domain discovery failed for brand "${brand}": ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { domain: null, warnings: [] };
    }
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
          same_product_evidence: ['Sample candidate copied from the verified anchor identity'],
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
    `BRAND_OFFICIAL domain ${domain} was proposed by the model for brand "${brand}" and passed rule-based checks only; it is not verified to be operated by the brand.`,
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
  compareAnchorSpecificIdentity(
    'version_or_renewal',
    anchor.version_or_renewal,
    candidate.version_or_renewal,
    reasons,
  );

  const optionChanged = normalizeNullableIdentityText(anchor.option) !==
    normalizeNullableIdentityText(candidate.option);
  const componentsChanged = JSON.stringify(anchor.components) !== JSON.stringify(candidate.components);
  if (!optionChanged && !componentsChanged) {
    reasons.push('candidate configuration is identical to the verified anchor');
  }
  return { accepted: reasons.length === 0, reasons, warnings };
}

export function buildConfigurationCandidateResult(
  anchor: ProductIdentity,
  candidate: PromotedConfigurationCandidate,
): ConfigurationCandidateResult {
  const anchorTotal = calculateMainCapacityTotal(anchor.components);
  const candidateTotal = calculateMainCapacityTotal(candidate.candidate_offer.components);
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
  };
}

export function calculateMainCapacityTotal(
  components: ProductIdentity['components'],
): { unit: 'ML' | 'G'; totalAmount: number } | null {
  const mainComponents = components.filter((component) => component.type === 'MAIN');
  if (mainComponents.length === 0) {
    return null;
  }
  let unit: 'ML' | 'G' | null = null;
  let totalAmount = 0;
  for (const component of mainComponents) {
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
  if (input.target_sellers) {
    return [...input.target_sellers];
  }
  const sourceSeller = identifySellerForUrl(input.product_url, null) ?? 'BRAND_OFFICIAL';
  const comparisonSeller: Seller = sourceSeller === 'COUPANG'
    ? 'MUSINSA_BEAUTY'
    : 'COUPANG';
  return [sourceSeller, comparisonSeller];
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
