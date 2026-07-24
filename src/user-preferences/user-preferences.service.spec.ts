import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  InMemoryDatabase,
  InMemoryUserPreferenceRepository,
} from '../database/repositories/in-memory.repositories';
import { UserPreferencesService } from './user-preferences.service';

describe('UserPreferencesService', () => {
  let service: UserPreferencesService;

  beforeEach(() => {
    const database = new InMemoryDatabase();
    service = new UserPreferencesService(
      new InMemoryUserPreferenceRepository(database),
    );
  });

  it('stores exactly three criteria', async () => {
    const result = await service.update('user-1', [
      'FINAL_PAYMENT_AMOUNT',
      'PURCHASE_TIMING',
      'UNIT_PRICE',
    ]);

    expect(result).toMatchObject({
      userId: 'user-1',
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
    });
  });

  it('updates preferences for the same userId', async () => {
    const first = await service.update('user-1', [
      'FINAL_PAYMENT_AMOUNT',
      'PURCHASE_TIMING',
      'UNIT_PRICE',
    ]);
    const second = await service.update('user-1', [
      'SET_AND_GIFTS',
      'FAST_DELIVERY',
      'REWARDS_AND_MEMBERSHIP',
    ]);

    expect(second.id).toBe(first.id);
    await expect(service.findByUserId('user-1')).resolves.toMatchObject({
      selectedCriteria: [
        'SET_AND_GIFTS',
        'FAST_DELIVERY',
        'REWARDS_AND_MEMBERSHIP',
      ],
    });
  });

  it('rejects two, four, duplicate, and unknown criteria', async () => {
    await expect(service.update('user-1', [
      'FINAL_PAYMENT_AMOUNT',
      'PURCHASE_TIMING',
    ])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('user-1', [
      'FINAL_PAYMENT_AMOUNT',
      'PURCHASE_TIMING',
      'UNIT_PRICE',
      'SET_AND_GIFTS',
    ])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('user-1', [
      'FINAL_PAYMENT_AMOUNT',
      'FINAL_PAYMENT_AMOUNT',
      'UNIT_PRICE',
    ])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('user-1', [
      'FINAL_PAYMENT_AMOUNT',
      'PURCHASE_TIMING',
      'UNKNOWN_CRITERION',
    ])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 when preferences do not exist', async () => {
    await expect(service.findByUserId('missing-user')).rejects.toBeInstanceOf(NotFoundException);
  });
});
