import { Inject, Injectable } from '@nestjs/common';
import { validateSelectedCriteria } from '../../domain/calculations';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { UserPreferenceRepository } from './repository.interfaces';
import { requireSupabaseData, throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseUserPreferenceRepository implements UserPreferenceRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findByUserId(userId: string): Promise<Row<'user_preferences'> | null> {
    const { data, error } = await this.client
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    throwOnSupabaseError('find user preference by user_id', error);
    return data;
  }

  async upsert(input: Insert<'user_preferences'>): Promise<Row<'user_preferences'>> {
    validateSelectedCriteria(input.selected_criteria);
    const { data, error } = await this.client
      .from('user_preferences')
      .upsert(input, { onConflict: 'user_id' })
      .select('*')
      .single();
    throwOnSupabaseError('upsert user preference', error);
    return requireSupabaseData('upsert user preference', data);
  }
}
