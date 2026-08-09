import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Row } from '../database.types';
import { SaleCalendarRepository } from './repository.interfaces';
import { throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseSaleCalendarRepository implements SaleCalendarRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findActive(now: Date): Promise<Row<'sale_calendar'>[]> {
    const isoNow = now.toISOString();
    const { data, error } = await this.client
      .from('sale_calendar')
      .select('*')
      .eq('is_active', true)
      .lte('starts_at', isoNow)
      .gte('ends_at', isoNow)
      .order('priority', { ascending: true })
      .order('starts_at', { ascending: true });
    throwOnSupabaseError('find active sale calendar', error);
    return data ?? [];
  }

  async findUpcoming(now: Date, limit: number): Promise<Row<'sale_calendar'>[]> {
    const { data, error } = await this.client
      .from('sale_calendar')
      .select('*')
      .eq('is_active', true)
      .gt('starts_at', now.toISOString())
      .order('priority', { ascending: true })
      .order('starts_at', { ascending: true })
      .limit(limit);
    throwOnSupabaseError('find upcoming sale calendar', error);
    return data ?? [];
  }

  async findAll(): Promise<Row<'sale_calendar'>[]> {
    const { data, error } = await this.client
      .from('sale_calendar')
      .select('*')
      .order('priority', { ascending: true })
      .order('starts_at', { ascending: true });
    throwOnSupabaseError('find all sale calendar', error);
    return data ?? [];
  }

  async findById(id: string): Promise<Row<'sale_calendar'> | null> {
    const { data, error } = await this.client
      .from('sale_calendar')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    throwOnSupabaseError('find sale calendar by id', error);
    return data;
  }
}
