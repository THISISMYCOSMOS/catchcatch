import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Row } from '../database/database.types';
import { SaleCalendarRepository } from '../database/repositories/repository.interfaces';
import { SALE_CALENDAR_REPOSITORY } from '../database/repositories/repository.tokens';

export type SaleCalendarStatus = 'ACTIVE' | 'UPCOMING' | 'ENDED';

export type SaleCalendarResponse = {
  id: string;
  sellerCode: string;
  sellerName: string;
  title: string;
  description: string | null;
  saleType: string;
  startsAt: string;
  endsAt: string;
  bannerImageUrl: string | null;
  landingUrl: string | null;
  status: SaleCalendarStatus;
};

@Injectable()
export class SaleCalendarService {
  constructor(
    @Inject(SALE_CALENDAR_REPOSITORY)
    private readonly saleCalendar: SaleCalendarRepository,
  ) {}

  async find(status?: string, rawLimit?: string): Promise<SaleCalendarResponse[]> {
    const limit = parseLimit(rawLimit);
    const now = new Date();
    if (status === undefined) {
      const [active, upcoming] = await Promise.all([
        this.saleCalendar.findActive(now),
        this.saleCalendar.findUpcoming(now, limit),
      ]);
      return sortSaleRows([...active, ...upcoming]).slice(0, limit).map((row) => toResponse(row, now));
    }

    if (status === 'active') {
      return (await this.saleCalendar.findActive(now)).slice(0, limit).map((row) => toResponse(row, now));
    }
    if (status === 'upcoming') {
      return (await this.saleCalendar.findUpcoming(now, limit)).map((row) => toResponse(row, now));
    }
    throw new BadRequestException('status must be active or upcoming');
  }
}

function parseLimit(rawLimit?: string): number {
  if (rawLimit === undefined || rawLimit === '') {
    return 10;
  }
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new BadRequestException('limit must be an integer between 1 and 50');
  }
  return limit;
}

function toResponse(row: Row<'sale_calendar'>, now: Date): SaleCalendarResponse {
  return {
    id: row.id,
    sellerCode: row.seller_code,
    sellerName: row.seller_name,
    title: row.title,
    description: row.description,
    saleType: row.sale_type,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    bannerImageUrl: row.banner_image_url,
    landingUrl: row.landing_url,
    status: getStatus(row, now),
  };
}

function getStatus(row: Row<'sale_calendar'>, now: Date): SaleCalendarStatus {
  if (new Date(row.starts_at) > now) {
    return 'UPCOMING';
  }
  if (new Date(row.ends_at) < now) {
    return 'ENDED';
  }
  return 'ACTIVE';
}

function sortSaleRows(rows: readonly Row<'sale_calendar'>[]): Row<'sale_calendar'>[] {
  return [...rows].sort((left, right) => (
    left.priority - right.priority ||
    left.starts_at.localeCompare(right.starts_at)
  ));
}
