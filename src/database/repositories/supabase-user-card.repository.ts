import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { UserCardRepository } from './repository.interfaces';
import { throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseUserCardRepository implements UserCardRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findByUserId(userId: string): Promise<Row<'user_cards'>[]> {
    const { data, error } = await this.client
      .from('user_cards')
      .select('*')
      .eq('user_id', userId);
    throwOnSupabaseError('find user cards by user_id', error);
    return data ?? [];
  }

  async replaceForUser(
    userId: string,
    inputs: Insert<'user_cards'>[],
  ): Promise<Row<'user_cards'>[]> {
    const { error: deleteError } = await this.client
      .from('user_cards')
      .delete()
      .eq('user_id', userId);
    throwOnSupabaseError('replace user cards delete', deleteError);

    const rows = uniqueCards(inputs).map((input) => ({
      ...input,
      user_id: userId,
    }));
    if (rows.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from('user_cards')
      .insert(rows)
      .select('*');
    throwOnSupabaseError('replace user cards insert', error);
    return data ?? [];
  }
}

function uniqueCards(inputs: Insert<'user_cards'>[]): Insert<'user_cards'>[] {
  const seen = new Set<string>();
  return inputs.filter((input) => {
    const key = `${input.issuer}:${input.card_product_code}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
