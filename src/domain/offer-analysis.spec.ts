import {
  assessDeliverySpeedStatus,
  assessOfficialSellerStatus,
  assessReturnPolicyStatus,
  calculateAllowedConclusions,
  compareOfferToAnchor,
  findLowestEffectivePriceOffer,
  findLowestUnitPriceOffer,
  getDeliverySpeedStatus,
  isPriceHistorySufficient,
} from './offer-analysis';
import { ProductComponent, SellerOffer } from './types';

describe('offer analysis', () => {
  const analysisDate = new Date('2026-07-24T00:00:00+09:00');

  describe('offer comparison', () => {
    it('marks offers for different products as not comparable', () => {
      const result = compareOfferToAnchor(
        offer({ id: 'anchor', productKey: 'roundlab-suncream' }),
        offer({ id: 'other', productKey: 'different-product' }),
      );

      expect(result).toEqual({ offerId: 'other', comparisonStatus: 'NOT_COMPARABLE' });
    });

    it('marks same product with different known capacity as unit comparable', () => {
      const result = compareOfferToAnchor(
        offer({ id: 'anchor', components: [component('MAIN', 50, 'ML', 1)] }),
        offer({ id: 'bundle', components: [component('MAIN', 50, 'ML', 2)] }),
      );

      expect(result.comparisonStatus).toBe('UNIT_COMPARABLE');
    });

    it('marks unclear component capacity as unknown comparison', () => {
      const result = compareOfferToAnchor(
        offer({ id: 'anchor' }),
        offer({ id: 'unclear', components: [component('MAIN', null, 'ML', 1)] }),
      );

      expect(result.comparisonStatus).toBe('UNKNOWN');
    });
  });

  describe('lowest effective price', () => {
    it('excludes offers with null effective price', () => {
      const offers = [
        offer({ id: 'null-price', userEffectivePrice: null }),
        offer({ id: 'valid', userEffectivePrice: 12000 }),
      ];

      expect(findLowestEffectivePriceOffer(offers, directResults(offers))?.id).toBe('valid');
    });

    it('excludes negative price offers as invalid', () => {
      const offers = [
        offer({ id: 'negative', userEffectivePrice: -1 }),
        offer({ id: 'valid', userEffectivePrice: 12000 }),
      ];

      expect(findLowestEffectivePriceOffer(offers, directResults(offers))?.id).toBe('valid');
    });

    it('returns null when there are no comparable offers', () => {
      const offers = [offer({ id: 'one', userEffectivePrice: 10000 })];

      expect(findLowestEffectivePriceOffer(offers, [
        { offerId: 'one', comparisonStatus: 'NOT_COMPARABLE' },
      ])).toBeNull();
    });

    it('returns the first offer when multiple offers have the same lowest price', () => {
      const offers = [
        offer({ id: 'first', userEffectivePrice: 10000 }),
        offer({ id: 'second', userEffectivePrice: 10000 }),
      ];

      expect(findLowestEffectivePriceOffer(offers, directResults(offers))?.id).toBe('first');
    });
  });

  describe('lowest unit price', () => {
    it('does not compare ML and G units with each other', () => {
      const offers = [
        offer({
          id: 'ml-offer',
          userEffectivePrice: 10000,
          components: [component('MAIN', 50, 'ML', 1)],
        }),
        offer({
          id: 'g-offer',
          userEffectivePrice: 1000,
          components: [component('MAIN', 100, 'G', 1)],
        }),
      ];

      expect(findLowestUnitPriceOffer(offers, unitResults(offers), 'ML')?.offer.id).toBe('ml-offer');
      expect(findLowestUnitPriceOffer(offers, unitResults(offers), 'G')?.offer.id).toBe('g-offer');
    });

    it('excludes offers with unclear capacity from unit price comparison', () => {
      const offers = [
        offer({
          id: 'unclear',
          userEffectivePrice: 1000,
          components: [component('MAIN', null, 'ML', 1)],
        }),
        offer({
          id: 'valid',
          userEffectivePrice: 10000,
          components: [component('MAIN', 50, 'ML', 1)],
        }),
      ];

      expect(findLowestUnitPriceOffer(offers, unitResults(offers), 'ML')?.offer.id).toBe('valid');
    });
  });

  describe('seller, return, and delivery criteria', () => {
    it('does not positively judge unknown official seller status', () => {
      expect(assessOfficialSellerStatus(
        offer({ officialSellerStatus: 'unconfirmed' }),
      )).toBe('UNKNOWN');
    });

    it('does not positively judge unknown return policy', () => {
      expect(assessReturnPolicyStatus(
        offer({ returnPolicyStatus: 'unconfirmed' }),
      )).toBe('UNKNOWN');
    });

    it('does not positively judge unknown delivery speed', () => {
      expect(getDeliverySpeedStatus(offer({ deliveryDays: null }), [
        offer({ deliveryDays: 1 }),
      ])).toBe('UNKNOWN');
      expect(assessDeliverySpeedStatus('UNKNOWN')).toBe('UNKNOWN');
    });

    it('positively judges delivery within one day of the fastest known offer', () => {
      const offers = [
        offer({ id: 'fastest', deliveryDays: 1 }),
        offer({ id: 'within-one', deliveryDays: 2 }),
      ];

      expect(getDeliverySpeedStatus(offers[1], offers)).toBe('FAST');
      expect(assessDeliverySpeedStatus('FAST')).toBe('POSITIVE');
    });
  });

  describe('price history and allowed conclusions', () => {
    it('excludes purchase timing conclusions when price history is insufficient', () => {
      const offers = [offer({ id: 'one', userEffectivePrice: 10000 })];
      const allowed = calculateAllowedConclusions({
        offers,
        anchorOffer: offers[0],
        priceHistory: [historyPoint('2026-07-01', 12000)],
        currentMarketEffectivePrice: 10000,
        recentAveragePrice: 12000,
        previousSalePrice: 10000,
        hasSufficientCompositionData: false,
        hasSetOrGiftEvidence: false,
      }, analysisDate);

      expect(isPriceHistorySufficient([historyPoint('2026-07-01', 12000)], analysisDate)).toBe(false);
      expect(allowed).not.toContain('LOW_POINT_BUY');
      expect(allowed).not.toContain('NEAR_REGULAR_PRICE');
    });

    it('allows purchase timing conclusions when price history is sufficient', () => {
      const offers = [offer({ id: 'one', userEffectivePrice: 10000 })];
      const allowed = calculateAllowedConclusions({
        offers,
        anchorOffer: offers[0],
        priceHistory: sufficientHistory(),
        currentMarketEffectivePrice: 10000,
        recentAveragePrice: 12000,
        previousSalePrice: 10000,
        hasSufficientCompositionData: false,
        hasSetOrGiftEvidence: false,
      }, analysisDate);

      expect(isPriceHistorySufficient(sufficientHistory(), analysisDate)).toBe(true);
      expect(allowed).toContain('LOW_POINT_BUY');
    });

    it('excludes seller comparison conclusions when there are no comparable offers', () => {
      const anchor = offer({ id: 'anchor', productKey: 'anchor' });
      const offers = [offer({ id: 'other', productKey: 'other' })];
      const allowed = calculateAllowedConclusions({
        offers,
        anchorOffer: anchor,
        priceHistory: sufficientHistory(),
        currentMarketEffectivePrice: 10000,
        recentAveragePrice: 12000,
        previousSalePrice: 10000,
        hasSufficientCompositionData: false,
        hasSetOrGiftEvidence: false,
      }, analysisDate);

      expect(allowed).toEqual([]);
    });

    it('allows seller comparison conclusions when comparable offers exist', () => {
      const offers = [offer({ id: 'one', userEffectivePrice: 10000 })];
      const allowed = calculateAllowedConclusions({
        offers,
        anchorOffer: offers[0],
        priceHistory: [],
        currentMarketEffectivePrice: null,
        recentAveragePrice: null,
        previousSalePrice: null,
        hasSufficientCompositionData: false,
        hasSetOrGiftEvidence: false,
      }, analysisDate);

      expect(allowed).toContain('REASONABLE_BUY');
    });

    it('does not include conclusions without the required evidence', () => {
      const offers = [offer({
        id: 'unclear',
        userEffectivePrice: null,
        components: [component('MAIN', null, 'ML', 1)],
      })];
      const allowed = calculateAllowedConclusions({
        offers,
        anchorOffer: offers[0],
        priceHistory: [],
        currentMarketEffectivePrice: null,
        recentAveragePrice: null,
        previousSalePrice: null,
        hasSufficientCompositionData: false,
        hasSetOrGiftEvidence: false,
      }, analysisDate);

      expect(allowed).toEqual([]);
    });
  });
});

function offer(overrides: Partial<SellerOffer> = {}): SellerOffer {
  return {
    id: 'offer',
    productKey: 'roundlab-suncream',
    userEffectivePrice: 10000,
    components: [component('MAIN', 50, 'ML', 1)],
    officialSellerStatus: 'confirmed_official',
    returnPolicyStatus: 'confirmed',
    deliveryDays: 1,
    packageType: 'single',
    ...overrides,
  };
}

function component(
  type: ProductComponent['type'],
  capacityValue: number | null,
  capacityUnit: ProductComponent['capacityUnit'],
  quantity: number | null,
): ProductComponent {
  return { type, capacityValue, capacityUnit, quantity };
}

function directResults(offers: readonly SellerOffer[]) {
  return offers.map((candidate) => ({
    offerId: candidate.id,
    comparisonStatus: 'DIRECTLY_COMPARABLE' as const,
  }));
}

function unitResults(offers: readonly SellerOffer[]) {
  return offers.map((candidate) => ({
    offerId: candidate.id,
    comparisonStatus: 'UNIT_COMPARABLE' as const,
  }));
}

function historyPoint(date: string, marketEffectivePrice: number) {
  return {
    observedAt: new Date(`${date}T00:00:00+09:00`),
    marketEffectivePrice,
  };
}

function sufficientHistory() {
  return [
    historyPoint('2026-07-01', 12000),
    historyPoint('2026-07-08', 12100),
    historyPoint('2026-07-15', 11900),
  ];
}
