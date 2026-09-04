import { createHash, randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Json, Row } from '../database/database.types';
import {
  AnalysisOfferRepository,
  AnalysisRepository,
  ProductComponentRepository,
  ProductRepository,
  SellerOfferComponentRepository,
  SellerOfferRepository,
  UserPreferenceRepository,
} from '../database/repositories/repository.interfaces';
import {
  ANALYSIS_OFFER_REPOSITORY,
  ANALYSIS_REPOSITORY,
  PRODUCT_COMPONENT_REPOSITORY,
  PRODUCT_REPOSITORY,
  SELLER_OFFER_COMPONENT_REPOSITORY,
  SELLER_OFFER_REPOSITORY,
  USER_PREFERENCE_REPOSITORY,
} from '../database/repositories/repository.tokens';
import { calculateMarketEffectivePrice } from '../domain/calculations';
import { rankRecommendedOffers } from '../domain/recommendation-ranking';
import { AllowedConclusion, CapacityUnit, ComparisonStatus, CriterionStatus, UserCriterion, Verdict, WarningCode } from '../domain/types';
import { IngestOffersDto, ResolveProductDto, SaveJudgmentDto } from './dto/internal-contract.dto';
import { SearchQuotaService } from '../search-quota/search-quota.service';
import { BigroomCatalogService } from '../bigroom/bigroom-catalog.service';
import { CoupangPartnersService } from './coupang-partners.service';

type ProductComponentContract = {
  type: 'MAIN' | 'REFILL' | 'MINI' | 'TRAVEL' | 'OTHER_COSMETIC' | 'NON_COSMETIC_GIFT';
  name: string | null;
  capacity_value: number | null;
  capacity_unit: CapacityUnit | null;
  quantity: number | null;
};

type ProductIdentityContract = {
  brand: string | null;
  normalized_product_name: string | null;
  product_type: string | null;
  option: string | null;
  shade_or_scent: string | null;
  version_or_renewal: string | null;
  components: ProductComponentContract[];
};

type ProductIdentificationContract = {
  identification_status: 'IDENTIFIED' | 'AMBIGUOUS' | 'UNSUPPORTED' | 'UNKNOWN';
  anchor_product: ProductIdentityContract | null;
  preview: {
    seller: string | null;
    listed_price: number | null;
    image_url: string | null;
  } | null;
  source: Record<string, unknown> | null;
  warnings: string[];
};

type CandidateOfferContract = {
  product_name: string | null;
  brand: string | null;
  product_type: string | null;
  option: string | null;
  shade_or_scent: string | null;
  version_or_renewal: string | null;
  list_price: number | null;
  listed_sale_price: number | null;
  public_coupon_amount: number | null;
  automatic_discount_amount: number | null;
  shipping_fee: number | null;
  discount_conditions: string[];
  shipping_condition: string | null;
  components: ProductComponentContract[];
};

type SellerSearchResultContract = {
  seller: string;
  availability: 'AVAILABLE' | 'NOT_AVAILABLE' | 'UNKNOWN';
  candidate_offer: CandidateOfferContract | null;
  match_evidence: string[];
  mismatch_reasons: string[];
  source: {
    source_type: 'SELLER_PAGE';
    source_url: string;
    acquisition_method: 'AI_WEB_SEARCH' | 'DIRECT_HTTP';
    observed_at: string;
    verification_status: 'UNVERIFIED' | 'URL_VERIFIED' | 'CONTENT_VERIFIED' | 'REJECTED';
  } | null;
};

type ProductSearchContract = {
  anchor_product: ProductIdentityContract;
  seller_results: SellerSearchResultContract[];
  warnings: string[];
};

export type ResolvedProductResponse = {
  productId: string;
  brandId: string | null;
  cachedSellerOffers: CachedSellerOfferResponse[];
};

export type CachedSellerOfferResponse = {
  seller: string;
  source_url: string;
  observed_at: string;
  candidate_offer: CandidateOfferContract;
};

export type PersistSellerOffersResponse = {
  productId: string;
  offers: SellerOfferPersistenceResponse[];
};

export type SellerOfferPersistenceResponse = {
  id: string;
  sellerName: string;
  sellerUrl: string;
  purchaseUrl: string;
  marketEffectivePrice: number | null;
  reusedExisting: boolean;
};

export type JudgmentInputResponse = {
  product_data_mode: 'web_search';
  product: {
    product_id: string;
    identity: {
      brand: string | null;
      normalized_product_name: string | null;
      product_type: string | null;
      option: string | null;
      shade_or_scent: string | null;
      version_or_renewal: string | null;
      components: {
        type: string;
        name: string | null;
        capacity_value: number | null;
        capacity_unit: CapacityUnit | null;
        quantity: number | null;
      }[];
    };
  };
  offers: {
    offer_id: string;
    seller: string;
    product_name: string;
    comparison_status: ComparisonStatus;
    components: {
      type: string;
      name: string | null;
      capacity_value: number | null;
      capacity_unit: CapacityUnit | null;
      quantity: number | null;
    }[];
    public_effective_price: number | null;
    personalized_effective_price: number | null;
    personalized_price_status: 'NOT_EVALUATED' | 'VERIFIED_ELIGIBLE' | 'VERIFIED_INELIGIBLE' | 'UNKNOWN_ELIGIBILITY';
    unit_price: number | null;
    displayed_discount_rate: number | null;
    recent_average_discount_rate: number | null;
    previous_sale_discount_rate: number | null;
    recent_average_price: number | null;
    previous_sale_price: number | null;
    shipping_fee: number | null;
    source: {
      source_type: 'SELLER_PAGE';
      source_url: string;
      acquisition_method: 'AI_WEB_SEARCH' | 'DIRECT_HTTP';
      observed_at: string;
      verification_status: 'CONTENT_VERIFIED';
    };
  }[];
  facts: {
    id: string;
    description: string;
    numeric_values?: number[];
    source_urls: string[];
  }[];
  selected_criteria: UserCriterion[];
  criterion_assessments: {
    criterion: UserCriterion;
    status: CriterionStatus;
    fact_ids: string[];
  }[];
  comparison_price_basis: 'PUBLIC' | 'PERSONALIZED';
  cheapest_offer_id: string | null;
  price_history_status: 'SUFFICIENT' | 'INSUFFICIENT' | 'UNAVAILABLE';
  data_quality: {
    status: 'COMPLETE' | 'PARTIAL' | 'LIMITED';
    warnings: string[];
  };
  allowed_conclusions: AllowedConclusion[];
  allowed_offer_ids: string[];
  calculation_result: Json | null;
};

@Injectable()
export class CoreIntegrationService {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
    @Inject(PRODUCT_COMPONENT_REPOSITORY)
    private readonly productComponents: ProductComponentRepository,
    @Inject(SELLER_OFFER_REPOSITORY)
    private readonly sellerOffers: SellerOfferRepository,
    @Inject(SELLER_OFFER_COMPONENT_REPOSITORY)
    private readonly sellerOfferComponents: SellerOfferComponentRepository,
    @Inject(USER_PREFERENCE_REPOSITORY)
    private readonly preferences: UserPreferenceRepository,
    @Inject(ANALYSIS_REPOSITORY)
    private readonly analyses: AnalysisRepository,
    @Inject(ANALYSIS_OFFER_REPOSITORY)
    private readonly analysisOffers: AnalysisOfferRepository,
    private readonly searchQuota: SearchQuotaService,
    @Optional() private readonly bigroomCatalog?: BigroomCatalogService,
    @Optional() private readonly coupangPartners?: CoupangPartnersService,
  ) {}

  async resolveProduct(input: ResolveProductDto, userId: string): Promise<ResolvedProductResponse> {
    const identification = parseIdentification(input.identification);
    if (identification.identification_status !== 'IDENTIFIED' || !identification.anchor_product) {
      throw new BadRequestException('Only IDENTIFIED products can be resolved');
    }
    await this.searchQuota.consumeForUser(userId, input.idempotencyKey);
    const identity = identification.anchor_product;
    const canonicalName = requiredString(identity.normalized_product_name, 'normalized_product_name');
    const productKey = createProductKey(identity);
    const existing = await this.products.findByProductKey(productKey);
    if (existing) {
      return {
        productId: existing.id,
        brandId: null,
        cachedSellerOffers: await this.buildCachedSellerOffers(existing),
      };
    }

    const product = await this.products.create({
      id: randomUUID(),
      canonical_name: canonicalName,
      brand: identity.brand,
      image_url: identification.preview?.image_url ?? null,
      product_key: productKey,
      product_type: identity.product_type,
      option: identity.option,
      shade_or_scent: identity.shade_or_scent,
      version_or_renewal: identity.version_or_renewal,
      package_type: identity.components.length > 1 ? 'set' : 'single',
    });
    await this.productComponents.createMany(identity.components.map((component) => ({
      id: randomUUID(),
      product_id: product.id,
      component_type: component.type,
      name: component.name,
      capacity_value: component.capacity_value,
      capacity_unit: component.capacity_unit,
      quantity: component.quantity,
    })));
    return { productId: product.id, brandId: null, cachedSellerOffers: [] };
  }

  async ingestOffers(
    productId: string,
    input: IngestOffersDto,
  ): Promise<PersistSellerOffersResponse> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundException(`Product not found: ${productId}`);
    }
    const search = parseSearch(input.search);
    const bigroomResults = await this.findBigroomResults(search.anchor_product);
    const verifiedResults = [...search.seller_results, ...bigroomResults].filter((result) => (
      result.availability === 'AVAILABLE' &&
      result.source?.verification_status === 'CONTENT_VERIFIED' &&
      result.candidate_offer !== null
    ));

    const existingOffers = await this.sellerOffers.findAllByProductId(productId);
    const existingOffersByKey = new Map(existingOffers.map((offer) => [sellerOfferKey(offer), offer]));
    const existingKeys = new Set(existingOffers.map(sellerOfferKey));
    const seenInputKeys = new Set<string>();
    const uniqueVerifiedResults = verifiedResults.filter((result) => {
      const key = sellerResultKey(productId, result);
      if (seenInputKeys.has(key)) {
        seenInputKeys.add(key);
        return false;
      }
      seenInputKeys.add(key);
      return true;
    });
    const rowsToUpsert = await Promise.all(uniqueVerifiedResults.map(async (result) => {
      const offer = result.candidate_offer!;
      const sourceUrl = normalizeUrl(result.source!.source_url);
      const existingOffer = existingOffersByKey.get(sellerResultKey(productId, result));
      const purchaseUrl = result.seller === 'COUPANG'
        ? existingOffer?.purchase_url ?? await this.coupangPartners?.convert(sourceUrl) ?? undefined
        : undefined;
      return {
        id: randomUUID(),
        product_id: productId,
        seller_name: result.seller,
        seller_url: sourceUrl,
        purchase_url: purchaseUrl,
        listed_price: offer.list_price,
        listed_sale_price: offer.listed_sale_price,
        market_effective_price: calculateCoreMarketEffectivePrice(offer),
        user_effective_price: null,
        shipping_fee: offer.shipping_fee,
        public_discount_amount: offer.public_coupon_amount,
        automatic_discount_amount: offer.automatic_discount_amount,
        reward_value: null,
        official_seller_status: null,
        return_policy_status: null,
        delivery_days: null,
        comparison_status: determineOfferComparisonStatus(search.anchor_product, offer),
        app_benefit_advertised: offer.discount_conditions.some((condition) => (
          condition.includes('앱 추가 혜택')
        )),
        is_active: true,
        observed_at: result.source!.observed_at,
      };
    }));
    const upserted = await this.sellerOffers.upsertMany(rowsToUpsert);
    await this.sellerOffers.deactivateExcept(productId, upserted.map((offer) => offer.id));

    const allOffersByKey = new Map<string, { row: Row<'seller_offers'>; reusedExisting: boolean }>();
    for (const offer of upserted) {
      allOffersByKey.set(sellerOfferKey(offer), {
        row: offer,
        reusedExisting: existingKeys.has(sellerOfferKey(offer)),
      });
    }
    const uniqueResults = uniqueBy(verifiedResults, (result) => sellerResultKey(productId, result));
    for (const result of uniqueResults) {
      const item = allOffersByKey.get(sellerResultKey(productId, result));
      if (!item) {
        continue;
      }
      await this.sellerOfferComponents.replaceForSellerOffer(
        item.row.id,
        result.candidate_offer!.components.map((component) => ({
          id: randomUUID(),
          seller_offer_id: item.row.id,
          component_type: component.type,
          name: component.name,
          capacity_value: component.capacity_value,
          capacity_unit: component.capacity_unit,
          quantity: component.quantity,
        })),
      );
    }

    return {
      productId,
      offers: uniqueResults
        .map((result) => allOffersByKey.get(sellerResultKey(productId, result)))
        .filter((item): item is { row: Row<'seller_offers'>; reusedExisting: boolean } => item !== undefined)
        .map((item) => ({
          id: item.row.id,
          sellerName: item.row.seller_name,
          sellerUrl: item.row.seller_url,
          purchaseUrl: item.row.purchase_url ?? item.row.seller_url,
          marketEffectivePrice: item.row.market_effective_price,
          reusedExisting: item.reusedExisting,
        })),
    };
  }

  private async findBigroomResults(
    anchor: ProductIdentityContract,
  ): Promise<SellerSearchResultContract[]> {
    if (!this.bigroomCatalog) return [];
    try {
      const offers = await this.bigroomCatalog.findVerifiedOffers(anchor);
      return offers.map((offer) => ({
        seller: 'BIGROOM',
        availability: 'AVAILABLE',
        candidate_offer: {
          product_name: offer.productName,
          brand: anchor.brand,
          product_type: anchor.product_type,
          option: anchor.option,
          shade_or_scent: anchor.shade_or_scent,
          version_or_renewal: anchor.version_or_renewal,
          list_price: offer.listedPrice,
          listed_sale_price: offer.listedSalePrice,
          public_coupon_amount: offer.publicCouponAmount,
          automatic_discount_amount: null,
          shipping_fee: offer.shippingFee,
          discount_conditions: offer.appBenefitAdvertised
            ? ['앱 추가 혜택 금액은 공개 웹 페이지에서 확인되지 않음']
            : [],
          shipping_condition: offer.shippingFee === 0 ? '무료배송' : null,
          components: offer.components as ProductComponentContract[],
        },
        match_evidence: ['비그룸 공개 상품 상세 페이지에서 상품명·구성·가격을 직접 확인함'],
        mismatch_reasons: [],
        source: {
          source_type: 'SELLER_PAGE',
          source_url: offer.productUrl,
          acquisition_method: 'DIRECT_HTTP',
          observed_at: offer.observedAt,
          verification_status: 'CONTENT_VERIFIED',
        },
      }));
    } catch {
      // Bigroom is an additional zero-AI seller path. Its cache/index failure
      // must not discard otherwise verified seller results or trigger AI.
      return [];
    }
  }

  private async buildCachedSellerOffers(product: Row<'products'>): Promise<CachedSellerOfferResponse[]> {
    const offers = await this.sellerOffers.findAllByProductId(product.id);
    const latestBySeller = new Map<string, Row<'seller_offers'>>();
    for (const offer of offers) {
      if (!isSeller(offer.seller_name) || !offer.observed_at) continue;
      const previous = latestBySeller.get(offer.seller_name);
      if (!previous?.observed_at || previous.observed_at < offer.observed_at) {
        latestBySeller.set(offer.seller_name, offer);
      }
    }
    const cachedOffers = [...latestBySeller.values()];
    const componentRows = await this.sellerOfferComponents.findBySellerOfferIds(
      cachedOffers.map((offer) => offer.id),
    );
    const componentsByOfferId = new Map<string, ProductComponentContract[]>();
    for (const component of componentRows) {
      if (component.component_type === 'UNKNOWN') continue;
      const existing = componentsByOfferId.get(component.seller_offer_id) ?? [];
      existing.push({
        type: component.component_type,
        name: component.name,
        capacity_value: component.capacity_value,
        capacity_unit: component.capacity_unit,
        quantity: component.quantity,
      });
      componentsByOfferId.set(component.seller_offer_id, existing);
    }
    return cachedOffers.map((offer) => ({
      seller: offer.seller_name,
      source_url: offer.seller_url,
      observed_at: offer.observed_at!,
      candidate_offer: {
        product_name: product.canonical_name,
        brand: product.brand,
        product_type: product.product_type,
        option: product.option,
        shade_or_scent: product.shade_or_scent,
        version_or_renewal: product.version_or_renewal,
        list_price: offer.listed_price,
        listed_sale_price: offer.listed_sale_price,
        public_coupon_amount: offer.public_discount_amount,
        automatic_discount_amount: offer.automatic_discount_amount,
        shipping_fee: offer.shipping_fee,
        discount_conditions: [],
        shipping_condition: null,
        components: componentsByOfferId.get(offer.id) ?? [],
      },
    }));
  }

  async buildJudgmentInput(analysisId: string, userId: string): Promise<JudgmentInputResponse> {
    const analysis = await this.findOwnedAnalysis(analysisId, userId);
    if (!analysis.product_id) {
      throw new NotFoundException(`Analysis product not found: ${analysisId}`);
    }
    const [product, components, snapshots, preferences] = await Promise.all([
      this.products.findById(analysis.product_id),
      this.productComponents.findByProductId(analysis.product_id),
      this.analysisOffers.findByAnalysisId(analysis.id),
      this.preferences.findByUserId(userId),
    ]);
    if (!product) {
      throw new NotFoundException(`Product not found: ${analysis.product_id}`);
    }
    const selectedCriteria = preferences?.selected_criteria ?? analysis.selected_criteria;
    const verifiedSnapshots = snapshots.filter(isContentVerifiedSnapshot);
    if (verifiedSnapshots.length === 0) {
      throw new BadRequestException('No CONTENT_VERIFIED offer snapshots are available for judgment');
    }
    const comparableOfferIds = new Set(verifiedSnapshots
      .filter((snapshot) => isComparable(snapshot))
      .map((snapshot) => snapshot.seller_identifier));
    const rankedOfferIds = getStringArrayResultValue(analysis.result_json, 'recommendedOfferIds');
    const allowedOfferIds = rankedOfferIds
      .filter((offerId) => comparableOfferIds.has(offerId))
      .slice(0, 3);
    if (allowedOfferIds.length === 0) {
      allowedOfferIds.push(...rankRecommendedOffers(verifiedSnapshots, selectedCriteria));
    }
    const facts = buildFacts(analysis, product, verifiedSnapshots);
    const comparisonBasis = determineComparisonBasis(verifiedSnapshots);
    const cheapestOfferId = getContextCheapestOfferId(verifiedSnapshots, comparisonBasis);
    const recentAveragePrice = getNumericResultValue(analysis.result_json, 'recentAveragePrice');
    const previousSalePrice = getNumericResultValue(analysis.result_json, 'previousSalePrice');
    return {
      product_data_mode: 'web_search',
      product: {
        product_id: product.id,
        identity: {
          brand: product.brand,
          normalized_product_name: product.canonical_name,
          product_type: product.product_type,
          option: product.option,
          shade_or_scent: product.shade_or_scent,
          version_or_renewal: product.version_or_renewal,
          components: components.map((component) => ({
            type: component.component_type,
            name: component.name,
            capacity_value: component.capacity_value,
            capacity_unit: component.capacity_unit,
            quantity: component.quantity,
          })),
        },
      },
      offers: verifiedSnapshots.map((snapshot) => ({
        offer_id: snapshot.seller_identifier,
        seller: toAiSeller(snapshot.seller_name),
        product_name: product.canonical_name,
        comparison_status: getSnapshotComparisonStatus(snapshot),
        components: getSnapshotComponents(snapshot),
        public_effective_price: snapshot.market_effective_price,
        personalized_effective_price: snapshot.user_discount !== null ? snapshot.user_effective_price : null,
        personalized_price_status: getPersonalizedPriceStatus(snapshot),
        unit_price: snapshot.calculated_unit_price,
        displayed_discount_rate: calculateDisplayedDiscountRate(snapshot),
        recent_average_discount_rate: getNumericResultValue(analysis.result_json, 'discountRateFromRecentAverage'),
        previous_sale_discount_rate: getNumericResultValue(analysis.result_json, 'savingRateFromPreviousSale'),
        recent_average_price: recentAveragePrice,
        previous_sale_price: previousSalePrice,
        shipping_fee: snapshot.shipping_fee,
        source: {
          source_type: 'SELLER_PAGE',
          source_url: getSnapshotSourceUrl(snapshot) ?? analysis.source_url,
          acquisition_method: toAiSeller(snapshot.seller_name) === 'BIGROOM'
            ? 'DIRECT_HTTP'
            : 'AI_WEB_SEARCH',
          observed_at: getSnapshotObservedAt(snapshot) ?? snapshot.created_at,
          verification_status: 'CONTENT_VERIFIED',
        },
      })),
      facts,
      selected_criteria: selectedCriteria,
      criterion_assessments: buildCriterionAssessments(selectedCriteria, facts, verifiedSnapshots, analysis),
      comparison_price_basis: comparisonBasis,
      cheapest_offer_id: cheapestOfferId,
      price_history_status: analysis.warning_codes.includes('PRICE_HISTORY_INSUFFICIENT')
        ? 'INSUFFICIENT'
        : verifiedSnapshots.length === 0 ? 'UNAVAILABLE' : 'SUFFICIENT',
      data_quality: {
        status: verifiedSnapshots.length === 0 ? 'LIMITED' : analysis.warning_codes.length > 0 ? 'PARTIAL' : 'COMPLETE',
        warnings: analysis.warning_codes,
      },
      allowed_conclusions: analysis.allowed_conclusions,
      allowed_offer_ids: allowedOfferIds,
      calculation_result: analysis.result_json,
    };
  }

  async saveJudgmentResult(
    analysisId: string,
    userId: string,
    input: SaveJudgmentDto,
  ) {
    const analysis = await this.findOwnedAnalysis(analysisId, userId);
    const context = await this.buildJudgmentInput(analysisId, userId);
    validateJudgment(input.judgment, context);
    const resultJson = {
      ...(isJsonObject(analysis.result_json) ? analysis.result_json : {}),
      aiJudgment: input.judgment as Json,
      aiMetadata: {
        schemaVersion: input.schemaVersion,
      },
    };
    const updated = await this.analyses.updateResult(analysis.id, {
      status: 'COMPLETED',
      verdict: getJudgmentConclusion(input.judgment),
      allowed_conclusions: analysis.allowed_conclusions,
      warning_codes: mergeWarnings(analysis.warning_codes, input.judgment),
      result_json: resultJson as Json,
    });
    return {
      id: updated.id,
      status: updated.status,
      verdict: updated.verdict,
      productId: updated.product_id,
      allowedConclusions: updated.allowed_conclusions,
      selectedCriteria: updated.selected_criteria,
      warningCodes: updated.warning_codes,
      result: updated.result_json,
    };
  }

  private async findOwnedAnalysis(analysisId: string, userId: string): Promise<Row<'analyses'>> {
    const analysis = await this.analyses.findById(analysisId);
    if (!analysis) {
      throw new NotFoundException(`Analysis not found: ${analysisId}`);
    }
    if (analysis.user_id !== userId) {
      throw new ForbiddenException('Cannot access another user analysis');
    }
    return analysis;
  }
}

function parseIdentification(value: Record<string, unknown>): ProductIdentificationContract {
  if (!isRecord(value)) {
    throw new BadRequestException('Invalid product identification payload');
  }
  const status = value.identification_status;
  if (!isIdentificationStatus(status)) {
    throw new BadRequestException('Invalid product identification status');
  }
  const anchorProduct = value.anchor_product === null
    ? null
    : parseProductIdentity(value.anchor_product, 'anchor_product');
  const preview = value.preview === null ? null : parseIdentificationPreview(value.preview);
  if (value.source !== null && value.source !== undefined && !isRecord(value.source)) {
    throw new BadRequestException('Invalid product identification source');
  }
  return {
    identification_status: status,
    anchor_product: anchorProduct,
    preview,
    source: (value.source ?? null) as Record<string, unknown> | null,
    warnings: parseStringArray(value.warnings, 'warnings'),
  };
}

function parseSearch(value: Record<string, unknown>): ProductSearchContract {
  if (!isRecord(value)) {
    throw new BadRequestException('Invalid product search payload');
  }
  const anchorProduct = parseProductIdentity(value.anchor_product, 'anchor_product');
  if (!Array.isArray(value.seller_results)) {
    throw new BadRequestException('seller_results must be an array');
  }
  const seenSellers = new Set<string>();
  const sellerResults = value.seller_results.map((item, index) => {
    const result = parseSellerSearchResult(item, `seller_results[${index}]`);
    if (seenSellers.has(result.seller)) {
      throw new BadRequestException('A seller cannot appear more than once in seller_results');
    }
    seenSellers.add(result.seller);
    return result;
  });
  return {
    anchor_product: anchorProduct,
    seller_results: sellerResults,
    warnings: parseStringArray(value.warnings, 'warnings'),
  };
}

function requiredString(value: string | null, name: string): string {
  if (!value) {
    throw new BadRequestException(`${name} is required`);
  }
  return value;
}

function createProductKey(identity: ProductIdentityContract): string {
  const components = identity.components
    .map((component) => [
      normalizeIdentityText(component.type),
      normalizeNumber(component.capacity_value),
      component.capacity_unit ?? '',
      normalizeNumber(component.quantity),
    ].join('|'))
    .sort();
  const canonical = [
    normalizeIdentityText(identity.brand),
    normalizeIdentityText(identity.normalized_product_name),
    normalizeIdentityText(identity.product_type),
    normalizeIdentityText(identity.option),
    normalizeIdentityText(identity.shade_or_scent),
    normalizeIdentityText(identity.version_or_renewal),
    components.join(';'),
  ].join('::');
  return `identity:v2:${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`;
}

function normalizeIdentityText(value: string | null): string {
  return (value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumber(value: number | null): string {
  return value === null ? '' : String(value);
}

function parseProductIdentity(value: unknown, path: string): ProductIdentityContract {
  if (!isRecord(value)) {
    throw new BadRequestException(`${path} must be an object`);
  }
  return {
    brand: parseNullableString(value.brand, `${path}.brand`),
    normalized_product_name: parseNullableString(value.normalized_product_name, `${path}.normalized_product_name`),
    product_type: parseNullableString(value.product_type, `${path}.product_type`),
    option: parseNullableString(value.option, `${path}.option`),
    shade_or_scent: parseNullableString(value.shade_or_scent, `${path}.shade_or_scent`),
    version_or_renewal: parseNullableString(value.version_or_renewal, `${path}.version_or_renewal`),
    components: parseArray(value.components, `${path}.components`).map((component, index) => (
      parseProductComponent(component, `${path}.components[${index}]`)
    )),
  };
}

function parseProductComponent(value: unknown, path: string): ProductComponentContract {
  if (!isRecord(value)) {
    throw new BadRequestException(`${path} must be an object`);
  }
  const type = value.type;
  if (
    type !== 'MAIN' &&
    type !== 'REFILL' &&
    type !== 'MINI' &&
    type !== 'TRAVEL' &&
    type !== 'OTHER_COSMETIC' &&
    type !== 'NON_COSMETIC_GIFT'
  ) {
    throw new BadRequestException(`${path}.type is invalid`);
  }
  const quantity = parseNullableNumber(value.quantity, `${path}.quantity`);
  if (quantity !== null && (!Number.isInteger(quantity) || quantity <= 0)) {
    throw new BadRequestException(`${path}.quantity must be a positive integer`);
  }
  const capacityUnit = value.capacity_unit;
  if (capacityUnit !== null && capacityUnit !== 'ML' && capacityUnit !== 'G') {
    throw new BadRequestException(`${path}.capacity_unit is invalid`);
  }
  const capacityValue = parseNullableNumber(value.capacity_value, `${path}.capacity_value`);
  if (capacityValue !== null && capacityValue <= 0) {
    throw new BadRequestException(`${path}.capacity_value must be positive`);
  }
  return {
    type,
    name: parseNullableString(value.name, `${path}.name`),
    capacity_value: capacityValue,
    capacity_unit: capacityUnit,
    quantity,
  };
}

function parseIdentificationPreview(value: unknown): ProductIdentificationContract['preview'] {
  if (!isRecord(value)) {
    throw new BadRequestException('preview must be an object');
  }
  const seller = value.seller;
  if (
    seller !== null &&
    seller !== 'OLIVE_YOUNG' &&
    seller !== 'MUSINSA_BEAUTY' &&
    seller !== 'COUPANG' &&
    seller !== 'ZIGZAG' &&
    seller !== 'BRAND_OFFICIAL'
  ) {
    throw new BadRequestException('preview.seller is invalid');
  }
  const listedPrice = parseNullableNumber(value.listed_price, 'preview.listed_price');
  if (listedPrice !== null && (!Number.isInteger(listedPrice) || listedPrice < 0)) {
    throw new BadRequestException('preview.listed_price must be a nonnegative integer');
  }
  return {
    seller,
    listed_price: listedPrice,
    image_url: parseNullableString(value.image_url, 'preview.image_url'),
  };
}

function parseSellerSearchResult(value: unknown, path: string): SellerSearchResultContract {
  if (!isRecord(value)) {
    throw new BadRequestException(`${path} must be an object`);
  }
  const seller = value.seller;
  if (!isSeller(seller)) {
    throw new BadRequestException(`${path}.seller is invalid`);
  }
  const availability = value.availability;
  if (availability !== 'AVAILABLE' && availability !== 'NOT_AVAILABLE' && availability !== 'UNKNOWN') {
    throw new BadRequestException(`${path}.availability is invalid`);
  }
  const candidateOffer = value.candidate_offer === null
    ? null
    : parseCandidateOffer(value.candidate_offer, `${path}.candidate_offer`);
  const source = value.source === null ? null : parseSource(value.source, `${path}.source`);
  const matchEvidence = parseStringArray(value.match_evidence, `${path}.match_evidence`);
  if (availability === 'AVAILABLE') {
    if (!candidateOffer) throw new BadRequestException(`${path}.candidate_offer is required for AVAILABLE`);
    if (!source) throw new BadRequestException(`${path}.source is required for AVAILABLE`);
    if (matchEvidence.length === 0) throw new BadRequestException(`${path}.match_evidence is required for AVAILABLE`);
  } else if (candidateOffer) {
    throw new BadRequestException(`${path}.candidate_offer is allowed only for AVAILABLE`);
  }
  return {
    seller,
    availability,
    candidate_offer: candidateOffer,
    match_evidence: matchEvidence,
    mismatch_reasons: parseStringArray(value.mismatch_reasons, `${path}.mismatch_reasons`),
    source,
  };
}

function parseCandidateOffer(value: unknown, path: string): CandidateOfferContract {
  if (!isRecord(value)) {
    throw new BadRequestException(`${path} must be an object`);
  }
  return {
    product_name: parseNullableString(value.product_name, `${path}.product_name`),
    brand: parseNullableString(value.brand, `${path}.brand`),
    product_type: parseNullableString(value.product_type, `${path}.product_type`),
    option: parseNullableString(value.option, `${path}.option`),
    shade_or_scent: parseNullableString(value.shade_or_scent, `${path}.shade_or_scent`),
    version_or_renewal: parseNullableString(value.version_or_renewal, `${path}.version_or_renewal`),
    list_price: parseNullableMoney(value.list_price, `${path}.list_price`),
    listed_sale_price: parseNullableMoney(value.listed_sale_price, `${path}.listed_sale_price`),
    public_coupon_amount: parseNullableMoney(value.public_coupon_amount, `${path}.public_coupon_amount`),
    automatic_discount_amount: parseNullableMoney(value.automatic_discount_amount, `${path}.automatic_discount_amount`),
    shipping_fee: parseNullableMoney(value.shipping_fee, `${path}.shipping_fee`),
    discount_conditions: parseStringArray(value.discount_conditions, `${path}.discount_conditions`),
    shipping_condition: parseNullableString(value.shipping_condition, `${path}.shipping_condition`),
    components: parseArray(value.components, `${path}.components`).map((component, index) => (
      parseProductComponent(component, `${path}.components[${index}]`)
    )),
  };
}

function parseSource(value: unknown, path: string): SellerSearchResultContract['source'] {
  if (!isRecord(value)) {
    throw new BadRequestException(`${path} must be an object`);
  }
  if (value.source_type !== 'SELLER_PAGE') {
    throw new BadRequestException(`${path}.source_type is invalid`);
  }
  const sourceUrl = parseRequiredUrl(value.source_url, `${path}.source_url`);
  const acquisitionMethod = value.acquisition_method;
  if (acquisitionMethod !== 'AI_WEB_SEARCH' && acquisitionMethod !== 'DIRECT_HTTP') {
    throw new BadRequestException(`${path}.acquisition_method is invalid`);
  }
  if (typeof value.observed_at !== 'string' || Number.isNaN(Date.parse(value.observed_at))) {
    throw new BadRequestException(`${path}.observed_at is invalid`);
  }
  const verificationStatus = value.verification_status;
  if (
    verificationStatus !== 'UNVERIFIED' &&
    verificationStatus !== 'URL_VERIFIED' &&
    verificationStatus !== 'CONTENT_VERIFIED' &&
    verificationStatus !== 'REJECTED'
  ) {
    throw new BadRequestException(`${path}.verification_status is invalid`);
  }
  return {
    source_type: 'SELLER_PAGE',
    source_url: sourceUrl,
    acquisition_method: acquisitionMethod,
    observed_at: value.observed_at,
    verification_status: verificationStatus,
  };
}

function parseArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${path} must be an array`);
  }
  return value;
}

function parseStringArray(value: unknown, path: string): string[] {
  return parseArray(value, path).map((item, index) => {
    if (typeof item !== 'string') {
      throw new BadRequestException(`${path}[${index}] must be a string`);
    }
    return item;
  });
}

function parseNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException(`${path} must be a non-empty string or null`);
  }
  return value;
}

function parseNullableNumber(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${path} must be a finite number or null`);
  }
  return value;
}

function parseNullableMoney(value: unknown, path: string): number | null {
  const numberValue = parseNullableNumber(value, path);
  if (numberValue !== null && (!Number.isInteger(numberValue) || numberValue < 0)) {
    throw new BadRequestException(`${path} must be a nonnegative integer`);
  }
  return numberValue;
}

function parseRequiredUrl(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${path} must be a URL string`);
  }
  try {
    return new URL(value).toString();
  } catch {
    throw new BadRequestException(`${path} must be a valid URL`);
  }
}

function isIdentificationStatus(value: unknown): value is ProductIdentificationContract['identification_status'] {
  return value === 'IDENTIFIED' || value === 'AMBIGUOUS' || value === 'UNSUPPORTED' || value === 'UNKNOWN';
}

function isSeller(value: unknown): value is SellerSearchResultContract['seller'] {
  return value === 'OLIVE_YOUNG' ||
    value === 'MUSINSA_BEAUTY' ||
    value === 'COUPANG' ||
    value === 'ZIGZAG' ||
    value === 'BRAND_OFFICIAL';
}

function sellerOfferKey(offer: Row<'seller_offers'>): string {
  return `${offer.product_id}:${offer.seller_name.trim().toLowerCase()}:${normalizeUrl(offer.seller_url)}`;
}

function sellerResultKey(productId: string, result: SellerSearchResultContract): string {
  return `${productId}:${result.seller.trim().toLowerCase()}:${normalizeUrl(result.source?.source_url ?? '')}`;
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    if (parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }
    return parsed.toString().replace(/\/$/, parsed.pathname === '/' ? '/' : '');
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

function calculateCoreMarketEffectivePrice(offer: CandidateOfferContract): number | null {
  const discounts = [
    offer.public_coupon_amount === null
      ? null
      : {
        id: 'public-coupon',
        amount: offer.public_coupon_amount,
        applicationStatus: 'APPLICABLE' as const,
        exclusiveGroup: null,
        includedInBasePrice: false,
      },
    offer.automatic_discount_amount === null
      ? null
      : {
        id: 'automatic-discount',
        amount: offer.automatic_discount_amount,
        applicationStatus: 'APPLICABLE' as const,
        exclusiveGroup: null,
        includedInBasePrice: false,
      },
  ].filter((discount): discount is NonNullable<typeof discount> => discount !== null);
  return calculateMarketEffectivePrice({
    listedSalePrice: offer.listed_sale_price ?? offer.list_price,
    shippingFee: offer.shipping_fee,
    discounts,
  });
}

function determineOfferComparisonStatus(
  anchor: ProductIdentityContract,
  offer: CandidateOfferContract,
): ComparisonStatus {
  const anchorMain = mainComponentTotals(anchor.components);
  const offerMain = mainComponentTotals(offer.components);
  // Search results have already passed the product-identity match gate. Keep
  // legacy verified offers eligible when capacity evidence is incomplete;
  // only downgrade when known totals demonstrate a real difference.
  if (!anchorMain || !offerMain) return 'DIRECTLY_COMPARABLE';
  if (
    anchorMain.unit === offerMain.unit &&
    anchorMain.total === offerMain.total
  ) {
    return 'DIRECTLY_COMPARABLE';
  }
  return anchorMain.unit === offerMain.unit ? 'UNIT_COMPARABLE' : 'NOT_COMPARABLE';
}

function mainComponentTotals(
  components: readonly ProductComponentContract[],
): { unit: CapacityUnit; total: number } | null {
  const main = components.filter((component) => component.type === 'MAIN');
  if (main.length === 0) return null;
  const units = new Set(main.map((component) => component.capacity_unit));
  if (units.size !== 1) return null;
  const unit = main[0].capacity_unit;
  if (!unit || main.some((component) => component.capacity_value === null || component.quantity === null)) {
    return null;
  }
  return {
    unit,
    total: main.reduce((sum, component) => sum + component.capacity_value! * component.quantity!, 0),
  };
}

function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isJsonObject(value: unknown): value is Record<string, Json | undefined> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getSnapshotValue(snapshot: Row<'analysis_offers'>, key: string): unknown {
  return isJsonObject(snapshot.offer_snapshot) ? snapshot.offer_snapshot[key] : undefined;
}

function getSnapshotComparisonStatus(snapshot: Row<'analysis_offers'>): ComparisonStatus {
  const value = getSnapshotValue(snapshot, 'comparisonStatus');
  return typeof value === 'string' && [
    'DIRECTLY_COMPARABLE',
    'UNIT_COMPARABLE',
    'NOT_COMPARABLE',
    'UNKNOWN',
  ].includes(value) ? value as ComparisonStatus : 'UNKNOWN';
}

function isComparable(snapshot: Row<'analysis_offers'>): boolean {
  const status = getSnapshotComparisonStatus(snapshot);
  return status === 'DIRECTLY_COMPARABLE' || status === 'UNIT_COMPARABLE';
}

function isContentVerifiedSnapshot(snapshot: Row<'analysis_offers'>): boolean {
  const value = getSnapshotValue(snapshot, 'verificationStatus');
  return value === undefined || value === 'CONTENT_VERIFIED';
}

function getSnapshotSourceUrl(snapshot: Row<'analysis_offers'>): string | null {
  const value = getSnapshotValue(snapshot, 'sourceUrl');
  return typeof value === 'string' ? value : null;
}

function getSnapshotObservedAt(snapshot: Row<'analysis_offers'>): string | null {
  const value = getSnapshotValue(snapshot, 'observedAt');
  return typeof value === 'string' ? value : null;
}

function toAiSeller(sellerName: string): string {
  const normalized = sellerName.toLowerCase();
  if (normalized.includes('bigroom') || normalized.includes('비그룸')) return 'BIGROOM';
  if (normalized.includes('coupang')) return 'COUPANG';
  if (normalized.includes('musinsa')) return 'MUSINSA_BEAUTY';
  if (normalized.includes('olive')) return 'OLIVE_YOUNG';
  if (normalized.includes('zigzag') || normalized.includes('지그재그')) return 'ZIGZAG';
  return 'BRAND_OFFICIAL';
}

function buildFacts(
  analysis: Row<'analyses'>,
  product: Row<'products'>,
  snapshots: readonly Row<'analysis_offers'>[],
): JudgmentInputResponse['facts'] {
  if (snapshots.length === 0) {
    return [{
      id: `analysis:${analysis.id}:product`,
      description: `${product.canonical_name} analysis has no comparable seller offer snapshots.`,
      source_urls: [analysis.source_url],
    }];
  }
  const facts: JudgmentInputResponse['facts'] = [];
  for (const snapshot of snapshots) {
    const sourceUrls = [getSnapshotSourceUrl(snapshot) ?? analysis.source_url];
    facts.push({
      id: `offer:${snapshot.seller_identifier}:price`,
      description: `${snapshot.seller_name} price evidence for ${product.canonical_name}.`,
      numeric_values: [
        snapshot.original_list_price,
        snapshot.sale_price,
        snapshot.market_effective_price,
        snapshot.user_effective_price,
        snapshot.shipping_fee,
        snapshot.calculated_unit_price,
      ].filter((value): value is number => typeof value === 'number'),
      source_urls: sourceUrls,
    });
    const components = getSnapshotComponents(snapshot);
    if (components.length > 0) {
      facts.push({
        id: `offer:${snapshot.seller_identifier}:composition`,
        description: `${snapshot.seller_name} composition evidence with ${components.length} component(s).`,
        numeric_values: components
          .flatMap((component) => [component.capacity_value, component.quantity])
          .filter((value): value is number => typeof value === 'number'),
        source_urls: sourceUrls,
      });
    }
    const deliveryDays = getSnapshotValue(snapshot, 'deliveryDays');
    if (typeof deliveryDays === 'number') {
      facts.push({
        id: `offer:${snapshot.seller_identifier}:delivery`,
        description: `${snapshot.seller_name} delivery speed evidence.`,
        numeric_values: [deliveryDays],
        source_urls: sourceUrls,
      });
    }
    if (snapshot.user_discount !== null) {
      facts.push({
        id: `offer:${snapshot.seller_identifier}:personalized-benefit`,
        description: `${snapshot.seller_name} personalized benefit evidence.`,
        numeric_values: [snapshot.user_discount],
        source_urls: sourceUrls,
      });
    }
  }
  const recentAveragePrice = getNumericResultValue(analysis.result_json, 'recentAveragePrice');
  const verifiedSourceUrls = uniqueBy(
    snapshots.map((snapshot) => getSnapshotSourceUrl(snapshot) ?? analysis.source_url),
    (url) => url,
  );
  if (recentAveragePrice !== null) {
    facts.push({
      id: 'history:recent-average',
      description: `Recent representative market average for ${product.canonical_name}.`,
      numeric_values: [recentAveragePrice],
      source_urls: verifiedSourceUrls,
    });
  }
  const previousSalePrice = getNumericResultValue(analysis.result_json, 'previousSalePrice');
  if (previousSalePrice !== null) {
    facts.push({
      id: 'history:previous-sale',
      description: `Previous verified sale observation for ${product.canonical_name}.`,
      numeric_values: [previousSalePrice],
      source_urls: verifiedSourceUrls,
    });
  }
  return facts;
}

function getSnapshotComponents(snapshot: Row<'analysis_offers'>): JudgmentInputResponse['offers'][number]['components'] {
  const value = getSnapshotValue(snapshot, 'components');
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isSnapshotComponent);
}

function isSnapshotComponent(value: unknown): value is JudgmentInputResponse['offers'][number]['components'][number] {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.type === 'string' &&
    ['MAIN', 'REFILL', 'MINI', 'TRAVEL', 'OTHER_COSMETIC', 'NON_COSMETIC_GIFT'].includes(value.type) &&
    (value.name === null || typeof value.name === 'string') &&
    (value.capacity_value === null || typeof value.capacity_value === 'number') &&
    (value.capacity_unit === null || value.capacity_unit === 'ML' || value.capacity_unit === 'G') &&
    (value.quantity === null || typeof value.quantity === 'number')
  );
}

function getPersonalizedPriceStatus(
  snapshot: Row<'analysis_offers'>,
): JudgmentInputResponse['offers'][number]['personalized_price_status'] {
  if (snapshot.user_discount !== null && snapshot.user_effective_price !== null) {
    return 'VERIFIED_ELIGIBLE';
  }
  return 'NOT_EVALUATED';
}

function calculateDisplayedDiscountRate(snapshot: Row<'analysis_offers'>): number | null {
  if (
    snapshot.original_list_price === null ||
    snapshot.original_list_price === 0 ||
    snapshot.sale_price === null
  ) {
    return null;
  }
  return ((snapshot.original_list_price - snapshot.sale_price) / snapshot.original_list_price) * 100;
}

function getNumericResultValue(resultJson: Json | null, key: string): number | null {
  if (!isJsonObject(resultJson)) {
    return null;
  }
  const value = resultJson[key];
  return typeof value === 'number' ? value : null;
}

function getStringArrayResultValue(resultJson: Json | null, key: string): string[] {
  if (!isJsonObject(resultJson)) {
    return [];
  }
  const value = resultJson[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function determineComparisonBasis(snapshots: readonly Row<'analysis_offers'>[]): 'PUBLIC' | 'PERSONALIZED' {
  const comparable = snapshots.filter(isComparable);
  if (comparable.length === 0) {
    return 'PUBLIC';
  }
  return comparable.every((snapshot) => (
    snapshot.user_discount !== null &&
    snapshot.user_effective_price !== null
  ))
    ? 'PERSONALIZED'
    : 'PUBLIC';
}

function getContextCheapestOfferId(
  snapshots: readonly Row<'analysis_offers'>[],
  basis: 'PUBLIC' | 'PERSONALIZED',
): string | null {
  let cheapest: { id: string; price: number } | null = null;
  for (const snapshot of snapshots) {
    if (!isComparable(snapshot)) continue;
    const price = basis === 'PERSONALIZED'
      ? snapshot.user_effective_price
      : snapshot.market_effective_price;
    if (price === null) continue;
    if (cheapest === null || price < cheapest.price) {
      cheapest = { id: snapshot.seller_identifier, price };
    }
  }
  return cheapest?.id ?? null;
}

function buildCriterionAssessments(
  selectedCriteria: readonly UserCriterion[],
  facts: readonly JudgmentInputResponse['facts'][number][],
  snapshots: readonly Row<'analysis_offers'>[],
  analysis: Row<'analyses'>,
): JudgmentInputResponse['criterion_assessments'] {
  return selectedCriteria.map((criterion) => {
    const factIds = factIdsForCriterion(criterion, facts, snapshots, analysis);
    return {
      criterion,
      status: factIds.length > 0 ? 'NEUTRAL' : 'UNKNOWN',
      fact_ids: factIds,
    };
  });
}

function factIdsForCriterion(
  criterion: UserCriterion,
  facts: readonly JudgmentInputResponse['facts'][number][],
  snapshots: readonly Row<'analysis_offers'>[],
  analysis: Row<'analyses'>,
): string[] {
  if (criterion === 'FINAL_PAYMENT_AMOUNT' && snapshots.some((snapshot) => snapshot.market_effective_price !== null)) {
    return factIdsBySuffix(facts, ':price');
  }
  if (criterion === 'UNIT_PRICE' && snapshots.some((snapshot) => snapshot.calculated_unit_price !== null)) {
    return factIdsBySuffix(facts, ':price').filter((factId) => {
      const offerId = factId.slice('offer:'.length, -':price'.length);
      return snapshots.some((snapshot) => snapshot.seller_identifier === offerId && snapshot.calculated_unit_price !== null);
    });
  }
  if (
    criterion === 'PURCHASE_TIMING' &&
    !analysis.warning_codes.includes('PRICE_HISTORY_INSUFFICIENT') &&
    (getNumericResultValue(analysis.result_json, 'recentAveragePrice') !== null ||
      getNumericResultValue(analysis.result_json, 'previousSalePrice') !== null)
  ) {
    return facts
      .map((fact) => fact.id)
      .filter((id) => id === 'history:recent-average' || id === 'history:previous-sale');
  }
  if (criterion === 'SET_AND_GIFTS' && snapshots.some((snapshot) => getSnapshotComponents(snapshot).length > 1)) {
    return factIdsBySuffix(facts, ':composition');
  }
  if (
    criterion === 'RIGHT_SIZED_PURCHASE' &&
    snapshots.some((snapshot) => snapshot.total_amount !== null && snapshot.unit !== null)
  ) {
    return factIdsBySuffix(facts, ':composition');
  }
  if (
    criterion === 'SIMPLE_DISCOUNT' &&
    snapshots.some((snapshot) => snapshot.original_list_price !== null && snapshot.sale_price !== null)
  ) {
    return [
      ...factIdsBySuffix(facts, ':price'),
      ...facts.map((fact) => fact.id).filter((id) => id.startsWith('history:')),
    ];
  }
  if (criterion === 'FAST_DELIVERY' && snapshots.some((snapshot) => typeof getSnapshotValue(snapshot, 'deliveryDays') === 'number')) {
    return factIdsBySuffix(facts, ':delivery');
  }
  if (criterion === 'REWARDS_AND_MEMBERSHIP' && snapshots.some((snapshot) => snapshot.user_discount !== null)) {
    return factIdsBySuffix(facts, ':personalized-benefit');
  }
  return [];
}

function factIdsBySuffix(
  facts: readonly JudgmentInputResponse['facts'][number][],
  suffix: string,
): string[] {
  return facts.map((fact) => fact.id).filter((id) => id.endsWith(suffix));
}

function validateJudgment(
  judgment: Record<string, unknown>,
  context: JudgmentInputResponse,
): void {
  assertJudgmentShape(judgment);
  const conclusion = getJudgmentConclusion(judgment);
  if (conclusion !== null && !context.allowed_conclusions.includes(conclusion)) {
    throw new BadRequestException('Judgment conclusion is not allowed for this analysis');
  }
  const recommendedOfferId = judgment.recommended_offer_id;
  if (
    recommendedOfferId !== null &&
    recommendedOfferId !== undefined &&
    (typeof recommendedOfferId !== 'string' || !context.allowed_offer_ids.includes(recommendedOfferId))
  ) {
    throw new BadRequestException('Judgment recommended offer is not allowed');
  }
  const knownFactIds = new Set(context.facts.map((fact) => fact.id));
  for (const factId of collectJudgmentFactIds(judgment)) {
    if (!knownFactIds.has(factId)) {
      throw new BadRequestException('Judgment references an unknown fact ID');
    }
  }

  const selected = new Set(context.selected_criteria);
  const criteriaResults = judgment.criteria_results;
  if (!Array.isArray(criteriaResults) || criteriaResults.length !== 3) {
    throw new BadRequestException('Judgment must include exactly three criteria results');
  }
  const criteriaResultSet = new Set<string>();
  for (const result of criteriaResults) {
    if (!isRecord(result) || typeof result.criterion !== 'string' || !selected.has(result.criterion as UserCriterion)) {
      throw new BadRequestException('Judgment criteria result is not selected by the user');
    }
    if (criteriaResultSet.has(result.criterion)) {
      throw new BadRequestException('Judgment criteria results must be distinct');
    }
    criteriaResultSet.add(result.criterion);
  }
  if (criteriaResultSet.size !== selected.size) {
    throw new BadRequestException('Judgment criteria results must match selected criteria');
  }
  const decisionStatus = judgment.decision_status;
  if (decisionStatus !== 'DECIDED' && decisionStatus !== 'INSUFFICIENT_EVIDENCE') {
    throw new BadRequestException('Unsupported judgment decision status');
  }
  if (decisionStatus === 'DECIDED' && conclusion === null) {
    throw new BadRequestException('DECIDED judgment requires a conclusion');
  }
  if (decisionStatus === 'INSUFFICIENT_EVIDENCE' && conclusion !== null) {
    throw new BadRequestException('INSUFFICIENT_EVIDENCE judgment cannot include a conclusion');
  }
  if (
    decisionStatus === 'INSUFFICIENT_EVIDENCE' &&
    isRecord(judgment.confidence) &&
    judgment.confidence.level !== 'LOW'
  ) {
    throw new BadRequestException('INSUFFICIENT_EVIDENCE judgment requires LOW confidence');
  }
  if (decisionStatus === 'INSUFFICIENT_EVIDENCE' && recommendedOfferId !== null && recommendedOfferId !== undefined) {
    throw new BadRequestException('INSUFFICIENT_EVIDENCE judgment cannot recommend an offer');
  }
  const evidenceReview = judgment.evidence_review as Record<string, unknown>;
  assertNoDuplicateStrings(evidenceReview.supporting_fact_ids as string[], 'supporting_fact_ids');
  assertNoDuplicateStrings(evidenceReview.contradicting_fact_ids as string[], 'contradicting_fact_ids');
  const supporting = new Set(evidenceReview.supporting_fact_ids as string[]);
  if ((evidenceReview.contradicting_fact_ids as string[]).some((id) => supporting.has(id))) {
    throw new BadRequestException('Judgment evidence fact IDs cannot overlap');
  }
  assertNoDuplicateStrings(judgment.used_fact_ids as string[], 'used_fact_ids');
  assertNoDuplicateStrings((judgment.confidence as Record<string, unknown>).used_fact_ids as string[], 'confidence.used_fact_ids');
}

function assertJudgmentShape(judgment: Record<string, unknown>): void {
  const evidenceReview = requireRecord(judgment.evidence_review, 'evidence_review');
  requireStringArray(evidenceReview.supporting_fact_ids, 'evidence_review.supporting_fact_ids');
  requireStringArray(evidenceReview.contradicting_fact_ids, 'evidence_review.contradicting_fact_ids');
  requireStringArray(evidenceReview.missing_evidence, 'evidence_review.missing_evidence');
  if (judgment.decision_status !== 'DECIDED' && judgment.decision_status !== 'INSUFFICIENT_EVIDENCE') {
    throw new BadRequestException('Unsupported judgment decision status');
  }
  if (judgment.conclusion !== null) {
    getJudgmentConclusion(judgment);
  }
  requireNonEmptyString(judgment.conclusion_reason, 'conclusion_reason');
  const confidence = requireRecord(judgment.confidence, 'confidence');
  if (confidence.level !== 'HIGH' && confidence.level !== 'MEDIUM' && confidence.level !== 'LOW') {
    throw new BadRequestException('confidence.level is invalid');
  }
  requireNonEmptyString(confidence.reason, 'confidence.reason');
  if (requireStringArray(confidence.used_fact_ids, 'confidence.used_fact_ids').length === 0) {
    throw new BadRequestException('confidence.used_fact_ids is required');
  }
  const criteriaResults = parseArray(judgment.criteria_results, 'criteria_results');
  for (const [index, item] of criteriaResults.entries()) {
    const result = requireRecord(item, `criteria_results[${index}]`);
    if (!isCriterion(result.criterion)) {
      throw new BadRequestException(`criteria_results[${index}].criterion is invalid`);
    }
    if (!isCriterionStatus(result.status)) {
      throw new BadRequestException(`criteria_results[${index}].status is invalid`);
    }
    requireNonEmptyString(result.reason, `criteria_results[${index}].reason`);
    requireStringArray(result.used_fact_ids, `criteria_results[${index}].used_fact_ids`);
  }
  if (judgment.recommended_offer_id !== null && typeof judgment.recommended_offer_id !== 'string') {
    throw new BadRequestException('recommended_offer_id must be a string or null');
  }
  requireNonEmptyString(judgment.recommendation_reason, 'recommendation_reason');
  requireStringArray(judgment.warnings, 'warnings');
  if (requireStringArray(judgment.used_fact_ids, 'used_fact_ids').length === 0) {
    throw new BadRequestException('used_fact_ids is required');
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadRequestException(`${path} must be an object`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException(`${path} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value: unknown, path: string): string[] {
  const strings = parseStringArray(value, path);
  if (strings.some((item) => item.length === 0)) {
    throw new BadRequestException(`${path} cannot contain empty strings`);
  }
  return strings;
}

function assertNoDuplicateStrings(values: string[], path: string): void {
  if (new Set(values).size !== values.length) {
    throw new BadRequestException(`${path} cannot contain duplicates`);
  }
}

function isCriterion(value: unknown): value is UserCriterion {
  return value === 'FINAL_PAYMENT_AMOUNT' ||
    value === 'PURCHASE_TIMING' ||
    value === 'UNIT_PRICE' ||
    value === 'SET_AND_GIFTS' ||
    value === 'RIGHT_SIZED_PURCHASE' ||
    value === 'SIMPLE_DISCOUNT' ||
    value === 'FAST_DELIVERY' ||
    value === 'REWARDS_AND_MEMBERSHIP';
}

function isCriterionStatus(value: unknown): value is CriterionStatus {
  return value === 'POSITIVE' || value === 'NEUTRAL' || value === 'NEGATIVE' || value === 'UNKNOWN';
}

function getJudgmentConclusion(judgment: Record<string, unknown>): Verdict | null {
  const conclusion = judgment.conclusion;
  if (conclusion === null || conclusion === undefined) {
    return null;
  }
  if (
    conclusion === 'LOW_POINT_BUY' ||
    conclusion === 'NEAR_REGULAR_PRICE' ||
    conclusion === 'REASONABLE_BUY'
  ) {
    return conclusion;
  }
  throw new BadRequestException('Unsupported judgment conclusion');
}

function collectJudgmentFactIds(judgment: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const addArray = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') ids.push(item);
      }
    }
  };
  if (isRecord(judgment.evidence_review)) {
    addArray(judgment.evidence_review.supporting_fact_ids);
    addArray(judgment.evidence_review.contradicting_fact_ids);
  }
  addArray(judgment.used_fact_ids);
  if (isRecord(judgment.confidence)) {
    addArray(judgment.confidence.used_fact_ids);
  }
  if (Array.isArray(judgment.criteria_results)) {
    for (const result of judgment.criteria_results) {
      if (isRecord(result)) addArray(result.used_fact_ids);
    }
  }
  return ids;
}

function mergeWarnings(
  existing: WarningCode[],
  judgment: Record<string, unknown>,
): WarningCode[] {
  const warnings = Array.isArray(judgment.warnings)
    ? judgment.warnings.filter((warning): warning is WarningCode => isWarningCode(warning))
    : [];
  return Array.from(new Set([...existing, ...warnings]));
}

function isWarningCode(value: unknown): value is WarningCode {
  return typeof value === 'string' && [
    'PRICE_HISTORY_INSUFFICIENT',
    'LOW_MATCH_CONFIDENCE',
    'COUPON_CONDITION_UNCONFIRMED',
    'SHIPPING_FEE_UNCONFIRMED',
    'OFFICIAL_SELLER_UNCONFIRMED',
    'RETURN_POLICY_UNCONFIRMED',
    'OPTION_CONFIRMATION_REQUIRED',
    'COMPOSITION_UNCLEAR',
    'DATA_OUTDATED',
    'OTHER',
  ].includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
