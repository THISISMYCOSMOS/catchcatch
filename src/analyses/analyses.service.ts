import {
  Inject,
  Injectable,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  calculateDiscountRateFromRecentAverage,
  calculateCosmeticCapacityTotals,
  calculateMarketEffectivePriceBreakdown,
  calculateSavingFromPreviousSale,
  calculateUnitPrice,
  calculateUserEffectivePriceBreakdown,
  EffectivePriceBreakdown,
  EligibleInstantDiscount,
  PriceDiscount,
} from '../domain/calculations';
import {
  calculateAllowedConclusions,
  compareOfferToAnchor,
  findLowestEffectivePriceOffer,
  findLowestUnitPriceOffer,
  isPriceHistorySufficient,
} from '../domain/offer-analysis';
import { PriceHistoryPoint, ProductComponent, SellerOffer } from '../domain/types';
import { Json, Row } from '../database/database.types';
import {
  AnalysisPersistenceRepository,
  AnalysisRepository,
  AnalysisOfferRepository,
  PriceHistoryRepository,
  ProductComponentRepository,
  ProductRepository,
  SellerOfferBenefitRepository,
  SellerOfferComponentRepository,
  SellerOfferRepository,
  UserCardRepository,
  UserMembershipRepository,
  UserPreferenceRepository,
  UserShoppingGradeRepository,
} from '../database/repositories/repository.interfaces';
import {
  ANALYSIS_REPOSITORY,
  ANALYSIS_OFFER_REPOSITORY,
  ANALYSIS_PERSISTENCE_REPOSITORY,
  PRICE_HISTORY_REPOSITORY,
  PRODUCT_COMPONENT_REPOSITORY,
  PRODUCT_REPOSITORY,
  SELLER_OFFER_BENEFIT_REPOSITORY,
  SELLER_OFFER_COMPONENT_REPOSITORY,
  SELLER_OFFER_REPOSITORY,
  USER_CARD_REPOSITORY,
  USER_MEMBERSHIP_REPOSITORY,
  USER_PREFERENCE_REPOSITORY,
  USER_SHOPPING_GRADE_REPOSITORY,
} from '../database/repositories/repository.tokens';

export type CreateAnalysisInput = {
  userId: string;
  sourceUrl: string;
  productId: string;
  idempotencyKey?: string | null;
};

export type AnalysisCalculationResult = {
  lowestEffectivePriceOffer: { id: string; userEffectivePrice: number | null } | null;
  lowestUnitPriceOffer: { id: string; unit: 'ML' | 'G'; unitPrice: number } | null;
  unitPriceComparison: {
    ml: { id: string; unitPrice: number } | null;
    g: { id: string; unitPrice: number } | null;
  };
  priceHistorySufficient: boolean;
  recentAveragePrice: number | null;
  discountRateFromRecentAverage: number | null;
  previousSalePrice: number | null;
  savingFromPreviousSale: number | null;
  savingRateFromPreviousSale: number | null;
  offerCount: number;
};

export type AnalysisResponse = {
  id: string;
  userId: string | null;
  sourceUrl: string;
  productId: string | null;
  status: string;
  verdict: string | null;
  allowedConclusions: string[];
  selectedCriteria: string[];
  warningCodes: string[];
  result: Json | null;
  createdAt: string;
  expiresAt: string;
};

export type RecentAnalysisResponse = AnalysisResponse & {
  product: ProductSummary | null;
  analysisOffers: AnalysisOfferSnapshotResponse[];
};

export type ProductSummary = {
  id: string;
  canonicalName: string;
  brand: string | null;
  productKey: string;
  packageType: string | null;
  imageUrl: string | null;
};

export type PriceHistoryPointResponse = {
  sellerOfferId: string | null;
  sellerName: string | null;
  marketEffectivePrice: number | null;
  observedAt: string;
};

export type ProductPriceHistoryResponse = {
  productId: string;
  points: PriceHistoryPointResponse[];
};

export type AnalysisOfferSnapshotResponse = {
  id: string;
  analysisId: string;
  sellerOfferId: string | null;
  sellerIdentifier: string;
  sellerName: string;
  originalListPrice: number | null;
  salePrice: number | null;
  marketEffectivePrice: number | null;
  userEffectivePrice: number | null;
  shippingFee: number | null;
  publicDiscount: number | null;
  userDiscount: number | null;
  quantity: number | null;
  totalAmount: number | null;
  unit: string | null;
  calculatedUnitPrice: number | null;
  offerSnapshot: Json;
  createdAt: string;
};

type UserBenefitContext = {
  memberships: readonly Row<'user_memberships'>[];
  shoppingGrades: readonly Row<'user_shopping_grades'>[];
  cards: readonly Row<'user_cards'>[];
};

type AppliedUserBenefit = {
  benefitId: string;
  benefitType: Row<'seller_offer_benefits'>['benefit_type'];
  provider: string | null;
  discountAmount: number;
  exclusiveGroup: string | null;
};

type CalculatedOffer = {
  source: Row<'seller_offers'>;
  components: readonly ProductComponent[];
  marketPrice: EffectivePriceBreakdown;
  userPrice: EffectivePriceBreakdown;
  publicDiscount: number | null;
  automaticDiscount: number | null;
  userDiscount: number | null;
  rewardValue: number | null;
  appliedBenefits: AppliedUserBenefit[];
};

@Injectable()
export class AnalysesService {
  constructor(
    @Inject(USER_PREFERENCE_REPOSITORY)
    private readonly preferences: UserPreferenceRepository,
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
    @Inject(PRODUCT_COMPONENT_REPOSITORY)
    private readonly productComponents: ProductComponentRepository,
    @Inject(SELLER_OFFER_REPOSITORY)
    private readonly sellerOffers: SellerOfferRepository,
    @Inject(SELLER_OFFER_BENEFIT_REPOSITORY)
    private readonly sellerOfferBenefits: SellerOfferBenefitRepository,
    @Inject(SELLER_OFFER_COMPONENT_REPOSITORY)
    private readonly sellerOfferComponents: SellerOfferComponentRepository,
    @Inject(PRICE_HISTORY_REPOSITORY)
    private readonly priceHistory: PriceHistoryRepository,
    @Inject(ANALYSIS_REPOSITORY)
    private readonly analyses: AnalysisRepository,
    @Inject(ANALYSIS_PERSISTENCE_REPOSITORY)
    private readonly analysisPersistence: AnalysisPersistenceRepository,
    @Inject(ANALYSIS_OFFER_REPOSITORY)
    private readonly analysisOffers: AnalysisOfferRepository,
    @Inject(USER_MEMBERSHIP_REPOSITORY)
    private readonly memberships: UserMembershipRepository,
    @Inject(USER_SHOPPING_GRADE_REPOSITORY)
    private readonly shoppingGrades: UserShoppingGradeRepository,
    @Inject(USER_CARD_REPOSITORY)
    private readonly cards: UserCardRepository,
  ) {}

  async create(input: CreateAnalysisInput): Promise<AnalysisResponse> {
    const preferences = await this.preferences.findByUserId(input.userId);
    if (!preferences) {
      throw new NotFoundException(`User preferences not found: ${input.userId}`);
    }

    const product = await this.products.findById(input.productId);
    if (!product) {
      throw new NotFoundException(`Product not found: ${input.productId}`);
    }

    let result: Awaited<ReturnType<AnalysesService['calculateResult']>>;
    try {
      result = await this.calculateResult(product, input.userId);
    } catch (error) {
      await this.analysisPersistence.persistAnalysisAtomically({
        userId: input.userId,
        productId: input.productId,
        sourceUrl: input.sourceUrl,
        idempotencyKey: input.idempotencyKey ?? null,
        status: 'FAILED',
        verdict: null,
        allowedConclusions: [],
        selectedCriteria: preferences.selected_criteria,
        warningCodes: ['OTHER'],
        resultJson: null,
        offerSnapshots: [],
        priceHistoryEntries: [],
      });
      throw new InternalServerErrorException('Analysis calculation failed');
    }

    try {
      const completed = await this.analysisPersistence.persistAnalysisAtomically({
        userId: input.userId,
        productId: input.productId,
        sourceUrl: input.sourceUrl,
        idempotencyKey: input.idempotencyKey ?? null,
        status: 'READY_FOR_JUDGMENT',
        verdict: null,
        allowedConclusions: result.allowedConclusions,
        selectedCriteria: preferences.selected_criteria,
        warningCodes: result.warningCodes,
        resultJson: result.resultJson,
        offerSnapshots: result.analysisOfferSnapshots,
        priceHistoryEntries: result.priceHistoryEntries,
      });
      return toAnalysisResponse(completed);
    } catch (error) {
      throw new InternalServerErrorException('Analysis persistence failed');
    }
  }

  async findById(id: string): Promise<AnalysisResponse> {
    const row = await this.analyses.findById(id);
    if (!row) {
      throw new NotFoundException(`Analysis not found: ${id}`);
    }
    return toAnalysisResponse(row);
  }

  async findByIdForUser(id: string, userId: string): Promise<AnalysisResponse> {
    const row = await this.analyses.findById(id);
    if (!row) {
      throw new NotFoundException(`Analysis not found: ${id}`);
    }
    if (row.user_id !== userId) {
      throw new ForbiddenException('Cannot access another user analysis');
    }
    return this.toDetailedAnalysisResponse(row);
  }

  async findRecentByUserId(
    userId: string,
    rawLimit?: string,
  ): Promise<RecentAnalysisResponse[]> {
    const limit = parseRecentLimit(rawLimit);
    const rows = await this.analyses.findRecentByUserId(userId, limit);
    return Promise.all(rows.map((row) => this.toDetailedAnalysisResponse(row)));
  }

  async deleteForUser(id: string, userId: string): Promise<void> {
    const row = await this.analyses.findById(id);
    if (!row) {
      throw new NotFoundException(`Analysis not found: ${id}`);
    }
    if (row.user_id !== userId) {
      throw new ForbiddenException('Cannot delete another user analysis');
    }
    const deleted = await this.analyses.deleteByIdForUser(id, userId);
    if (!deleted) {
      throw new NotFoundException(`Analysis not found: ${id}`);
    }
  }

  async findProductPriceHistory(productId: string): Promise<ProductPriceHistoryResponse> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundException(`Product not found: ${productId}`);
    }
    const [historyRows, offerRows] = await Promise.all([
      this.priceHistory.findByProductId(productId),
      this.sellerOffers.findByProductId(productId),
    ]);
    const sellerNameByOfferId = new Map(offerRows.map((offer) => [offer.id, offer.seller_name]));
    return {
      productId,
      points: historyRows
        .map((row) => ({
          sellerOfferId: row.seller_offer_id,
          sellerName: row.seller_offer_id ? sellerNameByOfferId.get(row.seller_offer_id) ?? null : null,
          marketEffectivePrice: row.market_effective_price,
          observedAt: row.observed_at,
        }))
        .sort((left, right) => (
          left.observedAt.localeCompare(right.observedAt) ||
          (left.sellerName ?? '').localeCompare(right.sellerName ?? '')
        )),
    };
  }

  private async toDetailedAnalysisResponse(
    row: Row<'analyses'>,
  ): Promise<RecentAnalysisResponse> {
    const [product, offerSnapshots] = await Promise.all([
      row.product_id ? this.products.findById(row.product_id) : Promise.resolve(null),
      this.analysisOffers.findByAnalysisId(row.id),
    ]);
    return {
      ...toAnalysisResponse(row),
      product: product ? toProductSummary(product) : null,
      analysisOffers: offerSnapshots.map(toAnalysisOfferSnapshotResponse),
    };
  }

  private async calculateResult(product: Row<'products'>, userId: string): Promise<{
    allowedConclusions: Row<'analyses'>['allowed_conclusions'];
    warningCodes: Row<'analyses'>['warning_codes'];
    resultJson: Json;
    analysisOfferSnapshots: Omit<Row<'analysis_offers'>, 'id' | 'analysis_id' | 'created_at'>[];
    priceHistoryEntries: Omit<Row<'price_history'>, 'id' | 'analysis_id' | 'created_at'>[];
  }> {
    const [componentRows, offerRows, historyRows, membershipRows, shoppingGradeRows, cardRows] = await Promise.all([
      this.productComponents.findByProductId(product.id),
      this.sellerOffers.findByProductId(product.id),
      this.priceHistory.findByProductId(product.id),
      this.memberships.findByUserId(userId),
      this.shoppingGrades.findByUserId(userId),
      this.cards.findByUserId(userId),
    ]);
    const components = componentRows.map(toProductComponent);
    const offerComponents = await this.sellerOfferComponents.findBySellerOfferIds(offerRows.map((offer) => offer.id));
    const componentsByOfferId = groupComponentsByOfferId(offerComponents);
    const benefitRows = await this.sellerOfferBenefits.findBySellerOfferIds(offerRows.map((offer) => offer.id));
    const benefitContext: UserBenefitContext = {
      memberships: membershipRows,
      shoppingGrades: shoppingGradeRows,
      cards: cardRows,
    };
    const calculatedOffers = offerRows.map((offer) => (
      calculateOfferForUser(offer, componentsByOfferId.get(offer.id) ?? [], benefitRows, benefitContext)
    ));
    const domainOffers = calculatedOffers.map((offer) => (
      toDomainOffer(product, offer.source, offer.components, offer.userPrice.price)
    ));
    const anchorOffer = domainOffers[0] ?? toAnchorOffer(product, components);
    const comparisonResults = domainOffers.map((offer) => compareOfferToAnchor(anchorOffer, offer));
    const lowestEffectivePriceOffer = findLowestEffectivePriceOffer(domainOffers, comparisonResults);
    const lowestMlUnitPrice = findLowestUnitPriceOffer(domainOffers, comparisonResults, 'ML');
    const lowestGUnitPrice = findLowestUnitPriceOffer(domainOffers, comparisonResults, 'G');
    const lowestUnitPrice = lowestMlUnitPrice ?? lowestGUnitPrice;
    const priceHistoryPoints = historyRows.map(toPriceHistoryPoint);
    const analysisDate = new Date();
    const priceHistorySufficient = isPriceHistorySufficient(priceHistoryPoints, analysisDate);
    const recentAveragePrice = averageRepresentativePriceBefore(historyRows, analysisDate, 90);
    const previousSalePrice = previousSalePriceBefore(historyRows, analysisDate);
    const currentMarketEffectivePrice = lowestMarketEffectivePrice(calculatedOffers);
    const discountRateFromRecentAverage = calculateDiscountRateFromRecentAverage(
      currentMarketEffectivePrice,
      recentAveragePrice,
    );
    const savingFromPreviousSale = calculateSavingFromPreviousSale(
      currentMarketEffectivePrice,
      previousSalePrice,
    );
    const savingRateFromPreviousSale = calculateDiscountRateFromRecentAverage(
      currentMarketEffectivePrice,
      previousSalePrice,
    );
    const allowedConclusions = calculateAllowedConclusions({
      offers: domainOffers,
      anchorOffer,
      priceHistory: priceHistoryPoints,
      currentMarketEffectivePrice,
      recentAveragePrice,
      previousSalePrice,
      hasSufficientCompositionData: hasSufficientCompositionData(calculatedOffers),
      hasSetOrGiftEvidence: hasSetOrGiftEvidence(components, calculatedOffers),
    }, analysisDate);
    const warningCodes: Row<'analyses'>['warning_codes'] = priceHistorySufficient
      ? []
      : ['PRICE_HISTORY_INSUFFICIENT'];
    const result: AnalysisCalculationResult = {
      lowestEffectivePriceOffer: lowestEffectivePriceOffer
        ? {
            id: lowestEffectivePriceOffer.id,
            userEffectivePrice: lowestEffectivePriceOffer.userEffectivePrice,
          }
        : null,
      lowestUnitPriceOffer: lowestUnitPrice
        ? {
            id: lowestUnitPrice.offer.id,
            unit: lowestUnitPrice.unit,
            unitPrice: lowestUnitPrice.unitPrice,
          }
        : null,
      unitPriceComparison: {
        ml: lowestMlUnitPrice
          ? { id: lowestMlUnitPrice.offer.id, unitPrice: lowestMlUnitPrice.unitPrice }
          : null,
        g: lowestGUnitPrice
          ? { id: lowestGUnitPrice.offer.id, unitPrice: lowestGUnitPrice.unitPrice }
          : null,
      },
      priceHistorySufficient,
      recentAveragePrice,
      discountRateFromRecentAverage,
      previousSalePrice,
      savingFromPreviousSale,
      savingRateFromPreviousSale,
      offerCount: offerRows.length,
    };

    return {
      allowedConclusions,
      warningCodes,
      resultJson: result as unknown as Json,
      analysisOfferSnapshots: calculatedOffers.map((offer) => toAnalysisOfferSnapshot(offer, offer.components)),
      priceHistoryEntries: calculatedOffers.map((offer) => ({
        product_id: product.id,
        seller_offer_id: offer.source.id,
        market_effective_price: offer.marketPrice.price,
        listed_price: offer.source.listed_price,
        listed_sale_price: offer.source.listed_sale_price,
        is_sale_observation: isSaleObservation(offer.source),
        observation_key: priceHistoryObservationKey(
          product.id,
          offer.source.id,
          offer.source.observed_at ?? analysisDate.toISOString(),
          offer.marketPrice.price,
        ),
        observed_at: offer.source.observed_at ?? analysisDate.toISOString(),
      })),
    };
  }
}

function parseRecentLimit(rawLimit?: string): number {
  if (rawLimit === undefined || rawLimit === '') {
    return 1;
  }
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new BadRequestException('limit must be an integer between 1 and 20');
  }
  return limit;
}

function toAnalysisResponse(row: Row<'analyses'>): AnalysisResponse {
  return {
    id: row.id,
    userId: row.user_id,
    sourceUrl: row.source_url,
    productId: row.product_id,
    status: row.status,
    verdict: row.verdict,
    allowedConclusions: row.allowed_conclusions,
    selectedCriteria: row.selected_criteria,
    warningCodes: row.warning_codes,
    result: row.result_json,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function toProductSummary(product: Row<'products'>): ProductSummary {
  return {
    id: product.id,
    canonicalName: product.canonical_name,
    brand: product.brand,
    productKey: product.product_key,
    packageType: product.package_type,
    imageUrl: product.image_url,
  };
}

function toAnalysisOfferSnapshotResponse(
  row: Row<'analysis_offers'>,
): AnalysisOfferSnapshotResponse {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    sellerOfferId: row.seller_offer_id,
    sellerIdentifier: row.seller_identifier,
    sellerName: row.seller_name,
    originalListPrice: row.original_list_price,
    salePrice: row.sale_price,
    marketEffectivePrice: row.market_effective_price,
    userEffectivePrice: row.user_effective_price,
    shippingFee: row.shipping_fee,
    publicDiscount: row.public_discount,
    userDiscount: row.user_discount,
    quantity: row.quantity,
    totalAmount: row.total_amount,
    unit: row.unit,
    calculatedUnitPrice: row.calculated_unit_price,
    offerSnapshot: row.offer_snapshot,
    createdAt: row.created_at,
  };
}

function calculateOfferForUser(
  offer: Row<'seller_offers'>,
  components: readonly ProductComponent[],
  benefitRows: readonly Row<'seller_offer_benefits'>[],
  userBenefits: UserBenefitContext,
): CalculatedOffer {
  const marketPrice = calculateMarketPriceForOffer(offer);
  const offerBenefits = benefitRows.filter((benefit) => benefit.seller_offer_id === offer.id);
  const userDiscounts = offerBenefits.map((benefit) => toEligibleInstantDiscount(benefit, userBenefits));
  const userPrice = calculateUserEffectivePriceBreakdown({
    marketPrice,
    instantDiscounts: userDiscounts,
    rewardPoints: offer.reward_value,
  });
  const appliedBenefits = toAppliedBenefits(offerBenefits, userPrice);

  return {
    source: offer,
    components,
    marketPrice,
    userPrice,
    publicDiscount: sumAppliedDiscounts(marketPrice, (id) => id.startsWith('public-discount:')),
    automaticDiscount: sumAppliedDiscounts(marketPrice, (id) => id.startsWith('automatic-discount:')),
    userDiscount: sumAppliedDiscounts(userPrice, (id) => id.startsWith('seller-offer-benefit:')),
    rewardValue: offer.reward_value,
    appliedBenefits,
  };
}

function calculateMarketPriceForOffer(offer: Row<'seller_offers'>): EffectivePriceBreakdown {
  const listedSalePrice = offer.listed_sale_price ?? offer.listed_price;
  const discounts: PriceDiscount[] = [];
  if (offer.public_discount_amount !== null) {
    discounts.push({
      id: `public-discount:${offer.id}`,
      amount: offer.public_discount_amount,
      applicationStatus: 'APPLICABLE',
      exclusiveGroup: null,
      includedInBasePrice: false,
    });
  }
  if (offer.automatic_discount_amount !== null) {
    discounts.push({
      id: `automatic-discount:${offer.id}`,
      amount: offer.automatic_discount_amount,
      applicationStatus: 'APPLICABLE',
      exclusiveGroup: null,
      includedInBasePrice: false,
    });
  }

  const calculated = calculateMarketEffectivePriceBreakdown({
    listedSalePrice,
    discounts,
    shippingFee: offer.shipping_fee,
  });

  if (calculated.price !== null || offer.market_effective_price === null) {
    return calculated;
  }

  return {
    price: offer.market_effective_price,
    appliedDiscountIds: [],
    appliedDiscounts: [],
    occupiedExclusiveGroups: [],
    unresolvedDiscountIds: [],
  };
}

function toEligibleInstantDiscount(
  benefit: Row<'seller_offer_benefits'>,
  userBenefits: UserBenefitContext,
): EligibleInstantDiscount {
  return {
    id: `seller-offer-benefit:${benefit.id}`,
    amount: benefit.discount_amount,
    applicationStatus: benefit.enabled ? 'APPLICABLE' : 'NOT_APPLICABLE',
    eligibilityStatus: benefit.enabled ? getBenefitEligibilityStatus(benefit, userBenefits) : 'NOT_ELIGIBLE',
    exclusiveGroup: benefit.exclusive_group,
    includedInBasePrice: false,
  };
}

function getBenefitEligibilityStatus(
  benefit: Row<'seller_offer_benefits'>,
  userBenefits: UserBenefitContext,
): EligibleInstantDiscount['eligibilityStatus'] {
  if (benefit.benefit_type === 'MEMBERSHIP') {
    if (!benefit.provider || !benefit.required_membership_type) {
      return 'UNKNOWN';
    }
    return userBenefits.memberships.some((membership) => (
      membership.provider === benefit.provider &&
      membership.membership_type === benefit.required_membership_type &&
      membership.enabled
    )) ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
  }

  if (benefit.benefit_type === 'SHOPPING_GRADE') {
    if (!benefit.provider || !benefit.required_grade) {
      return 'UNKNOWN';
    }
    return userBenefits.shoppingGrades.some((grade) => (
      grade.provider === benefit.provider &&
      grade.grade === benefit.required_grade
    )) ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
  }

  const hasIssuerCondition = benefit.required_card_issuer !== null;
  const hasProductCondition = benefit.required_card_product_code !== null;
  if (!hasIssuerCondition && !hasProductCondition) {
    return 'UNKNOWN';
  }
  return userBenefits.cards.some((card) => (
    (!hasIssuerCondition || card.issuer === benefit.required_card_issuer) &&
    (!hasProductCondition || card.card_product_code === benefit.required_card_product_code)
  )) ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
}

function toAppliedBenefits(
  benefits: readonly Row<'seller_offer_benefits'>[],
  userPrice: EffectivePriceBreakdown,
): AppliedUserBenefit[] {
  const appliedIds = new Set(userPrice.appliedDiscountIds);
  return benefits
    .filter((benefit) => appliedIds.has(`seller-offer-benefit:${benefit.id}`))
    .map((benefit) => ({
      benefitId: benefit.id,
      benefitType: benefit.benefit_type,
      provider: benefit.provider,
      discountAmount: benefit.discount_amount,
      exclusiveGroup: benefit.exclusive_group,
    }));
}

function sumAppliedDiscounts(
  breakdown: EffectivePriceBreakdown,
  shouldInclude: (id: string) => boolean,
): number | null {
  const total = breakdown.appliedDiscounts
    .filter((discount) => shouldInclude(discount.id) && discount.amount !== null)
    .reduce((sum, discount) => sum + discount.amount!, 0);
  return total === 0 ? null : total;
}

function toAnalysisOfferSnapshot(
  calculatedOffer: CalculatedOffer,
  components: readonly ProductComponent[],
): Omit<Row<'analysis_offers'>, 'id' | 'analysis_id' | 'created_at'> {
  const offer = calculatedOffer.source;
  const unitSnapshot = calculatePrimaryUnitSnapshot(calculatedOffer, components);
  const knownQuantity = calculateTotalKnownQuantity(components);
  return {
    seller_offer_id: offer.id,
    seller_identifier: offer.id,
    seller_name: offer.seller_name,
    original_list_price: offer.listed_price,
    sale_price: offer.listed_sale_price,
    market_effective_price: calculatedOffer.marketPrice.price,
    user_effective_price: calculatedOffer.userPrice.price,
    shipping_fee: offer.shipping_fee,
    public_discount: calculatedOffer.publicDiscount,
    user_discount: calculatedOffer.userDiscount,
    quantity: knownQuantity,
    total_amount: unitSnapshot.totalAmount,
    unit: unitSnapshot.unit,
    calculated_unit_price: unitSnapshot.calculatedUnitPrice,
    offer_snapshot: {
      sellerOfferId: offer.id,
      sellerName: offer.seller_name,
      sellerUrl: offer.seller_url,
      originalListPrice: offer.listed_price,
      salePrice: offer.listed_sale_price,
      marketEffectivePrice: calculatedOffer.marketPrice.price,
      userEffectivePrice: calculatedOffer.userPrice.price,
      shippingFee: offer.shipping_fee,
      publicDiscount: calculatedOffer.publicDiscount,
      automaticDiscount: calculatedOffer.automaticDiscount,
      userDiscount: calculatedOffer.userDiscount,
      rewardValue: calculatedOffer.rewardValue,
      appliedBenefits: calculatedOffer.appliedBenefits,
      components: components.map(toSnapshotComponent),
      quantity: knownQuantity,
      totalAmount: unitSnapshot.totalAmount,
      unit: unitSnapshot.unit,
      calculatedUnitPrice: unitSnapshot.calculatedUnitPrice,
      officialSellerStatus: offer.official_seller_status,
      returnPolicyStatus: offer.return_policy_status,
      deliveryDays: offer.delivery_days,
      comparisonStatus: offer.comparison_status,
      observedAt: offer.observed_at,
      sourceUrl: offer.seller_url,
      createdAt: offer.created_at,
      calculatedAt: new Date().toISOString(),
    } as Json,
  };
}

function toSnapshotComponent(component: ProductComponent): Json {
  return {
    type: component.type,
    name: null,
    capacity_value: component.capacityValue,
    capacity_unit: component.capacityUnit,
    quantity: component.quantity,
  };
}

function calculatePrimaryUnitSnapshot(
  calculatedOffer: CalculatedOffer,
  components: readonly ProductComponent[],
): {
  unit: Row<'analysis_offers'>['unit'];
  totalAmount: number | null;
  calculatedUnitPrice: number | null;
} {
  const totals = calculateCosmeticCapacityTotals(components);
  if (totals.ml !== null && totals.ml > 0) {
    return {
      unit: 'ML',
      totalAmount: totals.ml,
      calculatedUnitPrice: calculateUnitPrice(calculatedOffer.userPrice.price, totals.ml),
    };
  }
  if (totals.g !== null && totals.g > 0) {
    return {
      unit: 'G',
      totalAmount: totals.g,
      calculatedUnitPrice: calculateUnitPrice(calculatedOffer.userPrice.price, totals.g),
    };
  }
  return { unit: null, totalAmount: null, calculatedUnitPrice: null };
}

function calculateTotalKnownQuantity(components: readonly ProductComponent[]): number | null {
  let total = 0;
  for (const component of components) {
    if (component.quantity === null) {
      return null;
    }
    total += component.quantity;
  }
  return total;
}

function toDomainOffer(
  product: Row<'products'>,
  offer: Row<'seller_offers'>,
  components: readonly ProductComponent[],
  userEffectivePrice: number | null,
): SellerOffer {
  return {
    id: offer.id,
    productKey: product.product_key,
    userEffectivePrice,
    components,
    officialSellerStatus: offer.official_seller_status ?? 'unconfirmed',
    returnPolicyStatus: offer.return_policy_status ?? 'unconfirmed',
    deliveryDays: offer.delivery_days,
    packageType: product.package_type ?? 'unknown',
  };
}

function toAnchorOffer(
  product: Row<'products'>,
  components: readonly ProductComponent[],
): SellerOffer {
  return {
    id: `anchor:${product.id}`,
    productKey: product.product_key,
    userEffectivePrice: null,
    components,
    officialSellerStatus: 'unconfirmed',
    returnPolicyStatus: 'unconfirmed',
    deliveryDays: null,
    packageType: product.package_type ?? 'unknown',
  };
}

function groupComponentsByOfferId(
  rows: readonly Row<'seller_offer_components'>[],
): Map<string, ProductComponent[]> {
  const grouped = new Map<string, ProductComponent[]>();
  for (const row of rows) {
    const existing = grouped.get(row.seller_offer_id) ?? [];
    existing.push(toProductComponent(row));
    grouped.set(row.seller_offer_id, existing);
  }
  return grouped;
}

function toProductComponent(
  row: Pick<
    Row<'product_components'> | Row<'seller_offer_components'>,
    'component_type' | 'capacity_value' | 'capacity_unit' | 'quantity'
  >,
): ProductComponent {
  return {
    type: row.component_type,
    capacityValue: row.capacity_value,
    capacityUnit: row.capacity_unit,
    quantity: row.quantity,
  };
}

function toPriceHistoryPoint(row: Row<'price_history'>): PriceHistoryPoint {
  return {
    observedAt: new Date(row.observed_at),
    marketEffectivePrice: row.market_effective_price,
  };
}

function hasSufficientCompositionData(offers: readonly CalculatedOffer[]): boolean {
  return offers.some((offer) => (
    offer.components.length > 0 &&
    offer.components.every((component) => (
      component.quantity !== null &&
      (
        component.type === 'NON_COSMETIC_GIFT' ||
        (component.capacityValue !== null && component.capacityUnit !== null)
      )
    ))
  ));
}

function hasSetOrGiftEvidence(
  anchorComponents: readonly ProductComponent[],
  offers: readonly CalculatedOffer[],
): boolean {
  const anchorTotals = calculateCosmeticCapacityTotals(anchorComponents);
  return offers.some((offer) => {
    if (offer.components.some((component) => component.type === 'NON_COSMETIC_GIFT')) {
      return true;
    }
    const offerTotals = calculateCosmeticCapacityTotals(offer.components);
    return (
      anchorTotals.ml !== null &&
      offerTotals.ml !== null &&
      offerTotals.ml > anchorTotals.ml
    ) || (
      anchorTotals.g !== null &&
      offerTotals.g !== null &&
      offerTotals.g > anchorTotals.g
    );
  });
}

function isSaleObservation(offer: Row<'seller_offers'>): boolean {
  return (
    (offer.listed_price !== null && offer.listed_sale_price !== null && offer.listed_sale_price < offer.listed_price) ||
    (offer.public_discount_amount ?? 0) > 0 ||
    (offer.automatic_discount_amount ?? 0) > 0
  );
}

function priceHistoryObservationKey(
  productId: string,
  sellerOfferId: string | null,
  observedAt: string,
  marketEffectivePrice: number | null,
): string {
  return [
    productId,
    sellerOfferId ?? '',
    observedAt,
    marketEffectivePrice ?? '',
  ].join(':');
}

function lowestMarketEffectivePrice(offers: readonly CalculatedOffer[]): number | null {
  const prices = offers
    .map((offer) => offer.marketPrice.price)
    .filter((price): price is number => price !== null);
  if (prices.length === 0) {
    return null;
  }
  return Math.min(...prices);
}

function averageRepresentativePriceBefore(
  rows: readonly Row<'price_history'>[],
  analysisDate: Date,
  recentDays: number,
): number | null {
  const cutoff = new Date(analysisDate);
  cutoff.setDate(cutoff.getDate() - recentDays);
  const lowestPriceByObservedAt = new Map<string, number>();
  for (const row of rows) {
    const observedAt = new Date(row.observed_at);
    if (observedAt >= analysisDate || observedAt < cutoff || row.market_effective_price === null) {
      continue;
    }
    const existing = lowestPriceByObservedAt.get(row.observed_at);
    if (existing === undefined || row.market_effective_price < existing) {
      lowestPriceByObservedAt.set(row.observed_at, row.market_effective_price);
    }
  }
  const prices = [...lowestPriceByObservedAt.values()];
  if (prices.length === 0) {
    return null;
  }
  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}

function previousSalePriceBefore(
  rows: readonly Row<'price_history'>[],
  analysisDate: Date,
): number | null {
  const previousRows = rows
    .filter((row) => new Date(row.observed_at) < analysisDate)
    .filter((row) => row.is_sale_observation)
    .filter((row) => row.market_effective_price !== null)
    .sort((left, right) => right.observed_at.localeCompare(left.observed_at));
  return previousRows[0]?.market_effective_price ?? null;
}
