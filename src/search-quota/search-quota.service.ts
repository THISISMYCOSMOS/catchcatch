import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  SearchQuotaRepository,
  SearchQuotaSnapshot,
} from '../database/repositories/repository.interfaces';
import { SEARCH_QUOTA_REPOSITORY } from '../database/repositories/repository.tokens';
import {
  SEARCH_LIMIT,
  SEARCH_QUOTA_EXCEEDED_CODE,
  SearchQuotaResponse,
} from './search-quota.types';

@Injectable()
export class SearchQuotaService {
  constructor(
    @Inject(SEARCH_QUOTA_REPOSITORY)
    private readonly quotas: SearchQuotaRepository,
  ) {}

  async findForUser(userId: string, now = new Date()): Promise<SearchQuotaResponse> {
    const row = await this.quotas.findByUserId(userId);
    if (!row || new Date(row.window_expires_at).getTime() <= now.getTime()) {
      return {
        limit: SEARCH_LIMIT,
        used: 0,
        remaining: SEARCH_LIMIT,
        windowStartedAt: null,
        resetsAt: null,
      };
    }
    return toResponse({
      limit: row.limit_count,
      used: row.used_count,
      remaining: Math.max(row.limit_count - row.used_count, 0),
      windowStartedAt: row.window_started_at,
      resetsAt: row.window_expires_at,
    });
  }

  async consumeForUser(
    userId: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<SearchQuotaResponse> {
    const result = await this.quotas.consume(userId, idempotencyKey, now);
    if (!result.allowed) {
      throw new HttpException({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: SEARCH_QUOTA_EXCEEDED_CODE,
        message: '14-day search limit exceeded',
        limit: result.limit,
        used: result.used,
        remaining: result.remaining,
        resetsAt: result.resetsAt,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return toResponse(result);
  }
}

function toResponse(snapshot: SearchQuotaSnapshot): SearchQuotaResponse {
  return {
    limit: snapshot.limit,
    used: snapshot.used,
    remaining: snapshot.remaining,
    windowStartedAt: snapshot.windowStartedAt,
    resetsAt: snapshot.resetsAt,
  };
}
