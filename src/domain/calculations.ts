import {
  CapacityUnit,
  EligibilityStatus,
  ProductComponent,
  UserCriterion,
  USER_CRITERIA,
} from './types';

export type MarketEffectivePriceInput = {
  listedSalePrice: number | null;
  discounts: readonly PriceDiscount[];
  shippingFee: number | null;
};

export type DiscountApplicationStatus =
  | 'APPLICABLE'
  | 'NOT_APPLICABLE'
  | 'UNKNOWN';

export type PriceDiscount = {
  id: string;
  amount: number | null;
  applicationStatus: DiscountApplicationStatus;
  exclusiveGroup: string | null;
  includedInBasePrice: boolean;
};

export type EligibleInstantDiscount = PriceDiscount & {
  eligibilityStatus: EligibilityStatus;
};

export type UserEffectivePriceInput = {
  marketPrice: EffectivePriceBreakdown;
  instantDiscounts: readonly EligibleInstantDiscount[];
  rewardPoints?: number | null;
};

export type AppliedDiscount = {
  id: string;
  amount: number | null;
  exclusiveGroup: string | null;
};

export type EffectivePriceBreakdown = {
  price: number | null;
  appliedDiscountIds: string[];
  appliedDiscounts: AppliedDiscount[];
  occupiedExclusiveGroups: string[];
  unresolvedDiscountIds: string[];
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
  return calculateMarketEffectivePriceBreakdown(input).price;
}

export function calculateMarketEffectivePriceBreakdown(
  input: MarketEffectivePriceInput,
): EffectivePriceBreakdown {
  const replaceableIncludedDiscounts = input.discounts.filter(
    (discount) => (
      discount.includedInBasePrice
      && discount.amount !== null
    ),
  );
  const replaceableIncludedDiscountIds = new Set(
    replaceableIncludedDiscounts.map((discount) => discount.id),
  );
  const discountCandidates = input.discounts.map((discount) => (
    replaceableIncludedDiscountIds.has(discount.id)
      ? {
        ...discount,
        applicationStatus: 'APPLICABLE' as const,
        includedInBasePrice: false,
      }
      : discount
  ));
  const discountResolution = resolveDiscounts(
    discountCandidates,
    () => 'ELIGIBLE',
  );
  const restoredIncludedDiscountAmount = replaceableIncludedDiscounts.reduce(
    (total, discount) => total + discount.amount!,
    0,
  );

  return calculateEffectivePriceBreakdown(
    input.listedSalePrice === null
      ? null
      : input.listedSalePrice + restoredIncludedDiscountAmount,
    input.shippingFee,
    discountResolution,
  );
}

export function calculateUserEffectivePrice(
  input: UserEffectivePriceInput,
): number | null {
  return calculateUserEffectivePriceBreakdown(input).price;
}

export function calculateUserEffectivePriceBreakdown(
  input: UserEffectivePriceInput,
): EffectivePriceBreakdown {
  const replaceableMarketDiscounts = input.marketPrice.appliedDiscounts.filter(
    (discount) => (
      discount.exclusiveGroup !== null
      && discount.amount !== null
    ),
  );
  const replaceableMarketDiscountIds = new Set(
    replaceableMarketDiscounts.map((discount) => discount.id),
  );
  const replaceableExclusiveGroups = new Set(
    replaceableMarketDiscounts.map((discount) => discount.exclusiveGroup!),
  );
  const fixedMarketDiscounts = input.marketPrice.appliedDiscounts.filter(
    (discount) => !replaceableMarketDiscountIds.has(discount.id),
  );
  const discountCandidates: EligibleInstantDiscount[] = [
    ...replaceableMarketDiscounts.map((discount) => ({
      ...discount,
      amount: discount.amount!,
      applicationStatus: 'APPLICABLE' as const,
      includedInBasePrice: false,
      eligibilityStatus: 'ELIGIBLE' as const,
    })),
    ...input.instantDiscounts,
  ];

  const discountResolution = resolveDiscounts(
    discountCandidates,
    (discount) => discount.eligibilityStatus,
    input.marketPrice.occupiedExclusiveGroups.filter(
      (group) => !replaceableExclusiveGroups.has(group),
    ),
    [
      ...fixedMarketDiscounts.map((discount) => discount.id),
      ...input.marketPrice.unresolvedDiscountIds,
    ],
  );

  const restoredMarketDiscountAmount = replaceableMarketDiscounts.reduce(
    (total, discount) => total + discount.amount!,
    0,
  );
  const userPrice = calculateEffectivePriceBreakdown(
    input.marketPrice.price === null
      ? null
      : input.marketPrice.price + restoredMarketDiscountAmount,
    0,
    discountResolution,
  );
  const appliedDiscounts = [
    ...fixedMarketDiscounts,
    ...userPrice.appliedDiscounts,
  ];

  return {
    ...userPrice,
    appliedDiscountIds: appliedDiscounts.map((discount) => discount.id),
    appliedDiscounts,
    unresolvedDiscountIds: [
      ...input.marketPrice.unresolvedDiscountIds,
      ...userPrice.unresolvedDiscountIds,
    ],
  };
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
    // Legacy rows lack all new dimensions and are intentionally unknown. Do
    // not infer PAID or SAME_PRODUCT from component_type during the rollout.
    if (
      component.physicalType !== 'COSMETIC' ||
      component.commercialInclusion !== 'PAID' ||
      component.productIdentity !== 'SAME_PRODUCT' ||
      component.verificationStatus !== 'VERIFIED'
    ) {
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

/**
 * A separately labelled denominator for verified same-product bonuses. It is
 * never a substitute for the base PAID-only denominator above.
 */
export function calculateBonusIncludedCosmeticCapacityTotals(
  components: readonly ProductComponent[],
): CosmeticCapacityTotals {
  return calculateCapacityTotalsForInclusions(components, new Set(['PAID', 'BONUS']));
}

function calculateCapacityTotalsForInclusions(
  components: readonly ProductComponent[],
  inclusions: ReadonlySet<ProductComponent['commercialInclusion']>,
): CosmeticCapacityTotals {
  const totals = { ML: 0, G: 0 };
  const indeterminateUnits = new Set<CapacityUnit>();
  for (const component of components) {
    if (
      component.physicalType !== 'COSMETIC' ||
      component.productIdentity !== 'SAME_PRODUCT' ||
      component.verificationStatus !== 'VERIFIED' ||
      !component.commercialInclusion ||
      !inclusions.has(component.commercialInclusion)
    ) continue;
    if (component.capacityValue === null || component.capacityUnit === null || component.quantity === null) {
      if (component.capacityUnit) indeterminateUnits.add(component.capacityUnit);
      else { indeterminateUnits.add('ML'); indeterminateUnits.add('G'); }
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

type DiscountResolution = {
  totalDiscount: number | null;
  appliedDiscountIds: string[];
  appliedDiscounts: AppliedDiscount[];
  occupiedExclusiveGroups: string[];
  unresolvedDiscountIds: string[];
};

function resolveDiscounts<T extends PriceDiscount>(
  discounts: readonly T[],
  getEligibilityStatus: (discount: T) => EligibilityStatus,
  initiallyOccupiedExclusiveGroups: readonly string[] = [],
  previouslySeenDiscountIds: readonly string[] = [],
): DiscountResolution {
  assertUniqueDiscountIds(discounts, previouslySeenDiscountIds);

  const occupiedExclusiveGroups = new Set(initiallyOccupiedExclusiveGroups);
  const includedDiscounts: AppliedDiscount[] = [];
  const unresolvedDiscountIds: string[] = [];

  for (const discount of discounts) {
    if (!discount.includedInBasePrice) {
      continue;
    }

    includedDiscounts.push(toAppliedDiscount(discount));
    if (discount.exclusiveGroup === null) {
      continue;
    }
    if (occupiedExclusiveGroups.has(discount.exclusiveGroup)) {
      throw new Error(
        `Multiple included discounts occupy exclusive group: ${discount.exclusiveGroup}`,
      );
    }
    occupiedExclusiveGroups.add(discount.exclusiveGroup);
  }

  const ungroupedDiscounts: T[] = [];
  const groupedDiscounts = new Map<string, T[]>();
  const unresolvedAmountGroups = new Set<string>();
  let hasUnresolvedUngroupedAmount = false;

  for (const discount of discounts) {
    if (discount.includedInBasePrice) {
      continue;
    }
    if (
      discount.exclusiveGroup !== null
      && occupiedExclusiveGroups.has(discount.exclusiveGroup)
    ) {
      continue;
    }

    const eligibilityStatus = getEligibilityStatus(discount);
    if (eligibilityStatus === 'UNKNOWN') {
      unresolvedDiscountIds.push(discount.id);
      continue;
    }
    if (eligibilityStatus !== 'ELIGIBLE') {
      continue;
    }
    if (discount.applicationStatus === 'UNKNOWN') {
      unresolvedDiscountIds.push(discount.id);
      continue;
    }
    if (discount.applicationStatus !== 'APPLICABLE') {
      continue;
    }

    if (discount.amount === null) {
      unresolvedDiscountIds.push(discount.id);
      if (discount.exclusiveGroup === null) {
        hasUnresolvedUngroupedAmount = true;
      } else {
        unresolvedAmountGroups.add(discount.exclusiveGroup);
      }
      continue;
    }

    assertNonnegativeDiscount(discount);
    if (discount.exclusiveGroup === null) {
      ungroupedDiscounts.push(discount);
      continue;
    }

    const group = groupedDiscounts.get(discount.exclusiveGroup) ?? [];
    group.push(discount);
    groupedDiscounts.set(discount.exclusiveGroup, group);
  }

  const selectedDiscountIds = new Set(
    ungroupedDiscounts.map((discount) => discount.id),
  );

  for (const [exclusiveGroup, group] of groupedDiscounts) {
    if (unresolvedAmountGroups.has(exclusiveGroup)) {
      continue;
    }

    const selectedDiscount = group.reduce((best, candidate) => (
      candidate.amount! > best.amount! ? candidate : best
    ));
    selectedDiscountIds.add(selectedDiscount.id);
    occupiedExclusiveGroups.add(exclusiveGroup);
  }

  let totalDiscount = 0;
  const newlyAppliedDiscounts: AppliedDiscount[] = [];
  for (const discount of discounts) {
    if (!selectedDiscountIds.has(discount.id)) {
      continue;
    }
    totalDiscount += discount.amount!;
    newlyAppliedDiscounts.push(toAppliedDiscount(discount));
  }

  const appliedDiscounts = [
    ...includedDiscounts,
    ...newlyAppliedDiscounts,
  ];
  if (hasUnresolvedUngroupedAmount || unresolvedAmountGroups.size > 0) {
    return {
      totalDiscount: null,
      appliedDiscountIds: appliedDiscounts.map((discount) => discount.id),
      appliedDiscounts,
      occupiedExclusiveGroups: [...occupiedExclusiveGroups],
      unresolvedDiscountIds,
    };
  }

  return {
    totalDiscount,
    appliedDiscountIds: appliedDiscounts.map((discount) => discount.id),
    appliedDiscounts,
    occupiedExclusiveGroups: [...occupiedExclusiveGroups],
    unresolvedDiscountIds,
  };
}

function calculateEffectivePriceBreakdown(
  basePrice: number | null,
  shippingFee: number | null,
  discountResolution: DiscountResolution,
): EffectivePriceBreakdown {
  const {
    totalDiscount,
    appliedDiscountIds,
    appliedDiscounts,
    occupiedExclusiveGroups,
    unresolvedDiscountIds,
  } = discountResolution;

  if (
    basePrice === null
    || shippingFee === null
    || totalDiscount === null
  ) {
    return {
      price: null,
      appliedDiscountIds,
      appliedDiscounts,
      occupiedExclusiveGroups,
      unresolvedDiscountIds,
    };
  }

  return {
    price: assertNonnegativePrice(basePrice + shippingFee - totalDiscount),
    appliedDiscountIds,
    appliedDiscounts,
    occupiedExclusiveGroups,
    unresolvedDiscountIds,
  };
}

function assertUniqueDiscountIds(
  discounts: readonly PriceDiscount[],
  previouslySeenDiscountIds: readonly string[] = [],
): void {
  const ids = new Set<string>();
  for (const id of previouslySeenDiscountIds) {
    if (ids.has(id)) {
      throw new Error(`Duplicate discount ID: ${id}`);
    }
    ids.add(id);
  }
  for (const discount of discounts) {
    if (ids.has(discount.id)) {
      throw new Error(`Duplicate discount ID: ${discount.id}`);
    }
    ids.add(discount.id);
  }
}

function assertNonnegativeDiscount(discount: PriceDiscount): void {
  if (discount.amount! < 0) {
    throw new Error(`Discount amount cannot be negative: ${discount.id}`);
  }
}

function toAppliedDiscount(discount: PriceDiscount): AppliedDiscount {
  return {
    id: discount.id,
    amount: discount.amount,
    exclusiveGroup: discount.exclusiveGroup,
  };
}
