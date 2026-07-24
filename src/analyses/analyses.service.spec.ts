import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import {
  InMemoryAnalysisRepository,
  InMemoryDatabase,
  InMemoryPriceHistoryRepository,
  InMemoryProductComponentRepository,
  InMemoryProductRepository,
  InMemorySellerOfferRepository,
  InMemoryUserPreferenceRepository,
} from '../database/repositories/in-memory.repositories';
import { SellerOfferRepository } from '../database/repositories/repository.interfaces';
import { AnalysesService } from './analyses.service';

describe('AnalysesService', () => {
  let database: InMemoryDatabase;
  let preferences: InMemoryUserPreferenceRepository;
  let products: InMemoryProductRepository;
  let components: InMemoryProductComponentRepository;
  let offers: InMemorySellerOfferRepository;
  let history: InMemoryPriceHistoryRepository;
  let analyses: InMemoryAnalysisRepository;
  let service: AnalysesService;

  beforeEach(() => {
    database = new InMemoryDatabase();
    preferences = new InMemoryUserPreferenceRepository(database);
    products = new InMemoryProductRepository(database);
    components = new InMemoryProductComponentRepository(database);
    offers = new InMemorySellerOfferRepository(database);
    history = new InMemoryPriceHistoryRepository(database);
    analyses = new InMemoryAnalysisRepository(database);
    service = new AnalysesService(preferences, products, components, offers, history, analyses);
  });

  it('creates a completed analysis without assigning a verdict', async () => {
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
      status: 'COMPLETED',
      verdict: null,
    });
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
        g: { id: 'offer-lowest', unitPrice: 500 },
      },
    });
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

    expect(result.status).toBe('COMPLETED');
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
        user_effective_price: 10000,
      },
    ]);

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

  it('stores FAILED status when calculation throws', async () => {
    await seedPreferences();
    const product = await products.create({
      canonical_name: 'Product',
      product_key: 'product',
    });
    const throwingOffers: SellerOfferRepository = {
      findByProductId: jest.fn().mockRejectedValue(new Error('boom')),
      createMany: jest.fn(),
    };
    service = new AnalysesService(preferences, products, components, throwingOffers, history, analyses);

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

  async function seedAnalysisReadyProduct() {
    await seedPreferences();
    const product = await products.create({
      canonical_name: 'Round Lab Sun Cream',
      product_key: 'roundlab-suncream',
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
        user_effective_price: 12000,
      },
      {
        id: 'offer-lowest',
        product_id: product.id,
        seller_name: 'Seller Low',
        seller_url: 'https://example.com/low',
        user_effective_price: 10000,
      },
    ]);
    await history.createMany([
      historyInput(product.id, 12000, daysAgo(20)),
      historyInput(product.id, 12100, daysAgo(10)),
      historyInput(product.id, 11900, daysAgo(5)),
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

function historyInput(productId: string, price: number, observedAt: string) {
  return {
    product_id: productId,
    market_effective_price: price,
    observed_at: observedAt,
  };
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}
