import {
  CapacityUnit,
  EligibilityStatus,
  ProductComponent,
  UserCriterion,
  USER_CRITERIA,
} from './types';

const COSMETIC_COMPONENT_TYPES = new Set<ProductComponent['type']>([
  'MAIN',
  'REFILL',
  'MINI',
  'TRAVEL',
  'OTHER_COSMETIC',
]);

export type MarketEffectivePriceInput = {
  listedSalePrice: number | null;
  publicCouponAmount: number | null;
  automaticDiscountAmount: number | null;
  shippingFee: number | null;
};

export type EligibleInstantDiscount = {
  eligibilityStatus: EligibilityStatus;
  amount: number | null;
};

export type UserEffectivePriceInput = {
  marketEffectivePrice: number | null;
  instantDiscounts: readonly EligibleInstantDiscount[];
  rewardPoints?: number | null;
};

export type CosmeticCapacityTotals = {
  ml: number | null;
  g: number | null;
};

export function validateSelectedCriteria(
  criteria: readonly string[],
): UserCriterion[] {
  if (criteria.length !== 3) {
    throw new Error('Exactly three criteria must be selected');
  }

  const allowedCriteria = new Set<string>(USER_CRITERIA);
  const uniqueCriteria = new Set(criteria);
  if (uniqueCriteria.size !== criteria.length) {
    throw new Error('Selected criteria must be distinct');
  }

  const unknownCriterion = criteria.find((criterion) => !allowedCriteria.has(criterion));
  if (unknownCriterion) {
    throw new Error(`Unknown criterion: ${unknownCriterion}`);
  }

  return [...criteria] as UserCriterion[];
}

export function calculateMarketEffectivePrice(
  input: MarketEffectivePriceInput,
): number | null {
  const values = [
    input.listedSalePrice,
    input.publicCouponAmount,
    input.automaticDiscountAmount,
    input.shippingFee,
  ];
  if (values.some((value) => value === null)) {
    return null;
  }

  const price = input.listedSalePrice!
    - input.publicCouponAmount!
    - input.automaticDiscountAmount!
    + input.shippingFee!;
  return assertNonnegativePrice(price);
}

export function calculateUserEffectivePrice(
  input: UserEffectivePriceInput,
): number | null {
  if (input.marketEffectivePrice === null) {
    return null;
  }

  let totalDiscount = 0;
  for (const discount of input.instantDiscounts) {
    if (discount.eligibilityStatus !== 'ELIGIBLE') {
      continue;
    }
    if (discount.amount === null) {
      return null;
    }
    totalDiscount += discount.amount;
  }

  return assertNonnegativePrice(input.marketEffectivePrice - totalDiscount);
}

export function calculateDiscountRateFromRecentAverage(
  currentMarketEffectivePrice: number | null,
  recentAveragePrice: number | null,
): number | null {
  if (
    currentMarketEffectivePrice === null ||
    recentAveragePrice === null ||
    recentAveragePrice === 0
  ) {
    return null;
  }

  return ((recentAveragePrice - currentMarketEffectivePrice) / recentAveragePrice) * 100;
}

export function calculateSavingFromPreviousSale(
  currentMarketEffectivePrice: number | null,
  previousSalePrice: number | null,
): number | null {
  if (currentMarketEffectivePrice === null || previousSalePrice === null) {
    return null;
  }

  return previousSalePrice - currentMarketEffectivePrice;
}

export function calculateCosmeticCapacityTotals(
  components: readonly ProductComponent[],
): CosmeticCapacityTotals {
  const totals = { ML: 0, G: 0 };
  const indeterminateUnits = new Set<CapacityUnit>([]);

  for (const component of components) {
    if (!COSMETIC_COMPONENT_TYPES.has(component.type)) {
      continue;
    }

    if (
      component.capacityValue === null ||
      component.capacityUnit === null ||
      component.quantity === null
    ) {
      if (component.capacityUnit) {
        indeterminateUnits.add(component.capacityUnit);
      } else {
        indeterminateUnits.add('ML');
        indeterminateUnits.add('G');
      }
      continue;
    }

    totals[component.capacityUnit] += component.capacityValue * component.quantity;
  }

  return {
    ml: indeterminateUnits.has('ML') ? null : totals.ML,
    g: indeterminateUnits.has('G') ? null : totals.G,
  };
}

export function calculateUnitPrice(
  userEffectivePrice: number | null,
  totalCapacity: number | null,
): number | null {
  if (
    userEffectivePrice === null ||
    totalCapacity === null ||
    totalCapacity === 0
  ) {
    return null;
  }

  return userEffectivePrice / totalCapacity;
}

function assertNonnegativePrice(price: number): number {
  if (price < 0) {
    throw new Error('Effective price cannot be negative');
  }
  return price;
}
