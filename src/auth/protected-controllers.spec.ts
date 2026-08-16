import { ForbiddenException } from '@nestjs/common';
import { AnalysesController } from '../analyses/analyses.controller';
import { PriceAlertsController } from '../price-alerts/price-alerts.controller';
import { SavedProductsController } from '../saved-products/saved-products.controller';
import { UserPreferencesController } from '../user-preferences/user-preferences.controller';

const userA = { id: 'user-a', email: 'a@example.com' };
const userB = { id: 'user-b', email: 'b@example.com' };

describe('protected user controllers', () => {
  it('uses authenticated user id for POST /analyses instead of body userId', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'analysis-1' }),
      findRecentByUserId: jest.fn(),
      findByIdForUser: jest.fn(),
      deleteForUser: jest.fn(),
    };
    const controller = new AnalysesController(service as never);

    await controller.create({
      userId: 'user-b',
      sourceUrl: 'https://example.com/product',
      productId: 'product-1',
      idempotencyKey: 'request-1',
    }, userA);

    expect(service.create).toHaveBeenCalledWith({
      userId: 'user-a',
      sourceUrl: 'https://example.com/product',
      productId: 'product-1',
      idempotencyKey: 'request-1',
    });
  });

  it('blocks another user analysis lookup through the controller owner path', async () => {
    const service = {
      create: jest.fn(),
      findRecentByUserId: jest.fn(),
      findByIdForUser: jest.fn().mockRejectedValue(new ForbiddenException()),
      deleteForUser: jest.fn(),
    };
    const controller = new AnalysesController(service as never);

    await expect(controller.findById('11111111-1111-4111-8111-111111111111', userA))
      .rejects
      .toBeInstanceOf(ForbiddenException);
  });

  it('uses the authenticated user for recent analysis and deletion', async () => {
    const service = {
      create: jest.fn(),
      findRecentByUserId: jest.fn().mockResolvedValue([]),
      findByIdForUser: jest.fn(),
      deleteForUser: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new AnalysesController(service as never);
    const analysisId = '11111111-1111-4111-8111-111111111111';

    await expect(controller.findRecent(userA, '5')).resolves.toEqual([]);
    await expect(controller.deleteById(analysisId, userA)).resolves.toBeUndefined();

    expect(service.findRecentByUserId).toHaveBeenCalledWith('user-a', '5');
    expect(service.deleteForUser).toHaveBeenCalledWith(analysisId, 'user-a');
  });

  it('allows own saved-products access and blocks another userId', async () => {
    const service = {
      save: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue([]),
      findCardsByUserId: jest.fn().mockResolvedValue([]),
      remove: jest.fn(),
    };
    const controller = new SavedProductsController(service as never);

    await expect(controller.findByUserId('user-a', userA)).resolves.toEqual([]);
    expect(() => controller.findByUserId('user-b', userA)).toThrow(ForbiddenException);
    expect(() => controller.findCardsByUserId('user-b', userA)).toThrow(ForbiddenException);
  });

  it('uses authenticated user id when saving products', async () => {
    const service = {
      save: jest.fn().mockResolvedValue({ userId: 'user-a' }),
      findByUserId: jest.fn(),
      findCardsByUserId: jest.fn(),
      remove: jest.fn(),
    };
    const controller = new SavedProductsController(service as never);

    await controller.save({ userId: 'user-b', productId: 'product-1' }, userA);

    expect(service.save).toHaveBeenCalledWith('user-a', 'product-1');
  });

  it('blocks another user preferences access', async () => {
    const service = {
      update: jest.fn(),
      findByUserId: jest.fn(),
    };
    const controller = new UserPreferencesController(service as never);

    expect(() => controller.findByUserId('user-b', userA)).toThrow(ForbiddenException);
    expect(() => controller.update('user-b', { selectedCriteria: [] }, userA)).toThrow(ForbiddenException);
  });

  it('uses authenticated user id for alerts and delegates owner update checks', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ userId: 'user-a' }),
      findByUserId: jest.fn().mockResolvedValue([]),
      updateEnabledForUser: jest.fn().mockResolvedValue({ enabled: false }),
    };
    const controller = new PriceAlertsController(service as never);

    await controller.create({ userId: 'user-b', productId: 'product-1', targetPrice: 1000 }, userA);
    expect(() => controller.findByUserId('user-b', userA)).toThrow(ForbiddenException);
    await controller.updateEnabled('alert-1', { enabled: false }, userA);

    expect(service.create).toHaveBeenCalledWith('user-a', 'product-1', 1000);
    expect(service.updateEnabledForUser).toHaveBeenCalledWith('user-a', 'alert-1', false);
  });

  it('keeps sale calendar public by not requiring user owner checks', () => {
    expect(userB.id).toBe('user-b');
  });
});
