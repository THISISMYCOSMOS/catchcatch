import { UserCriterion } from './types';

export type RecommendationOfferSnapshot = {
  seller_identifier: string;
  seller_name: string;
  original_list_price: number | null;
  market_effective_price: number | null;
  user_effective_price: number | null;
  quantity: number | null;
  total_amount: number | null;
  unit: string | null;
  calculated_unit_price: number | null;
  offer_snapshot: unknown;
};

export function rankRecommendedOffers(
  offers: readonly RecommendationOfferSnapshot[],
  selectedCriteria: readonly UserCriterion[],
): string[] {
  return [...offers]
    .filter((offer) => {
      const status = snapshotString(offer, 'comparisonStatus');
      // Absolute-price recommendations never admit a unit-normalized
      // alternative. Those belong only to the explicitly labelled unit lane.
      return status === 'DIRECTLY_COMPARABLE' && effectivePrice(offer) !== null;
    })
    .sort((left, right) => {
      for (const criterion of selectedCriteria) {
        const comparison = compareRecommendationCriterion(left, right, criterion);
        if (comparison !== 0) return comparison;
      }
      return compareNullableScore(effectivePrice(left), effectivePrice(right))
        || compareNullableScore(left.calculated_unit_price, right.calculated_unit_price)
        || compareText(left.seller_name, right.seller_name)
        || compareText(left.seller_identifier, right.seller_identifier);
    })
    .slice(0, 3)
    .map((offer) => offer.seller_identifier);
}

function compareRecommendationCriterion(
  left: RecommendationOfferSnapshot,
  right: RecommendationOfferSnapshot,
  criterion: UserCriterion,
): number {
  if (criterion === 'RIGHT_SIZED_PURCHASE') {
    if (
      left.total_amount !== null
      && right.total_amount !== null
      && left.unit !== null
      && left.unit === right.unit
    ) {
      return left.total_amount - right.total_amount;
    }
    if (left.total_amount === null && right.total_amount === null) {
      return compareNullableScore(left.quantity, right.quantity);
    }
    return 0;
  }
  return compareNullableScore(
    recommendationScore(left, criterion),
    recommendationScore(right, criterion),
  );
}

function recommendationScore(
  offer: RecommendationOfferSnapshot,
  criterion: UserCriterion,
): number | null {
  switch (criterion) {
    case 'FINAL_PAYMENT_AMOUNT':
      return effectivePrice(offer);
    case 'UNIT_PRICE':
      return offer.calculated_unit_price;
    case 'RIGHT_SIZED_PURCHASE':
      return null;
    case 'SET_AND_GIFTS':
      return offer.quantity === null ? null : -offer.quantity;
    case 'SIMPLE_DISCOUNT': {
      const price = effectivePrice(offer);
      return offer.original_list_price !== null && offer.original_list_price > 0 && price !== null
        ? -((offer.original_list_price - price) / offer.original_list_price)
        : null;
    }
    case 'FAST_DELIVERY':
      return snapshotNumber(offer, 'deliveryDays');
    case 'REWARDS_AND_MEMBERSHIP':
      if (offer.market_effective_price === null || offer.user_effective_price === null) return null;
      return -(offer.market_effective_price - offer.user_effective_price);
    case 'PURCHASE_TIMING':
      // Price-history timing is product-wide rather than seller-specific.
      return 0;
  }
}

function effectivePrice(offer: RecommendationOfferSnapshot): number | null {
  return offer.user_effective_price ?? offer.market_effective_price;
}

function compareNullableScore(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function snapshotString(offer: RecommendationOfferSnapshot, key: string): string | null {
  const snapshot = asRecord(offer.offer_snapshot);
  const value = snapshot?.[key];
  return typeof value === 'string' ? value : null;
}

function snapshotNumber(offer: RecommendationOfferSnapshot, key: string): number | null {
  const snapshot = asRecord(offer.offer_snapshot);
  const value = snapshot?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
