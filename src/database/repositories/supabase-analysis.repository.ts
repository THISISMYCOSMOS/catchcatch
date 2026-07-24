import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row, Update } from '../database.types';
import { AnalysisRepository } from './repository.interfaces';
import { requireSupabaseData, throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseAnalysisRepository implements AnalysisRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async create(input: Insert<'analyses'>): Promise<Row<'analyses'>> {
    const { data, error } = await this.client
      .from('analyses')
      .insert(input)
      .select('*')
      .single();
    throwOnSupabaseError('create analysis', error);
    return requireSupabaseData('create analysis', data);
  }

  async findById(id: string): Promise<Row<'analyses'> | null> {
    const { data, error } = await this.client
      .from('analyses')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    throwOnSupabaseError('find analysis by id', error);
    return data;
  }

  async updateResult(
    id: string,
    input: Pick<
      Update<'analyses'>,
      'status' | 'verdict' | 'allowed_conclusions' | 'result_json' | 'warning_codes'
    >,
  ): Promise<Row<'analyses'>> {
    const { data, error } = await this.client
      .from('analyses')
      .update(input)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    throwOnSupabaseError('update analysis result', error);
    if (!data) {
      throw new Error(`Analysis not found: ${id}`);
    }
    return data;
  }
}
