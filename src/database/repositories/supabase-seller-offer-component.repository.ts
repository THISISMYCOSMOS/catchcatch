import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { SellerOfferComponentRepository } from './repository.interfaces';
import { throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseSellerOfferComponentRepository implements SellerOfferComponentRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findBySellerOfferIds(sellerOfferIds: string[]): Promise<Row<'seller_offer_components'>[]> {
    if (sellerOfferIds.length === 0) {
      return [];
    }
    const { data, error } = await this.client
      .from('seller_offer_components')
      .select('*')
      .in('seller_offer_id', sellerOfferIds);
    throwOnSupabaseError('find seller offer components by seller_offer_id', error);
    return data ?? [];
  }

  async replaceForSellerOffer(
    sellerOfferId: string,
    inputs: Insert<'seller_offer_components'>[],
  ): Promise<Row<'seller_offer_components'>[]> {
    const { error: deleteError } = await this.client
      .from('seller_offer_components')
      .delete()
      .eq('seller_offer_id', sellerOfferId);
    throwOnSupabaseError('replace seller offer components delete', deleteError);

    if (inputs.length === 0) {
      return [];
    }

    const uniqueInputs = uniqueBy(inputs, sellerOfferComponentInputKey).map(({ id: _id, ...input }) => ({
      ...input,
      seller_offer_id: sellerOfferId,
    }));
    const { data, error } = await this.client
      .from('seller_offer_components')
      .insert(uniqueInputs)
      .select('*');
    throwOnSupabaseError('replace seller offer components insert', error);
    return data ?? [];
  }
}

function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sellerOfferComponentInputKey(input: Insert<'seller_offer_components'>): string {
  return [
    input.component_type,
    input.name ?? '',
    input.capacity_value ?? '',
    input.capacity_unit ?? '',
    input.quantity ?? '',
  ].join(':');
}
