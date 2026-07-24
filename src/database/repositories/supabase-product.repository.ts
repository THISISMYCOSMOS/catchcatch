import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { ProductRepository } from './repository.interfaces';
import { requireSupabaseData, throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseProductRepository implements ProductRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findById(id: string): Promise<Row<'products'> | null> {
    const { data, error } = await this.client
      .from('products')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    throwOnSupabaseError('find product by id', error);
    return data;
  }

  async findByProductKey(productKey: string): Promise<Row<'products'> | null> {
    const { data, error } = await this.client
      .from('products')
      .select('*')
      .eq('product_key', productKey)
      .maybeSingle();
    throwOnSupabaseError('find product by product_key', error);
    return data;
  }

  async create(input: Insert<'products'>): Promise<Row<'products'>> {
    const { data, error } = await this.client
      .from('products')
      .insert(input)
      .select('*')
      .single();
    throwOnSupabaseError('create product', error);
    return requireSupabaseData('create product', data);
  }
}
