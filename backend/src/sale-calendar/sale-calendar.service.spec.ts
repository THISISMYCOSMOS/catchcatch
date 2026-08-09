import { BadRequestException } from '@nestjs/common';
import {
  InMemoryDatabase,
  InMemorySaleCalendarRepository,
} from '../database/repositories/in-memory.repositories';
import { SaleCalendarService } from './sale-calendar.service';

describe('SaleCalendarService', () => {
  let database: InMemoryDatabase;
  let repository: InMemorySaleCalendarRepository;
  let service: SaleCalendarService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T00:00:00.000Z'));
    database = new InMemoryDatabase();
    repository = new InMemorySaleCalendarRepository(database);
    service = new SaleCalendarService(repository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns active sales and excludes ended sales by default', async () => {
    seedSales();

    const result = await service.find();

    expect(result.map((sale) => sale.id)).toEqual([
      'active-high',
      'active-low',
      'upcoming-soon',
      'upcoming-later',
    ]);
    expect(result.map((sale) => sale.status)).toEqual(['ACTIVE', 'ACTIVE', 'UPCOMING', 'UPCOMING']);
    expect(result.find((sale) => sale.id === 'ended')).toBeUndefined();
  });

  it('returns upcoming sales with limit and priority startsAt ordering', async () => {
    seedSales();

    const result = await service.find('upcoming', '2');

    expect(result.map((sale) => sale.id)).toEqual(['upcoming-soon', 'upcoming-later']);
    expect(result.every((sale) => sale.status === 'UPCOMING')).toBe(true);
  });

  it('returns active sales on date boundaries', async () => {
    repository.create(saleInput({
      id: 'boundary',
      starts_at: '2026-08-09T00:00:00.000Z',
      ends_at: '2026-08-09T00:00:00.000Z',
    }));

    await expect(service.find('active')).resolves.toMatchObject([
      { id: 'boundary', status: 'ACTIVE' },
    ]);
  });

  it('rejects invalid status and invalid limits', async () => {
    await expect(service.find('ended')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.find('active', '0')).rejects.toThrow('limit');
    await expect(service.find('active', '51')).rejects.toThrow('limit');
  });

  function seedSales() {
    repository.create(saleInput({
      id: 'active-low',
      priority: 20,
      starts_at: '2026-08-08T00:00:00.000Z',
      ends_at: '2026-08-10T00:00:00.000Z',
    }));
    repository.create(saleInput({
      id: 'active-high',
      priority: 10,
      starts_at: '2026-08-08T12:00:00.000Z',
      ends_at: '2026-08-10T00:00:00.000Z',
    }));
    repository.create(saleInput({
      id: 'upcoming-later',
      priority: 30,
      starts_at: '2026-08-12T00:00:00.000Z',
      ends_at: '2026-08-15T00:00:00.000Z',
    }));
    repository.create(saleInput({
      id: 'upcoming-soon',
      priority: 20,
      starts_at: '2026-08-11T00:00:00.000Z',
      ends_at: '2026-08-15T00:00:00.000Z',
    }));
    repository.create(saleInput({
      id: 'ended',
      starts_at: '2026-08-01T00:00:00.000Z',
      ends_at: '2026-08-02T00:00:00.000Z',
    }));
  }
});

function saleInput(overrides = {}) {
  return {
    seller_code: 'OLIVE_YOUNG',
    seller_name: 'Olive Young',
    title: '[MOCK] Sale',
    sale_type: 'MOCK_PROMOTION',
    starts_at: '2026-08-08T00:00:00.000Z',
    ends_at: '2026-08-10T00:00:00.000Z',
    is_active: true,
    priority: 10,
    ...overrides,
  };
}
