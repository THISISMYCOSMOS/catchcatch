import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { PriceHistoryRepository } from './repository.interfaces';
import { throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabasePriceHistoryRepository implements PriceHistoryRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findByProductId(productId: string): Promise<Row<'price_history'>[]> {
    const { data, error } = await this.client
      .from('price_history')
      .select('*')
      .eq('product_id', productId)
      .order('observed_at', { ascending: true });
    throwOnSupabaseError('find price history by product_id', error);
    return data ?? [];
  }

  async createMany(inputs: Insert<'price_history'>[]): Promise<Row<'price_history'>[]> {
    if (inputs.length === 0) {
      return [];
    }
    if (inputs.some((input) => (input.market_effective_price ?? 0) < 0)) {
      throw new Error('Price history market_effective_price cannot be negative');
    }
    const { data, error } = await this.client
      .from('price_history')
      .insert(inputs)
      .select('*');
    throwOnSupabaseError('create price history', error);
    return data ?? [];
  }
}
