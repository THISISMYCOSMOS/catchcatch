import { ForbiddenException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import * as calculations from '../domain/calculations';
import {
  InMemoryAnalysisRepository,
  InMemoryAnalysisOfferRepository,
  InMemoryAnalysisPersistenceRepository,
  InMemoryDatabase,
  InMemoryPriceHistoryRepository,
  InMemoryProductComponentRepository,
  InMemoryProductRepository,
  InMemorySellerOfferBenefitRepository,
  InMemorySellerOfferComponentRepository,
  InMemorySellerOfferRepository,
  InMemoryUserCardRepository,
  InMemoryUserMembershipRepository,
  InMemoryUserPreferenceRepository,
  InMemoryUserShoppingGradeRepository,
} from '../database/repositories/in-memory.repositories';
import { Insert, Row } from '../database/database.types';
import {
  AnalysisPersistenceRepository,
  SellerOfferRepository,
} from '../database/repositories/repository.interfaces';
import { rankRecommendedOffers } from '../domain/recommendation-ranking';
import { AnalysesService } from './analyses.service';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('AnalysesService', () => {
  let database: InMemoryDatabase;
  let preferences: InMemoryUserPreferenceRepository;
  let products: InMemoryProductRepository;
  let components: InMemoryProductComponentRepository;
  let offers: InMemorySellerOfferRepository;
  let offerComponents: InMemorySellerOfferComponentRepository;
  let offerBenefits: InMemorySellerOfferBenefitRepository;
  let history: InMemoryPriceHistoryRepository;
  let analyses: InMemoryAnalysisRepository;
  let analysisPersistence: InMemoryAnalysisPersistenceRepository;
  let analysisOffers: InMemoryAnalysisOfferRepository;
  let memberships: InMemoryUserMembershipRepository;
  let shoppingGrades: InMemoryUserShoppingGradeRepository;
  let cards: InMemoryUserCardRepository;
  let service: AnalysesService;

  beforeEach(() => {
    database = new InMemoryDatabase();
    preferences = new InMemoryUserPreferenceRepository(database);
    products = new InMemoryProductRepository(database);
    components = new InMemoryProductComponentRepository(database);
    offers = new InMemorySellerOfferRepository(database);
    offerComponents = new InMemorySellerOfferComponentRepository(database);
    offerBenefits = new InMemorySellerOfferBenefitRepository(database);
    history = new InMemoryPriceHistoryRepository(database);
    analyses = new InMemoryAnalysisRepository(database);
    analysisPersistence = new InMemoryAnalysisPersistenceRepository(database);
    analysisOffers = new InMemoryAnalysisOfferRepository(database);
    memberships = new InMemoryUserMembershipRepository(database);
    shoppingGrades = new InMemoryUserShoppingGradeRepository(database);
    cards = new InMemoryUserCardRepository(database);
    service = new AnalysesService(
      preferences,
      products,
      components,
      offers,
      offerBenefits,
      offerComponents,
      history,
      analyses,
      analysisPersistence,
      analysisOffers,
      memberships,
      shoppingGrades,
      cards,
    );
  });

  it('creates a READY_FOR_JUDGMENT analysis without assigning a verdict', async () => {
    const product = await seedAnalysisReadyProduct();

    const result = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/1',
      productId: product.id,
    });

    expect(result).toMatchObject({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/1',
      productId: product.id,
      status: 'READY_FOR_JUDGMENT',
      verdict: null,
    });
    expect(result.id).toMatch(UUID_V4_PATTERN);
    expect(result.id).toBe(database.store.analyses[0].id);
    expect(result.allowedConclusions).toContain('LOW_POINT_BUY');
    expect(result.result).toMatchObject({
      lowestEffectivePriceOffer: {
        id: 'offer-lowest',
        userEffectivePrice: 10000,
      },
      priceHistorySufficient: true,
      offerCount: 2,
      unitPriceComparison: {
        ml: { id: 'offer-lowest', unitPrice: 200 },
        g: null,
      },
    });
    expect(await analysisOffers.findByAnalysisId(result.id)).toHaveLength(2);
  });

  it('uses seller offer components for unit price and keeps analysis snapshot immutable after offer refresh', async () => {
    const product = await seedAnalysisReadyProduct('offer-components-unit');

    const result = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/components',
      productId: product.id,
    });
    const snapshot = database.store.analysisOffers.find((row) => row.seller_identifier === 'offer-lowest');
    expect(snapshot?.total_amount).toBe(50);
    expect(snapshot?.calculated_unit_price).toBe(200);
    expect(snapshot?.offer_snapshot).toMatchObject({
      components: [
        expect.objectContaining({
          type: 'MAIN',
          capacity_value: 50,
          capacity_unit: 'ML',
          quantity: 1,
        }),
      ],
    });

    await offerComponents.replaceForSellerOffer('offer-lowest', [
      {
        seller_offer_id: 'offer-lowest',
        component_type: 'MAIN',
        capacity_value: 100,
        capacity_unit: 'ML',
        quantity: 1,
      },
    ]);

    const stored = database.store.analysisOffers.find((row) => (
      row.analysis_id === result.id && row.seller_identifier === 'offer-lowest'
    ));
    expect(stored?.total_amount).toBe(50);
    expect(stored?.offer_snapshot).toMatchObject({
      components: [
        expect.objectContaining({ capacity_value: 50 }),
      ],
    });
  });

  it('keeps unit price unknown when offer composition evidence is missing', async () => {
    const product = await seedAnalysisReadyProduct('no-offer-composition');
    await offerComponents.replaceForSellerOffer('offer-high', []);
    await offerComponents.replaceForSellerOffer('offer-lowest', []);

    const result = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/no-composition',
      productId: product.id,
    });

    expect(result.result).toMatchObject({
      lowestUnitPriceOffer: null,
      unitPriceComparison: {
        ml: null,
        g: null,
      },
    });
  });

  it('keeps a verified later seller rankable when the first offer is unverified', async () => {
    const product = await seedAnalysisReadyProduct('unknown-first-offer');
    const first = database.store.sellerOffers.find((offer) => offer.id === 'offer-high')!;
    first.source_verification_status = 'UNKNOWN';
    first.selected_option_verification_status = 'UNKNOWN';
    first.paid_configuration_verification_status = 'UNKNOWN';

    const result = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000263178',
      productId: product.id,
    });

    expect(result.status).toBe('READY_FOR_JUDGMENT');
    expect(result.result).toMatchObject({ recommendedOfferIds: ['offer-lowest'] });
    const snapshots = await analysisOffers.findByAnalysisId(result.id);
    expect(snapshots.find((snapshot) => snapshot.seller_identifier === 'offer-high')?.offer_snapshot)
      .toMatchObject({ comparisonStatus: 'UNKNOWN' });
  });

  it('writes price history at seller observed_at and skips duplicate observations on retry', async () => {
    const product = await seedAnalysisReadyProduct('observed-at-history');
    const offer = database.store.sellerOffers.find((row) => row.id === 'offer-lowest')!;
    offer.observed_at = '2026-08-17T05:00:00.000Z';

    await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/history-1',
      productId: product.id,
      idempotencyKey: 'history-1',
    });
    await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/history-2',
      productId: product.id,
      idempotencyKey: 'history-2',
    });

    const matchingHistory = database.store.priceHistory.filter((row) => (
      row.product_id === product.id &&
      row.seller_offer_id === 'offer-lowest' &&
      row.observed_at === '2026-08-17T05:00:00.000Z'
    ));
    expect(matchingHistory).toHaveLength(1);
    expect(matchingHistory[0]).toMatchObject({
      listed_price: 12000,
      listed_sale_price: 11000,
      is_sale_observation: true,
    });
  });

  it('returns product price history in chronological order and rejects unknown products', async () => {
    const product = await seedAnalysisReadyProduct('history-api-product');

    const response = await service.findProductPriceHistory(product.id);

    expect(response.productId).toBe(product.id);
    expect(response.points.map((point) => point.observedAt)).toEqual(
      [...response.points.map((point) => point.observedAt)].sort(),
    );
    await expect(service.findProductPriceHistory('00000000-0000-4000-8000-000000000999'))
      .rejects
      .toBeInstanceOf(NotFoundException);
  });

  it('returns the existing analysis for the same user idempotency key without duplicate snapshots or history', async () => {
    const product = await seedAnalysisReadyProduct('idempotent-product');

    const first = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/idempotent',
      productId: product.id,
      idempotencyKey: 'request-1',
    });
    const second = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/idempotent',
      productId: product.id,
      idempotencyKey: 'request-1',
    });

    expect(second.id).toBe(first.id);
    expect(database.store.analyses).toHaveLength(1);
    expect(await analysisOffers.findByAnalysisId(first.id)).toHaveLength(2);
    expect(database.store.priceHistory.filter((row) => row.analysis_id === first.id)).toHaveLength(2);
  });

  it('creates separate analyses for different idempotency keys and different users', async () => {
    const product = await seedAnalysisReadyProduct('idempotency-scope-product');
    await preferences.upsert({
      user_id: 'user-2',
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
    });

    const first = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/key-1',
      productId: product.id,
      idempotencyKey: 'same-key',
    });
    const second = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/key-2',
      productId: product.id,
      idempotencyKey: 'different-key',
    });
    const third = await service.create({
      userId: 'user-2',
      sourceUrl: 'https://example.com/product/key-3',
      productId: product.id,
      idempotencyKey: 'same-key',
    });

    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
  });

  it('deletes only the owning user analysis while preserving public price history', async () => {
    const product = await seedAnalysisReadyProduct('deletable-product');
    const created = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/deletable',
      productId: product.id,
    });

    await expect(service.deleteForUser(created.id, 'user-2'))
      .rejects
      .toBeInstanceOf(ForbiddenException);
    await expect(service.deleteForUser(created.id, 'user-1')).resolves.toBeUndefined();

    expect(await analyses.findById(created.id)).toBeNull();
    expect(database.store.analysisOffers.some((row) => row.analysis_id === created.id)).toBe(false);
    expect(database.store.priceHistory).toHaveLength(5);
    expect(database.store.priceHistory.every((row) => row.analysis_id === null)).toBe(true);
    await expect(service.deleteForUser(created.id, 'user-1'))
      .rejects
      .toBeInstanceOf(NotFoundException);
  });

  it('uses existing calculation functions in the analysis flow', async () => {
    const marketSpy = jest.spyOn(calculations, 'calculateMarketEffectivePriceBreakdown');
    const userSpy = jest.spyOn(calculations, 'calculateUserEffectivePriceBreakdown');
    const unitSpy = jest.spyOn(calculations, 'calculateUnitPrice');
    const recentAverageSpy = jest.spyOn(calculations, 'calculateDiscountRateFromRecentAverage');
    const previousSaleSpy = jest.spyOn(calculations, 'calculateSavingFromPreviousSale');
    const product = await seedAnalysisReadyProduct('calculation-spy-product');

    await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/calculation-spy',
      productId: product.id,
    });

    expect(marketSpy).toHaveBeenCalled();
    expect(userSpy).toHaveBeenCalled();
    expect(unitSpy).toHaveBeenCalled();
    expect(recentAverageSpy).toHaveBeenCalled();
    expect(previousSaleSpy).toHaveBeenCalled();
  });

  it('returns 404 when user preferences are missing', async () => {
    const product = await products.create({
      canonical_name: 'Product',
      product_key: 'product',
    });

    await expect(service.create({
      userId: 'missing-user',
      sourceUrl: 'https://example.com/product/1',
      productId: product.id,
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when product is missing', async () => {
    await seedPreferences();

    await expect(service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/1',
      productId: 'missing-product',
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates an analysis even when there are no offers', async () => {
    await seedPreferences();
    const product = await products.create({
      canonical_name: 'Product',
      product_key: 'product',
    });

    const result = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/1',
      productId: product.id,
    });

    expect(result.status).toBe('NEEDS_MORE_DATA');
    expect(result.allowedConclusions).toEqual([]);
    expect(result.result).toMatchObject({
      lowestEffectivePriceOffer: null,
      lowestUnitPriceOffer: null,
      priceHistorySufficient: false,
      offerCount: 0,
    });
  });

  it('excludes timing conclusions when price history is insufficient', async () => {
    await seedPreferences();
    const product = await products.create({
      canonical_name: 'Product',
      product_key: 'product',
    });
    await offers.createMany([
      {
        id: 'offer-one',
        product_id: product.id,
        seller_name: 'Seller',
        seller_url: 'https://example.com/offer',
        listed_sale_price: 10500,
        shipping_fee: 500,
        source_verification_status: 'VERIFIED',
        selected_option_verification_status: 'VERIFIED',
        paid_configuration_verification_status: 'VERIFIED',
      },
    ]);
    await offerComponents.replaceForSellerOffer('offer-one', [{
      seller_offer_id: 'offer-one',
      component_type: 'MAIN',
      capacity_value: 50,
      capacity_unit: 'ML',
      quantity: 1,
      physical_type: 'COSMETIC',
      commercial_inclusion: 'PAID',
      product_identity: 'SAME_PRODUCT',
      verification_status: 'VERIFIED',
    }]);

    const result = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/1',
      productId: product.id,
    });

    expect(result.allowedConclusions).toContain('REASONABLE_BUY');
    expect(result.allowedConclusions).not.toContain('LOW_POINT_BUY');
    expect(result.allowedConclusions).not.toContain('NEAR_REGULAR_PRICE');
    expect(result.warningCodes).toContain('PRICE_HISTORY_INSUFFICIENT');
  });

  it('finds a created analysis by id and returns 404 for a missing one', async () => {
    const product = await seedAnalysisReadyProduct();
    const created = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/1',
      productId: product.id,
    });

    await expect(service.findById(created.id)).resolves.toEqual(created);
    await expect(service.findById('missing-analysis')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks another user from reading an analysis', async () => {
    const product = await seedAnalysisReadyProduct();
    const created = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/1',
      productId: product.id,
    });

    await expect(service.findByIdForUser(created.id, 'user-2'))
      .rejects
      .toBeInstanceOf(ForbiddenException);
    await expect(service.findByIdForUser(created.id, 'user-1')).resolves.toMatchObject({
      id: created.id,
    });
  });

  it('uses the analysis id returned by atomic persistence', async () => {
    await seedPreferences();
    const product = await products.create({
      canonical_name: 'Product',
      product_key: 'product',
    });
    const generatedId = 'f902b912-c0aa-425d-8dc7-705277fffdc7';
    const createdRow: Row<'analyses'> = {
      id: generatedId,
      user_id: 'user-1',
      idempotency_key: 'idem-1',
      source_url: 'https://example.com/product/1',
      product_id: product.id,
      status: 'PENDING',
      verdict: null,
      allowed_conclusions: [],
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
      result_json: null,
      warning_codes: [],
      created_at: '2026-07-26T00:00:00.000Z',
      updated_at: '2026-07-26T00:00:00.000Z',
      expires_at: '2026-08-02T00:00:00.000Z',
    };
    const persistence: AnalysisPersistenceRepository = {
      persistAnalysisAtomically: jest.fn().mockResolvedValue(createdRow),
    };
    service = new AnalysesService(
      preferences,
      products,
      components,
      offers,
      offerBenefits,
      offerComponents,
      history,
      analyses,
      persistence,
      analysisOffers,
      memberships,
      shoppingGrades,
      cards,
    );

    const result = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/1',
      productId: product.id,
      idempotencyKey: 'idem-1',
    });

    expect(persistence.persistAnalysisAtomically).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'idem-1',
      status: 'NEEDS_MORE_DATA',
    }));
    expect(result.id).toBe(generatedId);
    expect(result.expiresAt).toBe('2026-08-02T00:00:00.000Z');
  });

  it('stores FAILED status when calculation throws', async () => {
    await seedPreferences();
    const product = await products.create({
      canonical_name: 'Product',
      product_key: 'product',
    });
    const throwingOffers: SellerOfferRepository = {
      findByProductId: jest.fn().mockRejectedValue(new Error('boom')),
      findAllByProductId: jest.fn(),
      createMany: jest.fn(),
      upsertMany: jest.fn(),
      deactivateExcept: jest.fn(),
    };
    service = new AnalysesService(
      preferences,
      products,
      components,
      throwingOffers,
      offerBenefits,
      offerComponents,
      history,
      analyses,
      analysisPersistence,
      analysisOffers,
      memberships,
      shoppingGrades,
      cards,
    );

    await expect(service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/1',
      productId: product.id,
    })).rejects.toBeInstanceOf(InternalServerErrorException);

    const stored = database.store.analyses[0];
    expect(stored).toMatchObject({
      status: 'FAILED',
      warning_codes: ['OTHER'],
      result_json: null,
    });
  });

  it('keeps analysis offer snapshots unchanged when seller offers change later', async () => {
    const product = await seedAnalysisReadyProduct();
    const created = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/1',
      productId: product.id,
    });
    const snapshotsBeforeChange = await analysisOffers.findByAnalysisId(created.id);
    const lowestSnapshot = snapshotsBeforeChange.find((snapshot) => snapshot.seller_offer_id === 'offer-lowest');
    expect(lowestSnapshot?.user_effective_price).toBe(10000);

    const mutableOffer = database.store.sellerOffers.find((offer) => offer.id === 'offer-lowest');
    if (!mutableOffer) {
      throw new Error('seeded offer missing');
    }
    mutableOffer.user_effective_price = 1;
    mutableOffer.market_effective_price = 1;

    const snapshotsAfterChange = await analysisOffers.findByAnalysisId(created.id);
    const unchangedSnapshot = snapshotsAfterChange.find((snapshot) => snapshot.seller_offer_id === 'offer-lowest');
    expect(unchangedSnapshot?.user_effective_price).toBe(10000);
    expect(unchangedSnapshot?.offer_snapshot).toMatchObject({
      userEffectivePrice: 10000,
    });
  });

  it('keeps user effective price equal to market price when no user benefits apply', async () => {
    const product = await seedAnalysisReadyProduct('no-benefits');

    const created = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/no-benefits',
      productId: product.id,
    });

    const snapshots = await analysisOffers.findByAnalysisId(created.id);
    const lowest = snapshots.find((snapshot) => snapshot.seller_offer_id === 'offer-lowest');
    expect(lowest).toMatchObject({
      market_effective_price: 10000,
      user_effective_price: 10000,
      user_discount: null,
    });
  });

  it('applies only enabled matching Coupang WOW membership discounts', async () => {
    const product = await seedBenefitReadyProduct('wow-product', {
      benefit_type: 'MEMBERSHIP',
      provider: 'COUPANG',
      required_membership_type: 'WOW',
      discount_amount: 1000,
    });
    await memberships.replaceForUser('user-1', [
      { user_id: 'user-1', provider: 'COUPANG', membership_type: 'WOW', enabled: true },
    ]);

    const created = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/wow',
      productId: product.id,
    });

    const [snapshot] = await analysisOffers.findByAnalysisId(created.id);
    expect(snapshot).toMatchObject({
      market_effective_price: 10000,
      user_effective_price: 9000,
      user_discount: 1000,
    });
    expect(snapshot.offer_snapshot).toMatchObject({
      appliedBenefits: [
        {
          benefitType: 'MEMBERSHIP',
          provider: 'COUPANG',
          discountAmount: 1000,
        },
      ],
    });
  });

  it('does not apply disabled membership discounts', async () => {
    const product = await seedBenefitReadyProduct('disabled-wow-product', {
      benefit_type: 'MEMBERSHIP',
      provider: 'COUPANG',
      required_membership_type: 'WOW',
      discount_amount: 1000,
    });
    await memberships.replaceForUser('user-1', [
      { user_id: 'user-1', provider: 'COUPANG', membership_type: 'WOW', enabled: false },
    ]);

    const created = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/disabled-wow',
      productId: product.id,
    });

    const [snapshot] = await analysisOffers.findByAnalysisId(created.id);
    expect(snapshot.user_effective_price).toBe(10000);
    expect(snapshot.user_discount).toBeNull();
  });

  it('applies exact shopping grade matches and ignores mismatches', async () => {
    const product = await seedBenefitReadyProduct('grade-product', {
      benefit_type: 'SHOPPING_GRADE',
      provider: 'MUSINSA',
      required_grade: 'GOLD',
      discount_amount: 700,
    });
    await shoppingGrades.replaceForUser('user-1', [
      { user_id: 'user-1', provider: 'MUSINSA', grade: 'SILVER' },
    ]);
    const mismatch = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/grade-mismatch',
      productId: product.id,
    });
    expect((await analysisOffers.findByAnalysisId(mismatch.id))[0].user_effective_price).toBe(10000);

    await shoppingGrades.replaceForUser('user-1', [
      { user_id: 'user-1', provider: 'MUSINSA', grade: 'GOLD' },
    ]);
    const matched = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/grade-match',
      productId: product.id,
    });
    expect((await analysisOffers.findByAnalysisId(matched.id))[0]).toMatchObject({
      user_effective_price: 9300,
      user_discount: 700,
    });
  });

  it('applies exact card conditions and ignores card mismatches', async () => {
    const product = await seedBenefitReadyProduct('card-product', {
      benefit_type: 'CARD',
      required_card_issuer: 'SHINHAN',
      required_card_product_code: 'SHINHAN_EXAMPLE_CARD',
      discount_amount: 500,
    });
    await cards.replaceForUser('user-1', [
      { user_id: 'user-1', issuer: 'SHINHAN', card_product_code: 'OTHER_CARD' },
    ]);
    const mismatch = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/card-mismatch',
      productId: product.id,
    });
    expect((await analysisOffers.findByAnalysisId(mismatch.id))[0].user_effective_price).toBe(10000);

    await cards.replaceForUser('user-1', [
      { user_id: 'user-1', issuer: 'SHINHAN', card_product_code: 'SHINHAN_EXAMPLE_CARD' },
    ]);
    const matched = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/card-match',
      productId: product.id,
    });
    expect((await analysisOffers.findByAnalysisId(matched.id))[0]).toMatchObject({
      user_effective_price: 9500,
      user_discount: 500,
    });
  });

  it('applies multiple eligible benefits while keeping users separated', async () => {
    const product = await seedBenefitReadyProduct('multi-benefit-product', {
      benefit_type: 'MEMBERSHIP',
      provider: 'COUPANG',
      required_membership_type: 'WOW',
      discount_amount: 1000,
    });
    await offerBenefits.createMany([
      {
        seller_offer_id: 'benefit-offer',
        benefit_type: 'CARD',
        required_card_issuer: 'SHINHAN',
        discount_amount: 500,
      },
    ]);
    await memberships.replaceForUser('user-1', [
      { user_id: 'user-1', provider: 'COUPANG', membership_type: 'WOW', enabled: true },
    ]);
    await cards.replaceForUser('user-1', [
      { user_id: 'user-1', issuer: 'SHINHAN', card_product_code: 'ANY_CARD' },
    ]);
    await preferences.upsert({
      user_id: 'user-2',
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
    });

    const userOne = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/user-one',
      productId: product.id,
    });
    const userTwo = await service.create({
      userId: 'user-2',
      sourceUrl: 'https://example.com/product/user-two',
      productId: product.id,
    });

    expect((await analysisOffers.findByAnalysisId(userOne.id))[0]).toMatchObject({
      user_effective_price: 8500,
      user_discount: 1500,
    });
    expect((await analysisOffers.findByAnalysisId(userTwo.id))[0]).toMatchObject({
      user_effective_price: 10000,
      user_discount: null,
    });
    expect(database.store.sellerOffers[0]).toMatchObject({
      id: 'benefit-offer',
      user_effective_price: null,
    });
  });

  it('does not mutate past snapshots when user memberships change later', async () => {
    const product = await seedBenefitReadyProduct('snapshot-benefit-product', {
      benefit_type: 'MEMBERSHIP',
      provider: 'COUPANG',
      required_membership_type: 'WOW',
      discount_amount: 1000,
    });
    await memberships.replaceForUser('user-1', [
      { user_id: 'user-1', provider: 'COUPANG', membership_type: 'WOW', enabled: true },
    ]);
    const created = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/snapshot',
      productId: product.id,
    });
    await memberships.replaceForUser('user-1', []);

    const [snapshot] = await analysisOffers.findByAnalysisId(created.id);
    expect(snapshot.user_effective_price).toBe(9000);
    expect(snapshot.offer_snapshot).toMatchObject({
      appliedBenefits: [{ benefitType: 'MEMBERSHIP' }],
    });
  });

  it('stores FAILED status when user discounts would create a negative price', async () => {
    const product = await seedBenefitReadyProduct('negative-benefit-product', {
      benefit_type: 'MEMBERSHIP',
      provider: 'COUPANG',
      required_membership_type: 'WOW',
      discount_amount: 10001,
    });
    await memberships.replaceForUser('user-1', [
      { user_id: 'user-1', provider: 'COUPANG', membership_type: 'WOW', enabled: true },
    ]);

    await expect(service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/negative',
      productId: product.id,
    })).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(database.store.analyses[0]).toMatchObject({
      status: 'FAILED',
      warning_codes: ['OTHER'],
    });
  });

  it('returns recent analyses by user with default limit one and snapshots', async () => {
    const firstProduct = await seedAnalysisReadyProduct('product-one');
    const first = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/1',
      productId: firstProduct.id,
    });
    await delayOneTick();
    const second = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/2',
      productId: firstProduct.id,
    });

    const recent = await service.findRecentByUserId('user-1');
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe(second.id);
    expect(recent[0].product).toMatchObject({ id: firstProduct.id });
    expect(recent[0].analysisOffers).toHaveLength(2);
    expect(first.id).not.toBe(second.id);
  });

  it('returns recent analyses with limit and separates users', async () => {
    const userOneProduct = await seedAnalysisReadyProduct('product-user-one');
    const first = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/1',
      productId: userOneProduct.id,
    });
    await delayOneTick();
    const second = await service.create({
      userId: 'user-1',
      sourceUrl: 'https://example.com/product/2',
      productId: userOneProduct.id,
    });

    await preferences.upsert({
      user_id: 'user-2',
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
    });
    const userTwoProduct = await products.create({
      canonical_name: 'User Two Product',
      product_key: 'product-user-two',
    });
    const otherUserAnalysis = await service.create({
      userId: 'user-2',
      sourceUrl: 'https://example.com/product/3',
      productId: userTwoProduct.id,
    });

    await expect(service.findRecentByUserId('user-1', '2')).resolves.toMatchObject([
      { id: second.id },
      { id: first.id },
    ]);
    await expect(service.findRecentByUserId('user-2', '2')).resolves.toMatchObject([
      { id: otherUserAnalysis.id },
    ]);
  });

  it('rejects recent analysis limits outside the supported range', async () => {
    await expect(service.findRecentByUserId('user-1', '0')).rejects.toThrow('limit');
    await expect(service.findRecentByUserId('user-1', '21')).rejects.toThrow('limit');
  });

  async function seedAnalysisReadyProduct(productKey = 'roundlab-suncream') {
    await seedPreferences();
    const product = await products.create({
      canonical_name: 'Round Lab Sun Cream',
      product_key: productKey,
      package_type: 'single',
    });
    await components.createMany([
      {
        product_id: product.id,
        component_type: 'MAIN',
        capacity_value: 50,
        capacity_unit: 'ML',
        quantity: 1,
      },
      {
        product_id: product.id,
        component_type: 'OTHER_COSMETIC',
        capacity_value: 20,
        capacity_unit: 'G',
        quantity: 1,
      },
    ]);
    await offers.createMany([
      {
        id: 'offer-high',
        product_id: product.id,
        seller_name: 'Seller High',
        seller_url: 'https://example.com/high',
        listed_price: 15000,
        listed_sale_price: 13000,
        public_discount_amount: 1000,
        shipping_fee: 0,
        user_effective_price: 7777,
        comparison_status: 'DIRECTLY_COMPARABLE',
        source_verification_status: 'VERIFIED',
        selected_option_verification_status: 'VERIFIED',
        paid_configuration_verification_status: 'VERIFIED',
      },
      {
        id: 'offer-lowest',
        product_id: product.id,
        seller_name: 'Seller Low',
        seller_url: 'https://example.com/low',
        listed_price: 12000,
        listed_sale_price: 11000,
        public_discount_amount: 1000,
        shipping_fee: 0,
        user_effective_price: 8888,
        comparison_status: 'DIRECTLY_COMPARABLE',
        source_verification_status: 'VERIFIED',
        selected_option_verification_status: 'VERIFIED',
        paid_configuration_verification_status: 'VERIFIED',
      },
    ]);
    await offerComponents.replaceForSellerOffer('offer-high', [
      {
        seller_offer_id: 'offer-high',
        component_type: 'MAIN',
        capacity_value: 50,
        capacity_unit: 'ML',
        quantity: 1,
        physical_type: 'COSMETIC',
        commercial_inclusion: 'PAID',
        product_identity: 'SAME_PRODUCT',
        verification_status: 'VERIFIED',
      },
      {
        seller_offer_id: 'offer-high',
        component_type: 'OTHER_COSMETIC',
        capacity_value: 20,
        capacity_unit: 'G',
        quantity: 1,
        physical_type: 'COSMETIC',
        commercial_inclusion: 'BONUS',
        product_identity: 'DIFFERENT_PRODUCT',
        verification_status: 'VERIFIED',
      },
    ]);
    await offerComponents.replaceForSellerOffer('offer-lowest', [
      {
        seller_offer_id: 'offer-lowest',
        component_type: 'MAIN',
        capacity_value: 50,
        capacity_unit: 'ML',
        quantity: 1,
        physical_type: 'COSMETIC',
        commercial_inclusion: 'PAID',
        product_identity: 'SAME_PRODUCT',
        verification_status: 'VERIFIED',
      },
    ]);
    await history.createMany([
      historyInput(product.id, 12000, daysAgo(20)),
      historyInput(product.id, 12100, daysAgo(10)),
      historyInput(product.id, 11900, daysAgo(5), {
        listed_price: 13000,
        listed_sale_price: 11900,
        is_sale_observation: true,
      }),
    ]);
    return product;
  }

  async function seedBenefitReadyProduct(
    productKey: string,
    benefit: Omit<Insert<'seller_offer_benefits'>, 'seller_offer_id'>,
  ) {
    await seedPreferences();
    const product = await products.create({
      canonical_name: 'Benefit Product',
      product_key: productKey,
      package_type: 'single',
    });
    await components.createMany([
      {
        product_id: product.id,
        component_type: 'MAIN',
        capacity_value: 50,
        capacity_unit: 'ML',
        quantity: 1,
      },
    ]);
    await offers.createMany([
      {
        id: 'benefit-offer',
        product_id: product.id,
        seller_name: 'Benefit Seller',
        seller_url: 'https://example.com/benefit-offer',
        listed_price: 12000,
        listed_sale_price: 11000,
        public_discount_amount: 1000,
        shipping_fee: 0,
      },
    ]);
    await offerComponents.replaceForSellerOffer('benefit-offer', [
      {
        seller_offer_id: 'benefit-offer',
        component_type: 'MAIN',
        capacity_value: 50,
        capacity_unit: 'ML',
        quantity: 1,
      },
    ]);
    await offerBenefits.createMany([
      {
        seller_offer_id: 'benefit-offer',
        ...benefit,
      },
    ]);
    return product;
  }

  async function seedPreferences() {
    await preferences.upsert({
      user_id: 'user-1',
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
    });
  }
});

function historyInput(
  productId: string,
  price: number,
  observedAt: string,
  overrides: Partial<Insert<'price_history'>> = {},
) {
  return {
    product_id: productId,
    market_effective_price: price,
    observed_at: observedAt,
    listed_price: null,
    listed_sale_price: null,
    is_sale_observation: false,
    observation_key: null,
    ...overrides,
  };
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function delayOneTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 1);
  });
}

describe('rankRecommendedOffers', () => {
  const single = rankingSnapshot('single', {
    sellerName: 'BIGROOM',
    price: 12000,
    quantity: 1,
    totalAmount: 60,
    unitPrice: 200,
  });
  const onePlusOne = rankingSnapshot('one-plus-one', {
    sellerName: 'BIGROOM',
    price: 18000,
    quantity: 2,
    totalAmount: 120,
    unitPrice: 150,
    comparisonStatus: 'UNIT_COMPARABLE',
  });

  it('prefers the single item when final payment amount is the first criterion', () => {
    expect(rankRecommendedOffers(
      [onePlusOne, single],
      ['FINAL_PAYMENT_AMOUNT', 'UNIT_PRICE', 'RIGHT_SIZED_PURCHASE'],
    )).toEqual(['single']);
  });

  it('prefers same-product 1+1 when unit price is the first criterion', () => {
    expect(rankRecommendedOffers(
      [single, onePlusOne],
      ['UNIT_PRICE', 'FINAL_PAYMENT_AMOUNT', 'RIGHT_SIZED_PURCHASE'],
    )).toEqual(['single']);
  });

  it('returns one global top three and excludes non-comparable offers', () => {
    const offers = [
      single,
      onePlusOne,
      rankingSnapshot('third', { sellerName: 'COUPANG', price: 19000, quantity: 1, totalAmount: 60, unitPrice: 317 }),
      rankingSnapshot('fourth', { sellerName: 'OLIVE_YOUNG', price: 20000, quantity: 1, totalAmount: 60, unitPrice: 333 }),
      rankingSnapshot('mixed-set', { sellerName: 'BIGROOM', price: 9000, quantity: 3, totalAmount: 180, unitPrice: 50, comparisonStatus: 'NOT_COMPARABLE' }),
    ];

    expect(rankRecommendedOffers(
      offers,
      ['FINAL_PAYMENT_AMOUNT', 'UNIT_PRICE', 'RIGHT_SIZED_PURCHASE'],
    )).toEqual(['single', 'third', 'fourth']);
  });

  it('does not compare capacity and item count as the same right-size unit', () => {
    const capacityOffer = rankingSnapshot('capacity', {
      sellerName: 'BIGROOM', price: 15000, quantity: 1, totalAmount: 60, unitPrice: 250,
    });
    const countOnlyOffer = rankingSnapshot('count-only', {
      sellerName: 'COUPANG', price: 12000, quantity: 2, totalAmount: null, unitPrice: 6000, unit: null,
    });

    expect(rankRecommendedOffers(
      [capacityOffer, countOnlyOffer],
      ['RIGHT_SIZED_PURCHASE', 'FINAL_PAYMENT_AMOUNT', 'UNIT_PRICE'],
    )).toEqual(['count-only', 'capacity']);
  });
});

function rankingSnapshot(
  id: string,
  input: {
    sellerName: string;
    price: number;
    quantity: number;
    totalAmount: number | null;
    unitPrice: number;
    unit?: 'ML' | 'G' | null;
    comparisonStatus?: 'DIRECTLY_COMPARABLE' | 'UNIT_COMPARABLE' | 'NOT_COMPARABLE';
  },
): Row<'analysis_offers'> {
  return {
    id: `snapshot-${id}`,
    analysis_id: 'analysis-ranking',
    seller_offer_id: id,
    seller_identifier: id,
    seller_name: input.sellerName,
    original_list_price: input.price + 1000,
    sale_price: input.price,
    market_effective_price: input.price,
    user_effective_price: input.price,
    shipping_fee: 0,
    public_discount: null,
    user_discount: null,
    quantity: input.quantity,
    total_amount: input.totalAmount,
    unit: input.unit === undefined ? 'ML' : input.unit,
    calculated_unit_price: input.unitPrice,
    offer_snapshot: {
      comparisonStatus: input.comparisonStatus ?? 'DIRECTLY_COMPARABLE',
      deliveryDays: 2,
    },
    created_at: new Date(0).toISOString(),
  };
}
