import {
  calculateCosmeticCapacityTotals,
  calculateDiscountRateFromRecentAverage,
  calculateMarketEffectivePrice,
  calculateSavingFromPreviousSale,
  calculateUnitPrice,
  calculateUserEffectivePrice,
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
        publicCouponAmount: 2000,
        automaticDiscountAmount: 1000,
        shippingFee: 3000,
      })).toBe(20000);
    });

    it('does not estimate null values as zero', () => {
      expect(calculateMarketEffectivePrice({
        listedSalePrice: 20000,
        publicCouponAmount: null,
        automaticDiscountAmount: 1000,
        shippingFee: 3000,
      })).toBeNull();
    });

    it('rejects a negative market effective price', () => {
      expect(() => calculateMarketEffectivePrice({
        listedSalePrice: 1000,
        publicCouponAmount: 900,
        automaticDiscountAmount: 200,
        shippingFee: 0,
      })).toThrow('negative');
    });
  });

  describe('calculateUserEffectivePrice', () => {
    it('subtracts only ELIGIBLE instant discounts', () => {
      expect(calculateUserEffectivePrice({
        marketEffectivePrice: 20000,
        instantDiscounts: [
          { eligibilityStatus: 'ELIGIBLE', amount: 2000 },
          { eligibilityStatus: 'NOT_ELIGIBLE', amount: 5000 },
          { eligibilityStatus: 'UNKNOWN', amount: 3000 },
        ],
      })).toBe(18000);
    });

    it('does not subtract UNKNOWN benefits', () => {
      expect(calculateUserEffectivePrice({
        marketEffectivePrice: 20000,
        instantDiscounts: [{ eligibilityStatus: 'UNKNOWN', amount: 5000 }],
      })).toBe(20000);
    });

    it('does not subtract reward points', () => {
      expect(calculateUserEffectivePrice({
        marketEffectivePrice: 20000,
        instantDiscounts: [],
        rewardPoints: 10000,
      })).toBe(20000);
    });

    it('rejects a negative user effective price', () => {
      expect(() => calculateUserEffectivePrice({
        marketEffectivePrice: 1000,
        instantDiscounts: [{ eligibilityStatus: 'ELIGIBLE', amount: 1001 }],
      })).toThrow('negative');
    });
  });

  describe('price history calculations', () => {
    it('calculates discount rate from recent average', () => {
      expect(calculateDiscountRateFromRecentAverage(15000, 20000)).toBe(25);
    });

    it('returns null when recentAveragePrice is null or zero', () => {
      expect(calculateDiscountRateFromRecentAverage(15000, null)).toBeNull();
      expect(calculateDiscountRateFromRecentAverage(15000, 0)).toBeNull();
    });

    it('calculates saving from previous sale', () => {
      expect(calculateSavingFromPreviousSale(15000, 17000)).toBe(2000);
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

    it('returns null for the affected unit when capacity is unclear', () => {
      const totals = calculateCosmeticCapacityTotals([
        component('MAIN', 50, 'ML', 1),
        component('REFILL', null, 'ML', 1),
        component('OTHER_COSMETIC', 20, 'G', 1),
      ]);

      expect(totals).toEqual({ ml: null, g: 20 });
      expect(calculateUnitPrice(10000, totals.ml)).toBeNull();
      expect(calculateUnitPrice(10000, totals.g)).toBe(500);
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
