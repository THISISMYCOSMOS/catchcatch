import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { PriceAlertRepository } from './repository.interfaces';
import { requireSupabaseData, throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabasePriceAlertRepository implements PriceAlertRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async create(input: Insert<'price_alerts'>): Promise<Row<'price_alerts'>> {
    assertValidTargetPrice(input.target_price ?? null);
    const { data, error } = await this.client
      .from('price_alerts')
      .insert(input)
      .select('*')
      .single();
    throwOnSupabaseError('create price alert', error);
    return requireSupabaseData('create price alert', data);
  }

  async findByUserId(userId: string): Promise<Row<'price_alerts'>[]> {
    const { data, error } = await this.client
      .from('price_alerts')
      .select('*')
      .eq('user_id', userId);
    throwOnSupabaseError('find price alerts by user_id', error);
    return data ?? [];
  }

  async updateEnabled(id: string, enabled: boolean): Promise<Row<'price_alerts'>> {
    const { data, error } = await this.client
      .from('price_alerts')
      .update({ enabled })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    throwOnSupabaseError('update price alert enabled', error);
    if (!data) {
      throw new Error(`Price alert not found: ${id}`);
    }
    return data;
  }
}

function assertValidTargetPrice(value: number | null): void {
  if (value !== null && value < 0) {
    throw new Error('Price alert target_price cannot be negative');
  }
}
