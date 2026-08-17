import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Json, Row } from '../database/database.types';
import {
  AnalysisOfferRepository,
  AnalysisRepository,
  ProductComponentRepository,
  ProductRepository,
  SellerOfferRepository,
  UserPreferenceRepository,
} from '../database/repositories/repository.interfaces';
import {
  ANALYSIS_OFFER_REPOSITORY,
  ANALYSIS_REPOSITORY,
  PRODUCT_COMPONENT_REPOSITORY,
  PRODUCT_REPOSITORY,
  SELLER_OFFER_REPOSITORY,
  USER_PREFERENCE_REPOSITORY,
} from '../database/repositories/repository.tokens';
import { calculateMarketEffectivePrice } from '../domain/calculations';
import { AllowedConclusion, CapacityUnit, ComparisonStatus, UserCriterion, Verdict, WarningCode } from '../domain/types';
import { IngestOffersDto, ResolveProductDto, SaveJudgmentDto } from './dto/internal-contract.dto';

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
  list_price: number | null;
  listed_sale_price: number | null;
  public_coupon_amount: number | null;
  automatic_discount_amount: number | null;
  shipping_fee: number | null;
  components: ProductComponentContract[];
};

type SellerSearchResultContract = {
  seller: string;
  availability: 'AVAILABLE' | 'NOT_AVAILABLE' | 'UNKNOWN';
  candidate_offer: CandidateOfferContract | null;
  source: {
    source_url: string;
    observed_at: string;
    verification_status: string;
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
};

export type PersistSellerOffersResponse = {
  productId: string;
  offers: SellerOfferPersistenceResponse[];
};

export type SellerOfferPersistenceResponse = {
  id: string;
  sellerName: string;
  sellerUrl: string;
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
      acquisition_method: 'AI_WEB_SEARCH';
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
    status: 'UNKNOWN';
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
    @Inject(USER_PREFERENCE_REPOSITORY)
    private readonly preferences: UserPreferenceRepository,
    @Inject(ANALYSIS_REPOSITORY)
    private readonly analyses: AnalysisRepository,
    @Inject(ANALYSIS_OFFER_REPOSITORY)
    private readonly analysisOffers: AnalysisOfferRepository,
  ) {}

  async resolveProduct(input: ResolveProductDto): Promise<ResolvedProductResponse> {
    const identification = parseIdentification(input.identification);
    if (identification.identification_status !== 'IDENTIFIED' || !identification.anchor_product) {
      throw new BadRequestException('Only IDENTIFIED products can be resolved');
    }
    const identity = identification.anchor_product;
    const canonicalName = requiredString(identity.normalized_product_name, 'normalized_product_name');
    const productKey = createProductKey(identity.brand, canonicalName);
    const existing = await this.products.findByProductKey(productKey);
    if (existing) {
      return { productId: existing.id, brandId: null };
    }

    const product = await this.products.create({
      id: randomUUID(),
      canonical_name: canonicalName,
      brand: identity.brand,
      image_url: identification.preview?.image_url ?? null,
      product_key: productKey,
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
    return { productId: product.id, brandId: null };
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
    const verifiedResults = search.seller_results.filter((result) => (
      result.availability === 'AVAILABLE' &&
      result.source?.verification_status === 'CONTENT_VERIFIED' &&
      result.candidate_offer !== null
    ));

    const existingOffers = await this.sellerOffers.findByProductId(productId);
    const existingKeys = new Set(existingOffers.map(sellerOfferKey));
    const seenInputKeys = new Set<string>();
    const rowsToUpsert = verifiedResults.filter((result) => {
      const key = sellerResultKey(productId, result);
      if (seenInputKeys.has(key)) {
        seenInputKeys.add(key);
        return false;
      }
      seenInputKeys.add(key);
      return true;
    }).map((result) => {
      const offer = result.candidate_offer!;
      return {
        id: randomUUID(),
        product_id: productId,
        seller_name: result.seller,
        seller_url: normalizeUrl(result.source!.source_url),
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
        comparison_status: 'DIRECTLY_COMPARABLE' as const,
        observed_at: result.source!.observed_at,
      };
    });
    const upserted = await this.sellerOffers.upsertMany(rowsToUpsert);

    const allOffersByKey = new Map<string, { row: Row<'seller_offers'>; reusedExisting: boolean }>();
    for (const offer of upserted) {
      allOffersByKey.set(sellerOfferKey(offer), {
        row: offer,
        reusedExisting: existingKeys.has(sellerOfferKey(offer)),
      });
    }

    return {
      productId,
      offers: uniqueBy(verifiedResults, (result) => sellerResultKey(productId, result))
        .map((result) => allOffersByKey.get(sellerResultKey(productId, result)))
        .filter((item): item is { row: Row<'seller_offers'>; reusedExisting: boolean } => item !== undefined)
        .map((item) => ({
          id: item.row.id,
          sellerName: item.row.seller_name,
          sellerUrl: item.row.seller_url,
          marketEffectivePrice: item.row.market_effective_price,
          reusedExisting: item.reusedExisting,
        })),
    };
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
    const allowedOfferIds = verifiedSnapshots
      .filter((snapshot) => isComparable(snapshot))
      .map((snapshot) => snapshot.seller_identifier);
    const facts = buildFacts(analysis, product, verifiedSnapshots);
    const recentAveragePrice = getNumericResultValue(analysis.result_json, 'recentAveragePrice');
    const previousSalePrice = getNumericResultValue(analysis.result_json, 'previousSalePrice');
    return {
      product_data_mode: 'web_search',
      product: {
        product_id: product.id,
        identity: {
          brand: product.brand,
          normalized_product_name: product.canonical_name,
          product_type: null,
          option: null,
          shade_or_scent: null,
          version_or_renewal: null,
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
          acquisition_method: 'AI_WEB_SEARCH',
          observed_at: getSnapshotObservedAt(snapshot) ?? snapshot.created_at,
          verification_status: 'CONTENT_VERIFIED',
        },
      })),
      facts,
      selected_criteria: selectedCriteria,
      criterion_assessments: selectedCriteria.map((criterion) => ({
        criterion,
        status: 'UNKNOWN',
        fact_ids: [],
      })),
      comparison_price_basis: verifiedSnapshots.some((snapshot) => snapshot.user_discount !== null)
        ? 'PERSONALIZED'
        : 'PUBLIC',
      cheapest_offer_id: getCheapestOfferId(analysis.result_json),
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
  return value as ProductIdentificationContract;
}

function parseSearch(value: Record<string, unknown>): ProductSearchContract {
  return value as ProductSearchContract;
}

function requiredString(value: string | null, name: string): string {
  if (!value) {
    throw new BadRequestException(`${name} is required`);
  }
  return value;
}

function createProductKey(brand: string | null, canonicalName: string): string {
  return [brand, canonicalName]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-+|-+$/g, ''))
    .join(':');
}

function sellerOfferKey(offer: Row<'seller_offers'>): string {
  return `${offer.product_id}:${offer.seller_name.trim().toLowerCase()}:${normalizeUrl(offer.seller_url)}`;
}

function sellerResultKey(productId: string, result: SellerSearchResultContract): string {
  return `${productId}:${result.seller.trim().toLowerCase()}:${normalizeUrl(result.source?.source_url ?? '')}`;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
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
  if (normalized.includes('coupang')) return 'COUPANG';
  if (normalized.includes('musinsa')) return 'MUSINSA_BEAUTY';
  if (normalized.includes('olive')) return 'OLIVE_YOUNG';
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
  return snapshots.map((snapshot) => ({
    id: `offer:${snapshot.seller_identifier}:price`,
    description: `${snapshot.seller_name} effective price snapshot for ${product.canonical_name}.`,
    numeric_values: [
      snapshot.market_effective_price,
      snapshot.user_effective_price,
      snapshot.calculated_unit_price,
    ].filter((value): value is number => typeof value === 'number'),
    source_urls: [getSnapshotSourceUrl(snapshot) ?? analysis.source_url],
  }));
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

function getCheapestOfferId(resultJson: Json | null): string | null {
  if (!isJsonObject(resultJson)) {
    return null;
  }
  const lowest = resultJson.lowestEffectivePriceOffer;
  if (!isJsonObject(lowest)) {
    return null;
  }
  return typeof lowest.id === 'string' ? lowest.id : null;
}

function validateJudgment(
  judgment: Record<string, unknown>,
  context: JudgmentInputResponse,
): void {
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
