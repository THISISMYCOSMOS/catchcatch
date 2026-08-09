import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  InMemoryUserCardRepository,
  InMemoryDatabase,
  InMemoryUserMembershipRepository,
  InMemoryUserPreferenceRepository,
  InMemoryUserShoppingGradeRepository,
} from '../database/repositories/in-memory.repositories';
import { UserPreferencesService } from './user-preferences.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

describe('UserPreferencesService', () => {
  let service: UserPreferencesService;

  beforeEach(() => {
    const database = new InMemoryDatabase();
    service = new UserPreferencesService(
      new InMemoryUserPreferenceRepository(database),
      new InMemoryUserMembershipRepository(database),
      new InMemoryUserShoppingGradeRepository(database),
      new InMemoryUserCardRepository(database),
    );
  });

  it('stores exactly three criteria', async () => {
    const result = await service.update('user-1', {
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
    });

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
    const first = await service.update('user-1', {
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
    });
    const second = await service.update('user-1', {
      selectedCriteria: [
        'SET_AND_GIFTS',
        'FAST_DELIVERY',
        'REWARDS_AND_MEMBERSHIP',
      ],
    });

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
    await expect(service.update('user-1', {
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
      ],
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('user-1', {
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
        'SET_AND_GIFTS',
      ],
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('user-1', {
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'FINAL_PAYMENT_AMOUNT',
        'UNIT_PRICE',
      ],
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('user-1', {
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNKNOWN_CRITERION',
      ],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 when preferences do not exist', async () => {
    await expect(service.findByUserId('missing-user')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores and returns reward membership, shopping grade, and card benefit inputs', async () => {
    const result = await service.update('user-1', {
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'FAST_DELIVERY',
        'REWARDS_AND_MEMBERSHIP',
      ],
      memberships: [{ provider: 'COUPANG', membershipType: 'WOW', enabled: true }],
      shoppingGrades: [{ provider: 'MUSINSA', grade: 'GOLD' }],
      cards: [{ issuer: 'SHINHAN', cardProductCode: 'SHINHAN_EXAMPLE_CARD' }],
    });

    expect(result).toMatchObject({
      memberships: [{ provider: 'COUPANG', membershipType: 'WOW', enabled: true }],
      shoppingGrades: [{ provider: 'MUSINSA', grade: 'GOLD' }],
      cards: [{ issuer: 'SHINHAN', cardProductCode: 'SHINHAN_EXAMPLE_CARD' }],
    });
    await expect(service.findByUserId('user-1')).resolves.toMatchObject({
      memberships: [{ provider: 'COUPANG', membershipType: 'WOW', enabled: true }],
      shoppingGrades: [{ provider: 'MUSINSA', grade: 'GOLD' }],
      cards: [{ issuer: 'SHINHAN', cardProductCode: 'SHINHAN_EXAMPLE_CARD' }],
    });
  });

  it('replaces existing reward benefit inputs on repeated PUT updates', async () => {
    await service.update('user-1', {
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'FAST_DELIVERY',
        'REWARDS_AND_MEMBERSHIP',
      ],
      memberships: [{ provider: 'COUPANG', membershipType: 'WOW', enabled: true }],
      shoppingGrades: [{ provider: 'MUSINSA', grade: 'GOLD' }],
      cards: [{ issuer: 'SHINHAN', cardProductCode: 'SHINHAN_EXAMPLE_CARD' }],
    });

    const updated = await service.update('user-1', {
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'FAST_DELIVERY',
        'REWARDS_AND_MEMBERSHIP',
      ],
      memberships: [{ provider: 'NAVER', membershipType: 'NAVER_PLUS', enabled: false }],
      shoppingGrades: [],
      cards: [],
    });

    expect(updated.memberships).toEqual([
      { provider: 'NAVER', membershipType: 'NAVER_PLUS', enabled: false },
    ]);
    expect(updated.shoppingGrades).toEqual([]);
    expect(updated.cards).toEqual([]);
  });

  it('allows empty or omitted benefit arrays', async () => {
    await expect(service.update('user-1', {
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'FAST_DELIVERY',
        'REWARDS_AND_MEMBERSHIP',
      ],
      memberships: [],
      shoppingGrades: [],
      cards: [],
    })).resolves.toMatchObject({
      memberships: [],
      shoppingGrades: [],
      cards: [],
    });
    await expect(service.update('user-2', {
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'PURCHASE_TIMING',
        'UNIT_PRICE',
      ],
    })).resolves.toMatchObject({
      memberships: [],
      shoppingGrades: [],
      cards: [],
    });
  });

  it('rejects sensitive card fields through DTO whitelisting', async () => {
    const dto = plainToInstance(UpdateUserPreferencesDto, {
      selectedCriteria: [
        'FINAL_PAYMENT_AMOUNT',
        'FAST_DELIVERY',
        'REWARDS_AND_MEMBERSHIP',
      ],
      cards: [{
        issuer: 'SHINHAN',
        cardProductCode: 'SHINHAN_EXAMPLE_CARD',
        cardNumber: '1234123412341234',
      }],
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(JSON.stringify(errors)).toContain('cardNumber');
  });
});
