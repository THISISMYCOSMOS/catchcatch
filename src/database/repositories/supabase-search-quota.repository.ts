import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Row } from '../database.types';
import {
  SearchQuotaConsumeResult,
  SearchQuotaRepository,
} from './repository.interfaces';
import { requireSupabaseData, SupabaseFailure, throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseSearchQuotaRepository implements SearchQuotaRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findByUserId(userId: string): Promise<Row<'user_search_quotas'> | null> {
    const { data, error } = await (this.client as CatchCatchSupabaseClient & {
      rpc: (
        fn: 'get_user_search_quota',
        args: { p_user_id: string },
      ) => {
        maybeSingle: () => Promise<{
          data: Row<'user_search_quotas'> | null;
          error: SupabaseFailure | null;
        }>;
      };
    }).rpc('get_user_search_quota', { p_user_id: userId }).maybeSingle();
    throwOnSupabaseError('find user search quota by user_id', error);
    return data;
  }

  async consume(
    userId: string,
    idempotencyKey: string,
    now?: Date,
  ): Promise<SearchQuotaConsumeResult> {
    const { data, error } = await (this.client as CatchCatchSupabaseClient & {
      rpc: (
        fn: 'consume_user_search_quota',
        args: { p_user_id: string; p_idempotency_key: string; p_now: string },
      ) => Promise<{ data: unknown; error: SupabaseFailure | null }>;
    }).rpc('consume_user_search_quota', {
      p_user_id: userId,
      p_idempotency_key: idempotencyKey,
      p_now: (now ?? new Date()).toISOString(),
    });
    throwOnSupabaseError('consume user search quota', error);
    return parseConsumeResult(requireSupabaseData('consume user search quota', data));
  }
}

function parseConsumeResult(value: unknown): SearchQuotaConsumeResult {
  if (!isRecord(value)) {
    throw new Error('Invalid search quota consume result');
  }
  return {
    allowed: value.allowed === true,
    consumed: value.consumed === true,
    idempotent: value.idempotent === true,
    limit: requireNumber(value.limit, 'limit'),
    used: requireNumber(value.used, 'used'),
    remaining: requireNumber(value.remaining, 'remaining'),
    windowStartedAt: requireNullableString(value.windowStartedAt, 'windowStartedAt'),
    resetsAt: requireNullableString(value.resetsAt, 'resetsAt'),
  };
}

function requireNumber(value: unknown, key: string): number {
  if (typeof value !== 'number') {
    throw new Error(`Invalid search quota consume result: ${key}`);
  }
  return value;
}

function requireNullableString(value: unknown, key: string): string | null {
  if (value === null || typeof value === 'string') {
    return value;
  }
  throw new Error(`Invalid search quota consume result: ${key}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
