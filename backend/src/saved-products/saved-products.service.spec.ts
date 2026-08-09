import { NotFoundException } from '@nestjs/common';
import {
  InMemoryDatabase,
  InMemoryPriceAlertRepository,
  InMemoryPriceHistoryRepository,
  InMemoryProductRepository,
  InMemorySavedProductRepository,
  InMemorySellerOfferRepository,
} from '../database/repositories/in-memory.repositories';
import { SavedProductsService } from './saved-products.service';

describe('SavedProductsService', () => {
  let database: InMemoryDatabase;
  let products: InMemoryProductRepository;
  let savedProducts: InMemorySavedProductRepository;
  let sellerOffers: InMemorySellerOfferRepository;
  let priceHistory: InMemoryPriceHistoryRepository;
  let priceAlerts: InMemoryPriceAlertRepository;
  let service: SavedProductsService;

  beforeEach(() => {
    database = new InMemoryDatabase();
    products = new InMemoryProductRepository(database);
    savedProducts = new InMemorySavedProductRepository(database);
    sellerOffers = new InMemorySellerOfferRepository(database);
    priceHistory = new InMemoryPriceHistoryRepository(database);
    priceAlerts = new InMemoryPriceAlertRepository(database);
    service = new SavedProductsService(
      savedProducts,
      products,
      sellerOffers,
      priceHistory,
      priceAlerts,
    );
  });

  it('saves an existing product with product summary', async () => {
    const product = await createProduct('product-1', 'roundlab-suncream');

    const result = await service.save('user-1', product.id);

    expect(result).toMatchObject({
      userId: 'user-1',
      productId: product.id,
      product: {
        id: product.id,
        canonicalName: 'Round Lab Sun Cream',
        brand: 'Round Lab',
        productKey: 'roundlab-suncream',
      },
    });
  });

  it('returns 404 when saving a missing product', async () => {
    await expect(service.save('user-1', 'missing-product')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('prevents duplicate rows for the same user and product', async () => {
    const product = await createProduct('product-1', 'roundlab-suncream');

    const first = await service.save('user-1', product.id);
    const second = await service.save('user-1', product.id);

    expect(second.id).toBe(first.id);
    expect(await service.findByUserId('user-1')).toHaveLength(1);
  });

  it('lists saved products by user and does not mix different users', async () => {
    const firstProduct = await createProduct('product-1', 'roundlab-suncream');
    const secondProduct = await createProduct('product-2', 'toner');
    await service.save('user-1', firstProduct.id);
    await service.save('user-2', secondProduct.id);

    const result = await service.findByUserId('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].productId).toBe(firstProduct.id);
  });

  it('returns an empty array when user has no saved products', async () => {
    await expect(service.findByUserId('empty-user')).resolves.toEqual([]);
  });

  it('removes saved products and safely handles missing rows', async () => {
    const product = await createProduct('product-1', 'roundlab-suncream');
    await service.save('user-1', product.id);

    await expect(service.remove('user-1', product.id)).resolves.toEqual({ removed: true });
    await expect(service.remove('user-1', product.id)).resolves.toEqual({ removed: true });
    await expect(service.findByUserId('user-1')).resolves.toEqual([]);
  });

  it('returns saved product cards with lowest market price, previous price, discount rate, and alert state', async () => {
    const product = await createProduct('product-1', 'roundlab-suncream');
    await sellerOffers.createMany([
      sellerOfferInput(product.id, 'Seller High', 16000),
      sellerOfferInput(product.id, 'Seller Low', 15000),
    ]);
    await priceHistory.createMany([
      {
        product_id: product.id,
        market_effective_price: 18000,
        observed_at: '2026-08-01T00:00:00.000Z',
      },
    ]);
    await priceAlerts.create({
      user_id: 'user-1',
      product_id: product.id,
      enabled: true,
    });
    await service.save('user-1', product.id);

    const result = await service.findCardsByUserId('user-1');

    expect(result).toMatchObject([
      {
        productId: product.id,
        canonicalName: 'Round Lab Sun Cream',
        brand: 'Round Lab',
        imageUrl: 'https://example.com/roundlab.jpg',
        currentPrice: 15000,
        previousPrice: 18000,
        discountRate: closeTo(16.666),
        sellerName: 'Seller Low',
        isPriceAlertEnabled: true,
      },
    ]);
  });

  it('returns null previous price and discount rate when there is no price history', async () => {
    const product = await createProduct('product-1', 'roundlab-suncream');
    await sellerOffers.createMany([
      sellerOfferInput(product.id, 'Seller Low', 15000),
    ]);
    await service.save('user-1', product.id);

    const result = await service.findCardsByUserId('user-1');

    expect(result[0]).toMatchObject({
      currentPrice: 15000,
      previousPrice: null,
      discountRate: null,
      isPriceAlertEnabled: false,
    });
  });

  it('separates saved product cards by user and sorts by newest savedAt', async () => {
    const firstProduct = await createProduct('product-1', 'first-product');
    const secondProduct = await createProduct('product-2', 'second-product');
    const otherProduct = await createProduct('product-3', 'other-product');
    await service.save('user-1', firstProduct.id);
    await delayOneTick();
    await service.save('user-1', secondProduct.id);
    await service.save('user-2', otherProduct.id);

    const result = await service.findCardsByUserId('user-1');

    expect(result.map((card) => card.productId)).toEqual([secondProduct.id, firstProduct.id]);
  });

  function createProduct(id: string, productKey: string) {
    return products.create({
      id,
      canonical_name: 'Round Lab Sun Cream',
      brand: 'Round Lab',
      image_url: 'https://example.com/roundlab.jpg',
      product_key: productKey,
      package_type: 'single',
    });
  }
});

function sellerOfferInput(productId: string, sellerName: string, marketEffectivePrice: number) {
  return {
    product_id: productId,
    seller_name: sellerName,
    seller_url: `https://example.com/${sellerName}`,
    market_effective_price: marketEffectivePrice,
  };
}

function delayOneTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 1);
  });
}

function closeTo(value: number) {
  return expect.closeTo(value, 2);
}
