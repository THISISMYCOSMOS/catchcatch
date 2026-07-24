import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { SellerOfferRepository } from './repository.interfaces';
import { throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseSellerOfferRepository implements SellerOfferRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findByProductId(productId: string): Promise<Row<'seller_offers'>[]> {
    const { data, error } = await this.client
      .from('seller_offers')
      .select('*')
      .eq('product_id', productId);
    throwOnSupabaseError('find seller offers by product_id', error);
    return data ?? [];
  }

  async createMany(inputs: Insert<'seller_offers'>[]): Promise<Row<'seller_offers'>[]> {
    if (inputs.length === 0) {
      return [];
    }
    assertNoNegativeOfferPrices(inputs);
    const { data, error } = await this.client
      .from('seller_offers')
      .insert(inputs)
      .select('*');
    throwOnSupabaseError('create seller offers', error);
    return data ?? [];
  }
}

function assertNoNegativeOfferPrices(inputs: Insert<'seller_offers'>[]): void {
  const hasNegativePrice = inputs.some((input) => (
    (input.listed_price ?? 0) < 0 ||
    (input.market_effective_price ?? 0) < 0 ||
    (input.user_effective_price ?? 0) < 0
  ));
  if (hasNegativePrice) {
    throw new Error('Seller offer prices cannot be negative');
  }
}
