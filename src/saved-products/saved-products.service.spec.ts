import { NotFoundException } from '@nestjs/common';
import {
  InMemoryDatabase,
  InMemoryProductRepository,
  InMemorySavedProductRepository,
} from '../database/repositories/in-memory.repositories';
import { SavedProductsService } from './saved-products.service';

describe('SavedProductsService', () => {
  let database: InMemoryDatabase;
  let products: InMemoryProductRepository;
  let savedProducts: InMemorySavedProductRepository;
  let service: SavedProductsService;

  beforeEach(() => {
    database = new InMemoryDatabase();
    products = new InMemoryProductRepository(database);
    savedProducts = new InMemorySavedProductRepository(database);
    service = new SavedProductsService(savedProducts, products);
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

  function createProduct(id: string, productKey: string) {
    return products.create({
      id,
      canonical_name: 'Round Lab Sun Cream',
      brand: 'Round Lab',
      product_key: productKey,
      package_type: 'single',
    });
  }
});
