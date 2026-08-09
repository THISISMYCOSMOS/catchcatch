import { Insert } from '../database.types';
import { AnalysisPersistencePayload } from './repository.interfaces';
import { SupabaseAnalysisOfferRepository } from './supabase-analysis-offer.repository';
import { SupabaseAnalysisPersistenceRepository } from './supabase-analysis-persistence.repository';
import { SupabaseAnalysisRepository } from './supabase-analysis.repository';
import { SupabaseProductRepository } from './supabase-product.repository';
import { SupabaseSellerOfferBenefitRepository } from './supabase-seller-offer-benefit.repository';
import { SupabaseSellerOfferRepository } from './supabase-seller-offer.repository';
import {
  InMemoryAnalysisRepository,
  InMemoryAnalysisOfferRepository,
  InMemoryAnalysisPersistenceRepository,
  InMemoryDatabase,
  InMemoryUserCardRepository,
  InMemoryUserMembershipRepository,
  InMemoryPriceAlertRepository,
  InMemoryPriceHistoryRepository,
  InMemoryProductRepository,
  InMemorySavedProductRepository,
  InMemorySellerOfferBenefitRepository,
  InMemorySellerOfferRepository,
  InMemoryUserPreferenceRepository,
  InMemoryUserShoppingGradeRepository,
} from './in-memory.repositories';

describe('repository implementations', () => {
  let database: InMemoryDatabase;
  let userPreferences: InMemoryUserPreferenceRepository;
  let products: InMemoryProductRepository;
  let sellerOffers: InMemorySellerOfferRepository;
  let sellerOfferBenefits: InMemorySellerOfferBenefitRepository;
  let priceHistory: InMemoryPriceHistoryRepository;
  let analyses: InMemoryAnalysisRepository;
  let analysisPersistence: InMemoryAnalysisPersistenceRepository;
  let analysisOffers: InMemoryAnalysisOfferRepository;
  let savedProducts: InMemorySavedProductRepository;
  let priceAlerts: InMemoryPriceAlertRepository;
  let memberships: InMemoryUserMembershipRepository;
  let shoppingGrades: InMemoryUserShoppingGradeRepository;
  let cards: InMemoryUserCardRepository;

  beforeEach(() => {
    database = new InMemoryDatabase();
    userPreferences = new InMemoryUserPreferenceRepository(database);
    products = new InMemoryProductRepository(database);
    sellerOffers = new InMemorySellerOfferRepository(database);
    sellerOfferBenefits = new InMemorySellerOfferBenefitRepository(database);
    priceHistory = new InMemoryPriceHistoryRepository(database);
    analyses = new InMemoryAnalysisRepository(database);
    analysisPersistence = new InMemoryAnalysisPersistenceRepository(database);
    analysisOffers = new InMemoryAnalysisOfferRepository(database);
    savedProducts = new InMemorySavedProductRepository(database);
    priceAlerts = new InMemoryPriceAlertRepository(database);
    memberships = new InMemoryUserMembershipRepository(database);
    shoppingGrades = new InMemoryUserShoppingGradeRepository(database);
    cards = new InMemoryUserCardRepository(database);
  });

  it('upserts exactly three user criteria', async () => {
    const row = await userPreferences.upsert({
      user_id: 'user-1',
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
    });

    expect(row.selected_criteria).toEqual([
      'FINAL_PAYMENT_AMOUNT',
      'PURCHASE_TIMING',
      'UNIT_PRICE',
    ]);
    await expect(userPreferences.findByUserId('user-1')).resolves.toEqual(row);
  });

  it('rejects invalid user criteria counts and duplicates', async () => {
    await expect(userPreferences.upsert({
      user_id: 'user-1',
      selected_criteria: ['FINAL_PAYMENT_AMOUNT', 'PURCHASE_TIMING'],
    } as Insert<'user_preferences'>)).rejects.toThrow('Exactly three criteria');
    await expect(userPreferences.upsert({
      user_id: 'user-1',
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
        'SET_AND_GIFTS',
      ],
    } as Insert<'user_preferences'>)).rejects.toThrow('Exactly three criteria');
    await expect(userPreferences.upsert({
      user_id: 'user-1',
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'FINAL_PAYMENT_AMOUNT',
        'UNIT_PRICE',
      ],
    })).rejects.toThrow('distinct');
  });

  it('updates existing user preference for the same user_id', async () => {
    const first = await userPreferences.upsert({
      user_id: 'user-1',
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
    });
    const second = await userPreferences.upsert({
      user_id: 'user-1',
      selected_criteria: [
        'SET_AND_GIFTS',
        'FAST_DELIVERY',
        'REWARDS_AND_MEMBERSHIP',
      ],
    });

    expect(second.id).toBe(first.id);
    expect(await userPreferences.findByUserId('user-1')).toMatchObject({
      selected_criteria: [
        'SET_AND_GIFTS',
        'FAST_DELIVERY',
        'REWARDS_AND_MEMBERSHIP',
      ],
    });
  });

  it('creates and finds products by id and product_key', async () => {
    const product = await products.create({
      canonical_name: 'Round Lab Sun Cream',
      product_key: 'roundlab-suncream',
      brand: 'Round Lab',
      package_type: 'single',
    });

    expect(await products.findById(product.id)).toEqual(product);
    expect(await products.findByProductKey('roundlab-suncream')).toEqual(product);
  });

  it('rejects duplicate product_key creation', async () => {
    await products.create({
      canonical_name: 'Round Lab Sun Cream',
      product_key: 'roundlab-suncream',
    });

    await expect(products.create({
      canonical_name: 'Duplicate',
      product_key: 'roundlab-suncream',
    })).rejects.toThrow('Product already exists');
  });

  it('creates seller offers in input order and finds them by product_id', async () => {
    const created = await sellerOffers.createMany([
      sellerOfferInput({ seller_name: 'A', user_effective_price: 10000 }),
      sellerOfferInput({ seller_name: 'B', user_effective_price: 9000 }),
    ]);

    expect(created.map((row) => row.seller_name)).toEqual(['A', 'B']);
    await expect(sellerOffers.findByProductId('product-1')).resolves.toEqual(created);
  });

  it('rejects negative seller offer prices', async () => {
    await expect(sellerOffers.createMany([
      sellerOfferInput({ user_effective_price: -1 }),
    ])).rejects.toThrow('negative');
  });

  it('returns an empty array for empty seller offer createMany input', async () => {
    await expect(sellerOffers.createMany([])).resolves.toEqual([]);
  });

  it('creates price history and returns it sorted by observed_at', async () => {
    await priceHistory.createMany([
      priceHistoryInput({ observed_at: '2026-07-03T00:00:00.000Z' }),
      priceHistoryInput({ observed_at: '2026-07-01T00:00:00.000Z' }),
      priceHistoryInput({ observed_at: '2026-07-02T00:00:00.000Z' }),
    ]);

    const found = await priceHistory.findByProductId('product-1');
    expect(found.map((row) => row.observed_at)).toEqual([
      '2026-07-01T00:00:00.000Z',
      '2026-07-02T00:00:00.000Z',
      '2026-07-03T00:00:00.000Z',
    ]);
  });

  it('rejects negative price history values and handles empty createMany', async () => {
    await expect(priceHistory.createMany([
      priceHistoryInput({ market_effective_price: -1 }),
    ])).rejects.toThrow('negative');
    await expect(priceHistory.createMany([])).resolves.toEqual([]);
  });

  it('creates, finds, and updates analysis result fields', async () => {
    const analysis = await analyses.create({
      user_id: 'user-1',
      source_url: 'https://example.com/product',
      status: 'NEEDS_MORE_DATA',
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
      allowed_conclusions: [],
      warning_codes: [],
    });

    const updated = await analyses.updateResult(analysis.id, {
      status: 'COMPLETED',
      verdict: 'REASONABLE_BUY',
      allowed_conclusions: ['REASONABLE_BUY'],
      warning_codes: ['PRICE_HISTORY_INSUFFICIENT'],
      result_json: { summary: 'saved snapshot' },
    });

    expect(await analyses.findById(analysis.id)).toEqual(updated);
    expect(updated).toMatchObject({
      status: 'COMPLETED',
      verdict: 'REASONABLE_BUY',
      allowed_conclusions: ['REASONABLE_BUY'],
      warning_codes: ['PRICE_HISTORY_INSUFFICIENT'],
      result_json: { summary: 'saved snapshot' },
    });
  });

  it('throws a clear error when updating a missing analysis', async () => {
    await expect(analyses.updateResult('missing-analysis', {
      status: 'COMPLETED',
    })).rejects.toThrow('Analysis not found');
  });

  it('stores seller offer benefit rules and prevents duplicates', async () => {
    const created = await sellerOfferBenefits.createMany([
      sellerOfferBenefitInput({ id: 'benefit-1' }),
      sellerOfferBenefitInput({ id: 'benefit-2' }),
    ]);

    expect(created).toHaveLength(1);
    await expect(sellerOfferBenefits.findBySellerOfferIds(['offer-1'])).resolves.toMatchObject([
      {
        benefit_type: 'MEMBERSHIP',
        provider: 'COUPANG',
        required_membership_type: 'WOW',
        discount_amount: 1000,
      },
    ]);
    await expect(sellerOfferBenefits.findBySellerOfferIds([])).resolves.toEqual([]);
  });

  it('rejects negative seller offer benefit discounts', async () => {
    await expect(sellerOfferBenefits.createMany([
      sellerOfferBenefitInput({ discount_amount: -1 }),
    ])).rejects.toThrow('negative');
  });

  it('finds recent analyses by user in newest-first order', async () => {
    const first = await analyses.create(analysisInput({
      user_id: 'user-1',
      source_url: 'https://example.com/first',
      created_at: '2026-07-01T00:00:00.000Z',
    }));
    const second = await analyses.create(analysisInput({
      user_id: 'user-1',
      source_url: 'https://example.com/second',
      created_at: '2026-07-02T00:00:00.000Z',
    }));
    await analyses.create(analysisInput({
      user_id: 'user-2',
      source_url: 'https://example.com/other',
      created_at: '2026-07-03T00:00:00.000Z',
    }));

    await expect(analyses.findRecentByUserId('user-1', 2)).resolves.toEqual([second, first]);
  });

  it('stores analysis offer snapshots and prevents duplicate analysis seller rows', async () => {
    const created = await analysisOffers.createMany([
      analysisOfferInput({ seller_identifier: 'offer-1', seller_name: 'Seller A' }),
      analysisOfferInput({ seller_identifier: 'offer-1', seller_name: 'Seller A Changed' }),
    ]);

    expect(created).toHaveLength(1);
    expect(await analysisOffers.findByAnalysisId('analysis-1')).toMatchObject([
      {
        analysis_id: 'analysis-1',
        seller_identifier: 'offer-1',
        seller_name: 'Seller A',
        user_effective_price: 10000,
      },
    ]);

    const repeated = await analysisOffers.createMany([
      analysisOfferInput({ seller_identifier: 'offer-1', seller_name: 'Seller A Later' }),
    ]);
    expect(repeated[0].seller_name).toBe('Seller A');
    expect(await analysisOffers.findByAnalysisId('analysis-1')).toHaveLength(1);
  });

  it('atomically persists analysis, snapshots, and price history', async () => {
    const result = await analysisPersistence.persistAnalysisAtomically(analysisPersistencePayload({
      idempotencyKey: 'request-1',
      offerSnapshots: [
        analysisOfferInput({ seller_identifier: 'offer-1', seller_name: 'Seller A' }),
      ],
      priceHistoryEntries: [
        priceHistoryInput({ seller_offer_id: 'offer-1' }),
      ],
    }));

    expect(result).toMatchObject({
      user_id: 'user-1',
      idempotency_key: 'request-1',
      status: 'COMPLETED',
    });
    expect(await analysisOffers.findByAnalysisId(result.id)).toHaveLength(1);
    expect(database.store.priceHistory).toMatchObject([
      {
        analysis_id: result.id,
        product_id: 'product-1',
        seller_offer_id: 'offer-1',
      },
    ]);
  });

  it('rolls back all in-memory writes when snapshot persistence fails', async () => {
    analysisPersistence.failAfterOfferSnapshots = true;

    await expect(analysisPersistence.persistAnalysisAtomically(analysisPersistencePayload({
      offerSnapshots: [
        analysisOfferInput({ seller_identifier: 'offer-1' }),
      ],
      priceHistoryEntries: [
        priceHistoryInput({ seller_offer_id: 'offer-1' }),
      ],
    }))).rejects.toThrow('Injected failure');

    expect(database.store.analyses).toEqual([]);
    expect(database.store.analysisOffers).toEqual([]);
    expect(database.store.priceHistory).toEqual([]);
  });

  it('rolls back all in-memory writes when price history persistence fails', async () => {
    analysisPersistence.failAfterPriceHistory = true;

    await expect(analysisPersistence.persistAnalysisAtomically(analysisPersistencePayload({
      offerSnapshots: [
        analysisOfferInput({ seller_identifier: 'offer-1' }),
      ],
      priceHistoryEntries: [
        priceHistoryInput({ seller_offer_id: 'offer-1' }),
      ],
    }))).rejects.toThrow('Injected failure');

    expect(database.store.analyses).toEqual([]);
    expect(database.store.analysisOffers).toEqual([]);
    expect(database.store.priceHistory).toEqual([]);
  });

  it('returns existing analysis for duplicate idempotency keys without duplicate children', async () => {
    const first = await analysisPersistence.persistAnalysisAtomically(analysisPersistencePayload({
      idempotencyKey: 'request-1',
      offerSnapshots: [
        analysisOfferInput({ seller_identifier: 'offer-1' }),
        analysisOfferInput({ seller_identifier: 'offer-1' }),
      ],
      priceHistoryEntries: [
        priceHistoryInput({ seller_offer_id: 'offer-1' }),
        priceHistoryInput({ seller_offer_id: 'offer-1' }),
      ],
    }));
    const second = await analysisPersistence.persistAnalysisAtomically(analysisPersistencePayload({
      idempotencyKey: 'request-1',
      offerSnapshots: [
        analysisOfferInput({ seller_identifier: 'offer-2' }),
      ],
      priceHistoryEntries: [
        priceHistoryInput({ seller_offer_id: 'offer-2' }),
      ],
    }));

    expect(second.id).toBe(first.id);
    expect(database.store.analyses).toHaveLength(1);
    expect(await analysisOffers.findByAnalysisId(first.id)).toHaveLength(1);
    expect(database.store.priceHistory).toHaveLength(1);
  });

  it('prevents duplicate saved products and removes saved products safely', async () => {
    const first = await savedProducts.save({ user_id: 'user-1', product_id: 'product-1' });
    const second = await savedProducts.save({ user_id: 'user-1', product_id: 'product-1' });

    expect(second.id).toBe(first.id);
    expect(await savedProducts.findByUserId('user-1')).toHaveLength(1);
    await savedProducts.remove('user-1', 'product-1');
    await savedProducts.remove('user-1', 'product-1');
    expect(await savedProducts.findByUserId('user-1')).toEqual([]);
  });

  it('creates price alerts and updates enabled state', async () => {
    const alert = await priceAlerts.create({
      user_id: 'user-1',
      product_id: 'product-1',
      target_price: 12000,
    });

    const updated = await priceAlerts.updateEnabled(alert.id, false);
    expect(updated.enabled).toBe(false);
    await expect(priceAlerts.findByUserId('user-1')).resolves.toEqual([updated]);
  });

  it('rejects negative target_price and missing alert updates', async () => {
    await expect(priceAlerts.create({
      user_id: 'user-1',
      product_id: 'product-1',
      target_price: -1,
    })).rejects.toThrow('negative');
    await expect(priceAlerts.updateEnabled('missing-alert', true)).rejects.toThrow('Price alert not found');
  });

  it('replaces user memberships and prevents duplicate membership rows', async () => {
    const created = await memberships.replaceForUser('user-1', [
      { user_id: 'user-1', provider: 'COUPANG', membership_type: 'WOW', enabled: true },
      { user_id: 'user-1', provider: 'COUPANG', membership_type: 'WOW', enabled: false },
    ]);

    expect(created).toHaveLength(1);
    expect(await memberships.findByUserId('user-1')).toMatchObject([
      { provider: 'COUPANG', membership_type: 'WOW', enabled: true },
    ]);

    const replaced = await memberships.replaceForUser('user-1', [
      { user_id: 'user-1', provider: 'NAVER', membership_type: 'NAVER_PLUS', enabled: false },
    ]);
    expect(replaced).toMatchObject([
      { provider: 'NAVER', membership_type: 'NAVER_PLUS', enabled: false },
    ]);
    expect(await memberships.findByUserId('user-1')).toHaveLength(1);
  });

  it('replaces user shopping grades and prevents duplicate provider rows', async () => {
    await shoppingGrades.replaceForUser('user-1', [
      { user_id: 'user-1', provider: 'MUSINSA', grade: 'GOLD' },
      { user_id: 'user-1', provider: 'MUSINSA', grade: 'SILVER' },
    ]);

    expect(await shoppingGrades.findByUserId('user-1')).toMatchObject([
      { provider: 'MUSINSA', grade: 'GOLD' },
    ]);

    await shoppingGrades.replaceForUser('user-1', []);
    expect(await shoppingGrades.findByUserId('user-1')).toEqual([]);
  });

  it('replaces user cards and stores only issuer and card product code', async () => {
    await cards.replaceForUser('user-1', [
      { user_id: 'user-1', issuer: 'SHINHAN', card_product_code: 'SHINHAN_EXAMPLE_CARD' },
      { user_id: 'user-1', issuer: 'SHINHAN', card_product_code: 'SHINHAN_EXAMPLE_CARD' },
    ]);

    const found = await cards.findByUserId('user-1');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      issuer: 'SHINHAN',
      card_product_code: 'SHINHAN_EXAMPLE_CARD',
    });
    expect(found[0]).not.toHaveProperty('card_number');
    expect(found[0]).not.toHaveProperty('cvc');
    expect(found[0]).not.toHaveProperty('expires_at');
  });

  it('does not call Supabase for empty seller offer createMany input', async () => {
    const client = { from: jest.fn() };
    const repository = new SupabaseSellerOfferRepository(client as never);

    await expect(repository.createMany([])).resolves.toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('does not call Supabase for empty seller offer benefit createMany and find input', async () => {
    const client = { from: jest.fn() };
    const repository = new SupabaseSellerOfferBenefitRepository(client as never);

    await expect(repository.createMany([])).resolves.toEqual([]);
    await expect(repository.findBySellerOfferIds([])).resolves.toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('does not call Supabase for empty analysis offer createMany input', async () => {
    const client = { from: jest.fn() };
    const repository = new SupabaseAnalysisOfferRepository(client as never);

    await expect(repository.createMany([])).resolves.toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('persists analysis through Supabase RPC and converts RPC errors', async () => {
    const rpc = jest.fn().mockResolvedValueOnce({
      data: analysisRow({ id: 'analysis-1', idempotency_key: 'request-1' }),
      error: null,
    }).mockResolvedValueOnce({
      data: null,
      error: { message: 'duplicate key value violates unique constraint', code: '23505' },
    });
    const repository = new SupabaseAnalysisPersistenceRepository({ rpc } as never);

    await expect(repository.persistAnalysisAtomically(analysisPersistencePayload({
      idempotencyKey: 'request-1',
    }))).resolves.toMatchObject({
      id: 'analysis-1',
      idempotency_key: 'request-1',
    });
    expect(rpc).toHaveBeenCalledWith('persist_analysis_atomically', {
      payload: expect.objectContaining({ idempotencyKey: 'request-1' }),
    });
    await expect(repository.persistAnalysisAtomically(analysisPersistencePayload()))
      .rejects
      .toThrow('persist analysis atomically failed (23505): duplicate key value violates unique constraint');
  });

  it('converts Supabase errors into clear Error instances without network access', async () => {
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint', code: '23505' },
    });
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    const from = jest.fn(() => ({ insert }));
    const repository = new SupabaseProductRepository({ from } as never);

    await expect(repository.create({
      canonical_name: 'Duplicate',
      product_key: 'duplicate',
    })).rejects.toThrow('create product failed (23505): duplicate key value violates unique constraint');
    expect(from).toHaveBeenCalledWith('products');
  });

  it('finds a Supabase analysis by id with json result and null verdict', async () => {
    const analysisRow = {
      id: 'analysis-1',
      user_id: 'user-1',
      source_url: 'https://example.com/product',
      product_id: 'product-1',
      status: 'COMPLETED',
      verdict: null,
      allowed_conclusions: ['REASONABLE_BUY'],
      selected_criteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
      result_json: {
        lowestEffectivePriceOffer: null,
        lowestUnitPriceOffer: null,
        priceHistorySufficient: false,
        offerCount: 0,
      },
      warning_codes: [],
      created_at: '2026-07-26T00:00:00.000Z',
      updated_at: '2026-07-26T00:00:00.000Z',
    };
    const maybeSingle = jest.fn().mockResolvedValue({ data: analysisRow, error: null });
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    const repository = new SupabaseAnalysisRepository({ from } as never);

    await expect(repository.findById('analysis-1')).resolves.toEqual(analysisRow);
    expect(from).toHaveBeenCalledWith('analyses');
    expect(eq).toHaveBeenCalledWith('id', 'analysis-1');
  });

  it('returns null for a missing Supabase analysis without throwing', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    const repository = new SupabaseAnalysisRepository({ from } as never);

    await expect(repository.findById('missing-analysis')).resolves.toBeNull();
  });

  it('converts Supabase analysis lookup errors into clear Error instances', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'TypeError: fetch failed' },
    });
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    const repository = new SupabaseAnalysisRepository({ from } as never);

    await expect(repository.findById('analysis-1'))
      .rejects
      .toThrow('find analysis by id failed: TypeError: fetch failed');
  });
});

function sellerOfferInput(
  overrides: Partial<Insert<'seller_offers'>> = {},
): Insert<'seller_offers'> {
  return {
    product_id: 'product-1',
    seller_name: 'Seller',
    seller_url: 'https://example.com/product',
    ...overrides,
  };
}

function analysisInput(
  overrides: Partial<Insert<'analyses'>> = {},
): Insert<'analyses'> {
  return {
    source_url: 'https://example.com/product',
    status: 'COMPLETED',
    selected_criteria: [
      'FINAL_PAYMENT_AMOUNT',
      'PURCHASE_TIMING',
      'UNIT_PRICE',
    ],
    ...overrides,
  };
}

function analysisRow(
  overrides: Partial<ReturnType<typeof analysisInput> & { id: string; created_at: string; updated_at: string }> = {},
) {
  return {
    id: 'analysis-1',
    user_id: 'user-1',
    idempotency_key: null,
    source_url: 'https://example.com/product',
    product_id: 'product-1',
    status: 'COMPLETED',
    verdict: null,
    allowed_conclusions: ['REASONABLE_BUY'],
    selected_criteria: [
      'FINAL_PAYMENT_AMOUNT',
      'PURCHASE_TIMING',
      'UNIT_PRICE',
    ],
    result_json: { summary: 'saved snapshot' },
    warning_codes: [],
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function analysisPersistencePayload(overrides: {
  idempotencyKey?: string | null;
  offerSnapshots?: ReturnType<typeof analysisOfferInput>[];
  priceHistoryEntries?: ReturnType<typeof priceHistoryInput>[];
} = {}): AnalysisPersistencePayload {
  return {
    userId: 'user-1',
    productId: 'product-1',
    sourceUrl: 'https://example.com/product',
    idempotencyKey: overrides.idempotencyKey ?? null,
    status: 'COMPLETED' as const,
    verdict: null,
    allowedConclusions: ['REASONABLE_BUY' as const],
    selectedCriteria: [
      'FINAL_PAYMENT_AMOUNT' as const,
      'PURCHASE_TIMING' as const,
      'UNIT_PRICE' as const,
    ],
    warningCodes: [],
    resultJson: { summary: 'saved snapshot' },
    offerSnapshots: (overrides.offerSnapshots ?? []).map(toPersistenceOfferSnapshot),
    priceHistoryEntries: (overrides.priceHistoryEntries ?? []).map(toPersistencePriceHistory),
  };
}

function toPersistenceOfferSnapshot(
  input: Insert<'analysis_offers'>,
): AnalysisPersistencePayload['offerSnapshots'][number] {
  return {
    seller_offer_id: input.seller_offer_id ?? null,
    seller_identifier: input.seller_identifier,
    seller_name: input.seller_name,
    original_list_price: input.original_list_price ?? null,
    sale_price: input.sale_price ?? null,
    market_effective_price: input.market_effective_price ?? null,
    user_effective_price: input.user_effective_price ?? null,
    shipping_fee: input.shipping_fee ?? null,
    public_discount: input.public_discount ?? null,
    user_discount: input.user_discount ?? null,
    quantity: input.quantity ?? null,
    total_amount: input.total_amount ?? null,
    unit: input.unit ?? null,
    calculated_unit_price: input.calculated_unit_price ?? null,
    offer_snapshot: input.offer_snapshot,
  };
}

function toPersistencePriceHistory(
  input: Insert<'price_history'>,
): AnalysisPersistencePayload['priceHistoryEntries'][number] {
  return {
    product_id: input.product_id,
    seller_offer_id: input.seller_offer_id ?? null,
    market_effective_price: input.market_effective_price ?? null,
    observed_at: input.observed_at,
  };
}

function analysisOfferInput(
  overrides: Partial<Insert<'analysis_offers'>> = {},
): Insert<'analysis_offers'> {
  return {
    analysis_id: 'analysis-1',
    seller_identifier: 'offer-1',
    seller_name: 'Seller',
    seller_offer_id: 'offer-1',
    original_list_price: 12000,
    market_effective_price: 11000,
    user_effective_price: 10000,
    quantity: 1,
    total_amount: 50,
    unit: 'ML',
    calculated_unit_price: 200,
    offer_snapshot: { sellerName: 'Seller' },
    ...overrides,
  };
}

function sellerOfferBenefitInput(
  overrides: Partial<Insert<'seller_offer_benefits'>> = {},
): Insert<'seller_offer_benefits'> {
  return {
    seller_offer_id: 'offer-1',
    benefit_type: 'MEMBERSHIP',
    provider: 'COUPANG',
    required_membership_type: 'WOW',
    discount_amount: 1000,
    ...overrides,
  };
}

function priceHistoryInput(
  overrides: Partial<Insert<'price_history'>> = {},
): Insert<'price_history'> {
  return {
    product_id: 'product-1',
    market_effective_price: 10000,
    observed_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}
