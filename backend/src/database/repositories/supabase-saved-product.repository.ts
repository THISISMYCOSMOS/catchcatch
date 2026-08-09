import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { SavedProductRepository } from './repository.interfaces';
import { requireSupabaseData, throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseSavedProductRepository implements SavedProductRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async save(input: Insert<'saved_products'>): Promise<Row<'saved_products'>> {
    const { data, error } = await this.client
      .from('saved_products')
      .upsert(input, { onConflict: 'user_id,product_id' })
      .select('*')
      .single();
    throwOnSupabaseError('save product', error);
    return requireSupabaseData('save product', data);
  }

  async findByUserId(userId: string): Promise<Row<'saved_products'>[]> {
    const { data, error } = await this.client
      .from('saved_products')
      .select('*')
      .eq('user_id', userId);
    throwOnSupabaseError('find saved products by user_id', error);
    return data ?? [];
  }

  async remove(userId: string, productId: string): Promise<void> {
    const { error } = await this.client
      .from('saved_products')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);
    throwOnSupabaseError('remove saved product', error);
  }
}
