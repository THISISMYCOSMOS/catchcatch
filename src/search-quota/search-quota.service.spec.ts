import {
  InMemoryDatabase,
  InMemorySearchQuotaRepository,
} from '../database/repositories/in-memory.repositories';
import { SearchQuotaService } from './search-quota.service';

describe('SearchQuotaService', () => {
  let database: InMemoryDatabase;
  let service: SearchQuotaService;

  beforeEach(() => {
    database = new InMemoryDatabase();
    service = new SearchQuotaService(new InMemorySearchQuotaRepository(database));
  });

  it('returns a fresh quota for a new user without consuming it', async () => {
    await expect(service.findForUser('user-1')).resolves.toEqual({
      limit: 10,
      used: 0,
      remaining: 10,
      windowStartedAt: null,
      resetsAt: null,
    });
    expect(database.store.userSearchQuotas).toHaveLength(0);
  });

  it('consumes up to 10 searches and rejects the 11th without incrementing', async () => {
    const now = new Date('2026-08-17T14:30:00.000Z');

    const first = await service.consumeForUser('user-1', 'key-1', now);
    expect(first).toMatchObject({ used: 1, remaining: 9 });

    for (let index = 2; index <= 10; index += 1) {
      await service.consumeForUser('user-1', `key-${index}`, now);
    }
    await expect(service.findForUser('user-1', now)).resolves.toMatchObject({
      used: 10,
      remaining: 0,
    });
    await expect(service.consumeForUser('user-1', 'key-11', now))
      .rejects
      .toMatchObject({
        response: expect.objectContaining({
          statusCode: 429,
          code: 'SEARCH_QUOTA_EXCEEDED',
          limit: 10,
          used: 10,
          remaining: 0,
        }),
      });
    expect(database.store.userSearchQuotas[0].used_count).toBe(10);
  });

  it('isolates users', async () => {
    const now = new Date('2026-08-17T14:30:00.000Z');
    for (let index = 1; index <= 10; index += 1) {
      await service.consumeForUser('user-a', `a-${index}`, now);
    }

    await expect(service.findForUser('user-b', now)).resolves.toMatchObject({
      used: 0,
      remaining: 10,
    });
  });

  it('does not reset before 14 days and resets at the exact expiry time', async () => {
    const start = new Date('2026-08-17T14:30:00.000Z');
    await service.consumeForUser('user-1', 'first', start);
    await service.consumeForUser('user-1', 'second', new Date('2026-08-31T14:29:59.999Z'));
    expect(database.store.userSearchQuotas[0]).toMatchObject({ used_count: 2 });

    const reset = await service.consumeForUser('user-1', 'third', new Date('2026-08-31T14:30:00.000Z'));
    expect(reset).toMatchObject({
      used: 1,
      remaining: 9,
      windowStartedAt: '2026-08-31T14:30:00.000Z',
      resetsAt: '2026-09-14T14:30:00.000Z',
    });
  });

  it('charges the same idempotency key only once and different keys separately', async () => {
    const now = new Date('2026-08-17T14:30:00.000Z');

    await service.consumeForUser('user-1', 'same-key', now);
    await service.consumeForUser('user-1', 'same-key', now);
    await expect(service.findForUser('user-1', now)).resolves.toMatchObject({
      used: 1,
      remaining: 9,
    });

    await service.consumeForUser('user-1', 'different-key', now);
    await expect(service.findForUser('user-1', now)).resolves.toMatchObject({
      used: 2,
      remaining: 8,
    });
  });

  it('keeps concurrent consumption capped at 10', async () => {
    const now = new Date('2026-08-17T14:30:00.000Z');
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) => (
        service.consumeForUser('user-1', `concurrent-${index}`, now)
      )),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(10);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(10);
    expect(database.store.userSearchQuotas[0].used_count).toBe(10);
  });

  it('does not consume quota on GET quota', async () => {
    await service.findForUser('user-1');
    await service.findForUser('user-1');

    expect(database.store.userSearchQuotas).toHaveLength(0);
  });
});
