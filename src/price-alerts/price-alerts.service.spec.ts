import { BadRequestException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import {
  InMemoryDatabase,
  InMemoryPriceAlertRepository,
  InMemoryProductRepository,
} from '../database/repositories/in-memory.repositories';
import { CreatePriceAlertDto } from './dto/create-price-alert.dto';
import { UpdatePriceAlertEnabledDto } from './dto/update-price-alert-enabled.dto';
import { PriceAlertsService } from './price-alerts.service';

describe('PriceAlertsService', () => {
  let database: InMemoryDatabase;
  let products: InMemoryProductRepository;
  let alerts: InMemoryPriceAlertRepository;
  let service: PriceAlertsService;

  beforeEach(() => {
    database = new InMemoryDatabase();
    products = new InMemoryProductRepository(database);
    alerts = new InMemoryPriceAlertRepository(database);
    service = new PriceAlertsService(alerts, products);
  });

  it('creates a price alert with enabled true by default', async () => {
    const product = await createProduct();

    const result = await service.create('user-1', product.id, 25000);

    expect(result).toMatchObject({
      userId: 'user-1',
      productId: product.id,
      targetPrice: 25000,
      enabled: true,
      product: {
        id: product.id,
        canonicalName: 'Round Lab Sun Cream',
      },
    });
  });

  it('allows null and zero targetPrice without converting null to zero', async () => {
    const product = await createProduct();

    const nullTarget = await service.create('user-1', product.id, null);
    const zeroTarget = await service.create('user-1', product.id, 0);

    expect(nullTarget.targetPrice).toBeNull();
    expect(zeroTarget.targetPrice).toBe(0);
  });

  it('rejects negative targetPrice as a bad request', async () => {
    const product = await createProduct();

    await expect(service.create('user-1', product.id, -1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 when product does not exist', async () => {
    await expect(service.create('user-1', 'missing-product', 1000)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists price alerts by user and returns empty array for none', async () => {
    const product = await createProduct();
    await service.create('user-1', product.id, 1000);
    await service.create('user-2', product.id, 2000);

    const result = await service.findByUserId('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('user-1');
    await expect(service.findByUserId('empty-user')).resolves.toEqual([]);
  });

  it('updates enabled true to false and false to true', async () => {
    const product = await createProduct();
    const alert = await service.create('user-1', product.id, 1000);

    const disabled = await service.updateEnabled(alert.id, false);
    const enabled = await service.updateEnabled(alert.id, true);

    expect(disabled.enabled).toBe(false);
    expect(enabled.enabled).toBe(true);
  });

  it('returns 404 when updating a missing alert', async () => {
    await expect(service.updateEnabled('missing-alert', false)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects non-boolean enabled DTO values', async () => {
    const dto = new UpdatePriceAlertEnabledDto();
    (dto as unknown as { enabled: string }).enabled = 'false';

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('rejects numeric strings for targetPrice DTO values', async () => {
    const dto = new CreatePriceAlertDto();
    dto.userId = 'user-1';
    dto.productId = 'product-1';
    (dto as unknown as { targetPrice: string }).targetPrice = '25000';

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  function createProduct() {
    return products.create({
      id: 'product-1',
      canonical_name: 'Round Lab Sun Cream',
      brand: 'Round Lab',
      product_key: 'roundlab-suncream',
      package_type: 'single',
    });
  }
});
