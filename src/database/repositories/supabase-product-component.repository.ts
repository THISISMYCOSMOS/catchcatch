import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { ProductComponentRepository } from './repository.interfaces';
import { throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseProductComponentRepository implements ProductComponentRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findByProductId(productId: string): Promise<Row<'product_components'>[]> {
    const { data, error } = await this.client
      .from('product_components')
      .select('*')
      .eq('product_id', productId);
    throwOnSupabaseError('find product components by product_id', error);
    return data ?? [];
  }

  async createMany(inputs: Insert<'product_components'>[]): Promise<Row<'product_components'>[]> {
    if (inputs.length === 0) {
      return [];
    }
    const { data, error } = await this.client
      .from('product_components')
      .insert(inputs)
      .select('*');
    throwOnSupabaseError('create product components', error);
    return data ?? [];
  }
}
