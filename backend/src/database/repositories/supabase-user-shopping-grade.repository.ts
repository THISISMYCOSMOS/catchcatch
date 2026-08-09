import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { UserShoppingGradeRepository } from './repository.interfaces';
import { throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseUserShoppingGradeRepository implements UserShoppingGradeRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findByUserId(userId: string): Promise<Row<'user_shopping_grades'>[]> {
    const { data, error } = await this.client
      .from('user_shopping_grades')
      .select('*')
      .eq('user_id', userId);
    throwOnSupabaseError('find user shopping grades by user_id', error);
    return data ?? [];
  }

  async replaceForUser(
    userId: string,
    inputs: Insert<'user_shopping_grades'>[],
  ): Promise<Row<'user_shopping_grades'>[]> {
    const { error: deleteError } = await this.client
      .from('user_shopping_grades')
      .delete()
      .eq('user_id', userId);
    throwOnSupabaseError('replace user shopping grades delete', deleteError);

    const rows = uniqueShoppingGrades(inputs).map((input) => ({
      ...input,
      user_id: userId,
    }));
    if (rows.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from('user_shopping_grades')
      .insert(rows)
      .select('*');
    throwOnSupabaseError('replace user shopping grades insert', error);
    return data ?? [];
  }
}

function uniqueShoppingGrades(
  inputs: Insert<'user_shopping_grades'>[],
): Insert<'user_shopping_grades'>[] {
  const seen = new Set<string>();
  return inputs.filter((input) => {
    if (seen.has(input.provider)) {
      return false;
    }
    seen.add(input.provider);
    return true;
  });
}
