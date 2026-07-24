import { Insert } from '../database.types';
import { SupabaseProductRepository } from './supabase-product.repository';
import { SupabaseSellerOfferRepository } from './supabase-seller-offer.repository';
import {
  InMemoryAnalysisRepository,
  InMemoryDatabase,
  InMemoryPriceAlertRepository,
  InMemoryPriceHistoryRepository,
  InMemoryProductRepository,
  InMemorySavedProductRepository,
  InMemorySellerOfferRepository,
  InMemoryUserPreferenceRepository,
} from './in-memory.repositories';

describe('repository implementations', () => {
  let database: InMemoryDatabase;
  let userPreferences: InMemoryUserPreferenceRepository;
  let products: InMemoryProductRepository;
  let sellerOffers: InMemorySellerOfferRepository;
  let priceHistory: InMemoryPriceHistoryRepository;
  let analyses: InMemoryAnalysisRepository;
  let savedProducts: InMemorySavedProductRepository;
  let priceAlerts: InMemoryPriceAlertRepository;

  beforeEach(() => {
    database = new InMemoryDatabase();
    userPreferences = new InMemoryUserPreferenceRepository(database);
    products = new InMemoryProductRepository(database);
    sellerOffers = new InMemorySellerOfferRepository(database);
    priceHistory = new InMemoryPriceHistoryRepository(database);
    analyses = new InMemoryAnalysisRepository(database);
    savedProducts = new InMemorySavedProductRepository(database);
    priceAlerts = new InMemoryPriceAlertRepository(database);
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

  it('does not call Supabase for empty seller offer createMany input', async () => {
    const client = { from: jest.fn() };
    const repository = new SupabaseSellerOfferRepository(client as never);

    await expect(repository.createMany([])).resolves.toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
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
