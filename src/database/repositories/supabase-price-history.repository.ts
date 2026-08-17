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
    const normalizedInputs = inputs.map((input) => ({
      ...input,
      observation_key: input.observation_key ?? priceHistoryObservationKey(input),
    }));
    const existing = await this.findExistingObservations(normalizedInputs);
    const existingKeys = new Set(existing.map(priceHistoryObservationKey));
    const toInsert = normalizedInputs.filter((input) => !existingKeys.has(priceHistoryObservationKey(input)));
    if (toInsert.length === 0) {
      return normalizedInputs
        .map((input) => existing.find((row) => priceHistoryObservationKey(row) === priceHistoryObservationKey(input)))
        .filter((row): row is Row<'price_history'> => row !== undefined);
    }
    const { data, error } = await this.client
      .from('price_history')
      .insert(toInsert)
      .select('*');
    throwOnSupabaseError('create price history', error);
    const rows = [...existing, ...(data ?? [])];
    return normalizedInputs
      .map((input) => rows.find((row) => priceHistoryObservationKey(row) === priceHistoryObservationKey(input)))
      .filter((row): row is Row<'price_history'> => row !== undefined);
  }

  private async findExistingObservations(inputs: readonly Insert<'price_history'>[]): Promise<Row<'price_history'>[]> {
    const productIds = [...new Set(inputs.map((input) => input.product_id))];
    const { data, error } = await this.client
      .from('price_history')
      .select('*')
      .in('product_id', productIds);
    throwOnSupabaseError('find existing price history observations', error);
    const keys = new Set(inputs.map(priceHistoryObservationKey));
    return (data ?? []).filter((row) => keys.has(priceHistoryObservationKey(row)));
  }
}

function priceHistoryObservationKey(
  input: Pick<
    Insert<'price_history'>,
    'product_id' | 'seller_offer_id' | 'observed_at' | 'market_effective_price' | 'observation_key'
  >,
): string {
  if (input.observation_key) {
    return input.observation_key;
  }
  return [
    input.product_id,
    input.seller_offer_id ?? '',
    input.observed_at,
    input.market_effective_price ?? '',
  ].join(':');
}
