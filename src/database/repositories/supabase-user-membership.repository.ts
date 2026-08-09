import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { UserMembershipRepository } from './repository.interfaces';
import { throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseUserMembershipRepository implements UserMembershipRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findByUserId(userId: string): Promise<Row<'user_memberships'>[]> {
    const { data, error } = await this.client
      .from('user_memberships')
      .select('*')
      .eq('user_id', userId);
    throwOnSupabaseError('find user memberships by user_id', error);
    return data ?? [];
  }

  async replaceForUser(
    userId: string,
    inputs: Insert<'user_memberships'>[],
  ): Promise<Row<'user_memberships'>[]> {
    const { error: deleteError } = await this.client
      .from('user_memberships')
      .delete()
      .eq('user_id', userId);
    throwOnSupabaseError('replace user memberships delete', deleteError);

    const rows = uniqueMemberships(inputs).map((input) => ({
      ...input,
      user_id: userId,
      enabled: input.enabled ?? true,
    }));
    if (rows.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from('user_memberships')
      .insert(rows)
      .select('*');
    throwOnSupabaseError('replace user memberships insert', error);
    return data ?? [];
  }
}

function uniqueMemberships(
  inputs: Insert<'user_memberships'>[],
): Insert<'user_memberships'>[] {
  const seen = new Set<string>();
  return inputs.filter((input) => {
    const key = `${input.provider}:${input.membership_type}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
