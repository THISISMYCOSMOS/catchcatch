import {
  calculateCosmeticCapacityTotals,
  calculateDiscountRateFromRecentAverage,
  calculateMarketEffectivePrice,
  calculateMarketEffectivePriceBreakdown,
  calculateSavingFromPreviousSale,
  calculateUnitPrice,
  calculateUserEffectivePrice,
  calculateUserEffectivePriceBreakdown,
  EffectivePriceBreakdown,
  PriceDiscount,
  validateSelectedCriteria,
} from './calculations';
import { ProductComponent } from './types';

describe('domain calculations', () => {
  describe('validateSelectedCriteria', () => {
    it('accepts exactly three distinct known criteria', () => {
      expect(validateSelectedCriteria([
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ])).toEqual([
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ]);
    });

    it('rejects two selected criteria', () => {
      expect(() => validateSelectedCriteria([
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
      ])).toThrow('Exactly three criteria');
    });

    it('rejects four selected criteria', () => {
      expect(() => validateSelectedCriteria([
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
        'SET_AND_GIFTS',
      ])).toThrow('Exactly three criteria');
    });

    it('rejects duplicate criteria', () => {
      expect(() => validateSelectedCriteria([
        'FINAL_PAYMENT_AMOUNT',
        'FINAL_PAYMENT_AMOUNT',
        'UNIT_PRICE',
      ])).toThrow('distinct');
    });

    it('rejects unknown criteria', () => {
      expect(() => validateSelectedCriteria([
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNKNOWN_CRITERION',
      ])).toThrow('Unknown criterion');
    });
  });

  describe('calculateMarketEffectivePrice', () => {
    it('calculates without double-counting discounts', () => {
      expect(calculateMarketEffectivePrice({
        listedSalePrice: 20000,
        discounts: [
          discount('public-coupon', 2000),
          discount('automatic-discount', 1000),
        ],
        shippingFee: 3000,
      })).toBe(20000);
    });

    it('does not estimate null values as zero', () => {
      expect(calculateMarketEffectivePrice({
        listedSalePrice: 20000,
        discounts: [
          discount('public-coupon', null),
          discount('automatic-discount', 1000),
        ],
        shippingFee: 3000,
      })).toBeNull();
    });

    it('rejects a negative market effective price', () => {
      expect(() => calculateMarketEffectivePrice({
        listedSalePrice: 1000,
        discounts: [
          discount('public-coupon', 900),
          discount('automatic-discount', 200),
        ],
        shippingFee: 0,
      })).toThrow('negative');
    });

    it('applies only the largest discount in an exclusive group', () => {
      const result = calculateMarketEffectivePriceBreakdown({
        listedSalePrice: 20000,
        discounts: [
          discount('public-coupon', 2000, { exclusiveGroup: 'promotion' }),
          discount('automatic-discount', 3000, {
            exclusiveGroup: 'promotion',
          }),
        ],
        shippingFee: 0,
      });

      expect(result).toEqual({
        price: 17000,
        appliedDiscountIds: ['automatic-discount'],
        appliedDiscounts: [
          {
            id: 'automatic-discount',
            amount: 3000,
            exclusiveGroup: 'promotion',
          },
        ],
        occupiedExclusiveGroups: ['promotion'],
        unresolvedDiscountIds: [],
      });
    });

    it('does not subtract a discount already included in the listed price', () => {
      const result = calculateMarketEffectivePriceBreakdown({
        listedSalePrice: 17000,
        discounts: [
          discount('automatic-discount', 3000, {
            exclusiveGroup: 'promotion',
            includedInBasePrice: true,
          }),
          discount('public-coupon', 2000, { exclusiveGroup: 'promotion' }),
        ],
        shippingFee: 0,
      });

      expect(result).toEqual({
        price: 17000,
        appliedDiscountIds: ['automatic-discount'],
        appliedDiscounts: [
          {
            id: 'automatic-discount',
            amount: 3000,
            exclusiveGroup: 'promotion',
          },
        ],
        occupiedExclusiveGroups: ['promotion'],
        unresolvedDiscountIds: [],
      });
    });

    it('replaces a listed-price discount with a larger compatible alternative', () => {
      const result = calculateMarketEffectivePriceBreakdown({
        listedSalePrice: 17000,
        discounts: [
          discount('automatic-discount', 3000, {
            exclusiveGroup: 'promotion',
            includedInBasePrice: true,
          }),
          discount('public-coupon', 5000, { exclusiveGroup: 'promotion' }),
        ],
        shippingFee: 0,
      });

      expect(result.price).toBe(15000);
      expect(result.appliedDiscountIds).toEqual(['public-coupon']);
    });

    it('still applies a separate stackable coupon to a listed-price discount', () => {
      const result = calculateMarketEffectivePriceBreakdown({
        listedSalePrice: 17000,
        discounts: [
          discount('listed-price-discount', 3000, {
            includedInBasePrice: true,
          }),
          discount('stackable-coupon', 2000),
        ],
        shippingFee: 0,
      });

      expect(result).toEqual({
        price: 15000,
        appliedDiscountIds: [
          'listed-price-discount',
          'stackable-coupon',
        ],
        appliedDiscounts: [
          {
            id: 'listed-price-discount',
            amount: 3000,
            exclusiveGroup: null,
          },
          {
            id: 'stackable-coupon',
            amount: 2000,
            exclusiveGroup: null,
          },
        ],
        occupiedExclusiveGroups: [],
        unresolvedDiscountIds: [],
      });
    });

    it('does not subtract a confirmed non-applicable discount', () => {
      expect(calculateMarketEffectivePrice({
        listedSalePrice: 20000,
        discounts: [
          discount('sale-item-excluded-coupon', 3000, {
            applicationStatus: 'NOT_APPLICABLE',
          }),
        ],
        shippingFee: 0,
      })).toBe(20000);
    });

    it('does not subtract a discount whose applicability is unknown', () => {
      const result = calculateMarketEffectivePriceBreakdown({
        listedSalePrice: 20000,
        discounts: [
          discount('condition-unconfirmed-coupon', 5000, {
            applicationStatus: 'UNKNOWN',
          }),
        ],
        shippingFee: 0,
      });

      expect(result).toEqual({
        price: 20000,
        appliedDiscountIds: [],
        appliedDiscounts: [],
        occupiedExclusiveGroups: [],
        unresolvedDiscountIds: ['condition-unconfirmed-coupon'],
      });
    });

    it('rejects duplicate discount IDs', () => {
      expect(() => calculateMarketEffectivePrice({
        listedSalePrice: 20000,
        discounts: [
          discount('same-promotion', 2000),
          discount('same-promotion', 2000),
        ],
        shippingFee: 0,
      })).toThrow('Duplicate discount ID');
    });
  });

  describe('calculateUserEffectivePrice', () => {
    it('subtracts only ELIGIBLE instant discounts', () => {
      expect(calculateUserEffectivePrice({
        marketPrice: effectivePrice(20000),
        instantDiscounts: [
          eligibleDiscount('membership', 2000, 'ELIGIBLE'),
          eligibleDiscount('unavailable-card', 5000, 'NOT_ELIGIBLE'),
          eligibleDiscount('unconfirmed-benefit', 3000, 'UNKNOWN'),
        ],
      })).toBe(18000);
    });

    it('does not subtract UNKNOWN benefits', () => {
      expect(calculateUserEffectivePrice({
        marketPrice: effectivePrice(20000),
        instantDiscounts: [
          eligibleDiscount('unconfirmed-benefit', 5000, 'UNKNOWN'),
        ],
      })).toBe(20000);
    });

    it('does not subtract reward points', () => {
      expect(calculateUserEffectivePrice({
        marketPrice: effectivePrice(20000),
        instantDiscounts: [],
        rewardPoints: 10000,
      })).toBe(20000);
    });

    it('rejects a negative user effective price', () => {
      expect(() => calculateUserEffectivePrice({
        marketPrice: effectivePrice(1000),
        instantDiscounts: [
          eligibleDiscount('oversized-discount', 1001, 'ELIGIBLE'),
        ],
      })).toThrow('negative');
    });

    it('applies only the largest eligible discount in an exclusive group', () => {
      const result = calculateUserEffectivePriceBreakdown({
        marketPrice: effectivePrice(20000),
        instantDiscounts: [
          eligibleDiscount('membership', 2000, 'ELIGIBLE', {
            exclusiveGroup: 'payment-benefit',
          }),
          eligibleDiscount('card', 3000, 'ELIGIBLE', {
            exclusiveGroup: 'payment-benefit',
          }),
        ],
      });

      expect(result).toEqual({
        price: 17000,
        appliedDiscountIds: ['card'],
        appliedDiscounts: [
          {
            id: 'card',
            amount: 3000,
            exclusiveGroup: 'payment-benefit',
          },
        ],
        occupiedExclusiveGroups: ['payment-benefit'],
        unresolvedDiscountIds: [],
      });
    });

    it('still combines eligible discounts from different groups', () => {
      expect(calculateUserEffectivePrice({
        marketPrice: effectivePrice(20000),
        instantDiscounts: [
          eligibleDiscount('membership', 2000, 'ELIGIBLE', {
            exclusiveGroup: 'membership',
          }),
          eligibleDiscount('shipping', 3000, 'ELIGIBLE', {
            exclusiveGroup: 'shipping',
          }),
        ],
      })).toBe(15000);
    });

    it('does not reuse an exclusive group already applied to the market price', () => {
      const marketPrice = calculateMarketEffectivePriceBreakdown({
        listedSalePrice: 17000,
        discounts: [
          discount('automatic-discount', 3000, {
            exclusiveGroup: 'promotion',
            includedInBasePrice: true,
          }),
        ],
        shippingFee: 0,
      });
      const result = calculateUserEffectivePriceBreakdown({
        marketPrice,
        instantDiscounts: [
          eligibleDiscount('card', 3000, 'ELIGIBLE', {
            exclusiveGroup: 'promotion',
          }),
        ],
      });

      expect(result).toEqual({
        price: 17000,
        appliedDiscountIds: ['automatic-discount'],
        appliedDiscounts: [
          {
            id: 'automatic-discount',
            amount: 3000,
            exclusiveGroup: 'promotion',
          },
        ],
        occupiedExclusiveGroups: ['promotion'],
        unresolvedDiscountIds: [],
      });
    });

    it('replaces a market discount with a larger user discount in the same group', () => {
      const marketPrice = calculateMarketEffectivePriceBreakdown({
        listedSalePrice: 20000,
        discounts: [
          discount('public-coupon', 2000, {
            exclusiveGroup: 'promotion',
          }),
        ],
        shippingFee: 0,
      });
      const result = calculateUserEffectivePriceBreakdown({
        marketPrice,
        instantDiscounts: [
          eligibleDiscount('card', 3000, 'ELIGIBLE', {
            exclusiveGroup: 'promotion',
          }),
        ],
      });

      expect(result.price).toBe(17000);
      expect(result.appliedDiscountIds).toEqual(['card']);
    });

    it('reports but does not subtract an unconfirmed eligible discount', () => {
      const result = calculateUserEffectivePriceBreakdown({
        marketPrice: effectivePrice(20000),
        instantDiscounts: [
          eligibleDiscount('conditional-card', 3000, 'ELIGIBLE', {
            applicationStatus: 'UNKNOWN',
          }),
        ],
      });

      expect(result).toEqual({
        price: 20000,
        appliedDiscountIds: [],
        appliedDiscounts: [],
        occupiedExclusiveGroups: [],
        unresolvedDiscountIds: ['conditional-card'],
      });
    });

    it('rejects a discount already used in the market price', () => {
      const marketPrice = calculateMarketEffectivePriceBreakdown({
        listedSalePrice: 20000,
        discounts: [discount('shared-coupon', 2000)],
        shippingFee: 0,
      });

      expect(() => calculateUserEffectivePrice({
        marketPrice,
        instantDiscounts: [
          eligibleDiscount('shared-coupon', 2000, 'ELIGIBLE'),
        ],
      })).toThrow('Duplicate discount ID');
    });

    it('preserves the full applied-discount trace across both price stages', () => {
      const marketPrice = calculateMarketEffectivePriceBreakdown({
        listedSalePrice: 20000,
        discounts: [discount('public-coupon', 2000)],
        shippingFee: 3000,
      });
      const result = calculateUserEffectivePriceBreakdown({
        marketPrice,
        instantDiscounts: [
          eligibleDiscount('membership', 1000, 'ELIGIBLE'),
        ],
      });

      expect(result).toEqual({
        price: 20000,
        appliedDiscountIds: ['public-coupon', 'membership'],
        appliedDiscounts: [
          {
            id: 'public-coupon',
            amount: 2000,
            exclusiveGroup: null,
          },
          {
            id: 'membership',
            amount: 1000,
            exclusiveGroup: null,
          },
        ],
        occupiedExclusiveGroups: [],
        unresolvedDiscountIds: [],
      });
    });
  });

  describe('price history calculations', () => {
    it('calculates discount rate from recent average', () => {
      expect(calculateDiscountRateFromRecentAverage(15000, 20000)).toBe(25);
    });

    it('keeps a negative rate when the current price is more expensive', () => {
      expect(calculateDiscountRateFromRecentAverage(21000, 20000)).toBe(-5);
    });

    it('returns null when recentAveragePrice is null or zero', () => {
      expect(calculateDiscountRateFromRecentAverage(15000, null)).toBeNull();
      expect(calculateDiscountRateFromRecentAverage(15000, 0)).toBeNull();
    });

    it('calculates saving from previous sale', () => {
      expect(calculateSavingFromPreviousSale(15000, 17000)).toBe(2000);
    });

    it('keeps a negative saving when the current price is more expensive', () => {
      expect(calculateSavingFromPreviousSale(18000, 17000)).toBe(-1000);
    });

    it('returns null when previousSalePrice is null', () => {
      expect(calculateSavingFromPreviousSale(15000, null)).toBeNull();
    });
  });

  describe('capacity and unit price calculations', () => {
    it('keeps ml and g totals separate', () => {
      const totals = calculateCosmeticCapacityTotals([
        component('MAIN', 50, 'ML', 2),
        component('REFILL', 20, 'G', 3),
      ]);

      expect(totals).toEqual({ ml: 100, g: 60 });
    });

    it('excludes non-cosmetic gifts and UNKNOWN components', () => {
      const totals = calculateCosmeticCapacityTotals([
        component('MAIN', 50, 'ML', 1),
        component('NON_COSMETIC_GIFT', 100, 'ML', 1),
        component('UNKNOWN', 30, 'ML', 1),
      ]);

      expect(totals).toEqual({ ml: 50, g: 0 });
    });

    it('returns null for the affected unit and excludes other-cosmetic gifts', () => {
      const totals = calculateCosmeticCapacityTotals([
        component('MAIN', 50, 'ML', 1),
        component('REFILL', null, 'ML', 1),
        component('OTHER_COSMETIC', 20, 'G', 1),
      ]);

      expect(totals).toEqual({ ml: null, g: 0 });
      expect(calculateUnitPrice(10000, totals.ml)).toBeNull();
      expect(calculateUnitPrice(10000, totals.g)).toBeNull();
    });

    it('returns null for unit price when quantity is unclear', () => {
      const totals = calculateCosmeticCapacityTotals([
        component('MAIN', 50, 'ML', null),
      ]);

      expect(totals.ml).toBeNull();
      expect(calculateUnitPrice(10000, totals.ml)).toBeNull();
    });
  });
});

function component(
  type: ProductComponent['type'],
  capacityValue: number | null,
  capacityUnit: ProductComponent['capacityUnit'],
  quantity: number | null,
): ProductComponent {
  return { type, capacityValue, capacityUnit, quantity };
}

function discount(
  id: string,
  amount: number | null,
  overrides: Partial<PriceDiscount> = {},
): PriceDiscount {
  return {
    id,
    amount,
    applicationStatus: 'APPLICABLE',
    exclusiveGroup: null,
    includedInBasePrice: false,
    ...overrides,
  };
}

function eligibleDiscount(
  id: string,
  amount: number | null,
  eligibilityStatus: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN',
  overrides: Partial<PriceDiscount> = {},
) {
  return {
    ...discount(id, amount, overrides),
    eligibilityStatus,
  };
}

function effectivePrice(
  price: number | null,
  overrides: Partial<EffectivePriceBreakdown> = {},
): EffectivePriceBreakdown {
  return {
    price,
    appliedDiscountIds: [],
    appliedDiscounts: [],
    occupiedExclusiveGroups: [],
    unresolvedDiscountIds: [],
    ...overrides,
  };
}
