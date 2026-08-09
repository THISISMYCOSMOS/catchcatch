import {
  AllowedConclusion,
  CapacityUnit,
  ComparisonStatus,
  CriterionStatus,
  DeliverySpeedStatus,
  OfferComparisonResult,
  PriceHistoryPoint,
  ProductComponent,
  SellerOffer,
} from './types';
import {
  calculateCosmeticCapacityTotals,
  calculateDiscountRateFromRecentAverage,
  calculateSavingFromPreviousSale,
  calculateUnitPrice,
} from './calculations';

export type LowestUnitPriceResult = {
  offer: SellerOffer;
  unit: CapacityUnit;
  unitPrice: number;
};

export type AllowedConclusionsInput = {
  offers: readonly SellerOffer[];
  anchorOffer: SellerOffer;
  priceHistory: readonly PriceHistoryPoint[];
  currentMarketEffectivePrice: number | null;
  recentAveragePrice: number | null;
  previousSalePrice: number | null;
  hasSufficientCompositionData: boolean;
  hasSetOrGiftEvidence: boolean;
};

const PRICE_HISTORY_WINDOW_DAYS = 90;
const MIN_PRICE_HISTORY_POINTS = 3;

export function compareOfferToAnchor(
  anchor: SellerOffer,
  offer: SellerOffer,
): OfferComparisonResult {
  if (anchor.productKey !== offer.productKey) {
    return { offerId: offer.id, comparisonStatus: 'NOT_COMPARABLE' };
  }

  const anchorTotals = calculateCosmeticCapacityTotals(anchor.components);
  const offerTotals = calculateCosmeticCapacityTotals(offer.components);
  if (
    anchorTotals.ml === null ||
    anchorTotals.g === null ||
    offerTotals.ml === null ||
    offerTotals.g === null
  ) {
    return { offerId: offer.id, comparisonStatus: 'UNKNOWN' };
  }

  if (anchorTotals.ml === offerTotals.ml && anchorTotals.g === offerTotals.g) {
    return { offerId: offer.id, comparisonStatus: 'DIRECTLY_COMPARABLE' };
  }

  const sharesComparableUnit =
    (anchorTotals.ml > 0 && offerTotals.ml > 0 && anchorTotals.g === 0 && offerTotals.g === 0) ||
    (anchorTotals.g > 0 && offerTotals.g > 0 && anchorTotals.ml === 0 && offerTotals.ml === 0);

  return {
    offerId: offer.id,
    comparisonStatus: sharesComparableUnit ? 'UNIT_COMPARABLE' : 'NOT_COMPARABLE',
  };
}

export function findLowestEffectivePriceOffer(
  offers: readonly SellerOffer[],
  comparisonResults: readonly OfferComparisonResult[],
): SellerOffer | null {
  const comparableOfferIds = idsByStatus(comparisonResults, 'DIRECTLY_COMPARABLE');
  let lowestOffer: SellerOffer | null = null;

  for (const offer of offers) {
    if (!comparableOfferIds.has(offer.id) || !isValidPrice(offer.userEffectivePrice)) {
      continue;
    }
    if (!lowestOffer || offer.userEffectivePrice! < lowestOffer.userEffectivePrice!) {
      lowestOffer = offer;
    }
  }

  return lowestOffer;
}

export function findLowestUnitPriceOffer(
  offers: readonly SellerOffer[],
  comparisonResults: readonly OfferComparisonResult[],
  unit: CapacityUnit,
): LowestUnitPriceResult | null {
  const comparableOfferIds = new Set(
    comparisonResults
      .filter((result) => (
        result.comparisonStatus === 'DIRECTLY_COMPARABLE' ||
        result.comparisonStatus === 'UNIT_COMPARABLE'
      ))
      .map((result) => result.offerId),
  );
  let lowestResult: LowestUnitPriceResult | null = null;

  for (const offer of offers) {
    if (!comparableOfferIds.has(offer.id) || !isValidPrice(offer.userEffectivePrice)) {
      continue;
    }

    const totals = calculateCosmeticCapacityTotals(offer.components);
    const totalCapacity = unit === 'ML' ? totals.ml : totals.g;
    const unitPrice = calculateUnitPrice(offer.userEffectivePrice, totalCapacity);
    if (unitPrice === null) {
      continue;
    }

    if (!lowestResult || unitPrice < lowestResult.unitPrice) {
      lowestResult = { offer, unit, unitPrice };
    }
  }

  return lowestResult;
}

export function assessOfficialSellerStatus(
  offer: Pick<SellerOffer, 'officialSellerStatus'>,
): CriterionStatus {
  if (offer.officialSellerStatus === 'confirmed_official') {
    return 'POSITIVE';
  }
  if (offer.officialSellerStatus === 'confirmed_non_official') {
    return 'NEUTRAL';
  }
  return 'UNKNOWN';
}

export function assessReturnPolicyStatus(
  offer: Pick<SellerOffer, 'returnPolicyStatus'>,
): CriterionStatus {
  return offer.returnPolicyStatus === 'confirmed' ? 'POSITIVE' : 'UNKNOWN';
}

export function getDeliverySpeedStatus(
  offer: Pick<SellerOffer, 'deliveryDays'>,
  offers: readonly Pick<SellerOffer, 'deliveryDays'>[],
): DeliverySpeedStatus {
  if (offer.deliveryDays === null) {
    return 'UNKNOWN';
  }

  const knownDeliveryDays = offers
    .map((candidate) => candidate.deliveryDays)
    .filter((days): days is number => days !== null);
  if (knownDeliveryDays.length === 0) {
    return 'UNKNOWN';
  }

  const fastestDays = Math.min(...knownDeliveryDays);
  if (offer.deliveryDays <= fastestDays + 1) {
    return 'FAST';
  }
  if (offer.deliveryDays <= fastestDays + 2) {
    return 'NORMAL';
  }
  return 'SLOW';
}

export function assessDeliverySpeedStatus(status: DeliverySpeedStatus): CriterionStatus {
  if (status === 'FAST') {
    return 'POSITIVE';
  }
  if (status === 'NORMAL') {
    return 'NEUTRAL';
  }
  if (status === 'SLOW') {
    return 'NEGATIVE';
  }
  return 'UNKNOWN';
}

export function isPriceHistorySufficient(
  points: readonly PriceHistoryPoint[],
  analysisDate: Date,
): boolean {
  const windowStart = new Date(analysisDate);
  windowStart.setDate(windowStart.getDate() - PRICE_HISTORY_WINDOW_DAYS);

  const validObservedDays = new Set<string>();
  for (const point of points) {
    if (!isValidPrice(point.marketEffectivePrice)) {
      continue;
    }
    if (point.observedAt < windowStart || point.observedAt >= analysisDate) {
      continue;
    }
    validObservedDays.add(point.observedAt.toISOString().slice(0, 10));
  }

  return validObservedDays.size >= MIN_PRICE_HISTORY_POINTS;
}

export function calculateAllowedConclusions(
  input: AllowedConclusionsInput,
  analysisDate: Date,
): AllowedConclusion[] {
  const comparisonResults = input.offers.map((offer) => compareOfferToAnchor(input.anchorOffer, offer));
  const lowestOffer = findLowestEffectivePriceOffer(input.offers, comparisonResults);
  const hasComparableOffer = lowestOffer !== null;
  const hasUnitPriceOffer =
    findLowestUnitPriceOffer(input.offers, comparisonResults, 'ML') !== null ||
    findLowestUnitPriceOffer(input.offers, comparisonResults, 'G') !== null;
  const hasSufficientPriceHistory = isPriceHistorySufficient(input.priceHistory, analysisDate);
  const discountRate = calculateDiscountRateFromRecentAverage(
    input.currentMarketEffectivePrice,
    input.recentAveragePrice,
  );
  const previousSaleSaving = calculateSavingFromPreviousSale(
    input.currentMarketEffectivePrice,
    input.previousSalePrice,
  );

  const allowed = new Set<AllowedConclusion>();
  if (
    hasComparableOffer &&
    hasSufficientPriceHistory &&
    discountRate !== null &&
    discountRate >= 10 &&
    previousSaleSaving !== null &&
    previousSaleSaving >= 0
  ) {
    allowed.add('LOW_POINT_BUY');
  }

  if (
    hasComparableOffer &&
    hasSufficientPriceHistory &&
    discountRate !== null &&
    discountRate < 5
  ) {
    allowed.add('NEAR_REGULAR_PRICE');
  }

  if (
    hasComparableOffer ||
    hasUnitPriceOffer ||
    (input.hasSufficientCompositionData && input.hasSetOrGiftEvidence)
  ) {
    allowed.add('REASONABLE_BUY');
  }

  return [...allowed];
}

export function hasSufficientCompositionData(
  components: readonly ProductComponent[],
): boolean {
  return calculateCosmeticCapacityTotals(components).ml !== null &&
    calculateCosmeticCapacityTotals(components).g !== null;
}

function idsByStatus(
  comparisonResults: readonly OfferComparisonResult[],
  status: ComparisonStatus,
): Set<string> {
  return new Set(
    comparisonResults
      .filter((result) => result.comparisonStatus === status)
      .map((result) => result.offerId),
  );
}

function isValidPrice(value: number | null): value is number {
  return value !== null && value >= 0;
}
