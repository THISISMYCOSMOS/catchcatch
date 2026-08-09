import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { SellerOfferBenefitRepository } from './repository.interfaces';
import { throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseSellerOfferBenefitRepository implements SellerOfferBenefitRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findBySellerOfferIds(sellerOfferIds: string[]): Promise<Row<'seller_offer_benefits'>[]> {
    if (sellerOfferIds.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from('seller_offer_benefits')
      .select('*')
      .in('seller_offer_id', sellerOfferIds);
    throwOnSupabaseError('find seller offer benefits by seller_offer_id', error);
    return data ?? [];
  }

  async createMany(inputs: Insert<'seller_offer_benefits'>[]): Promise<Row<'seller_offer_benefits'>[]> {
    if (inputs.length === 0) {
      return [];
    }
    if (inputs.some((input) => input.discount_amount < 0)) {
      throw new Error('Seller offer benefit discount_amount cannot be negative');
    }

    const uniqueInputs = uniqueBy(inputs, sellerOfferBenefitInputKey);
    const existingRows = await this.findBySellerOfferIds([
      ...new Set(uniqueInputs.map((input) => input.seller_offer_id)),
    ]);
    const existingKeys = new Set(existingRows.map(sellerOfferBenefitRowKey));
    const rowsToInsert = uniqueInputs.filter((input) => (
      !existingKeys.has(sellerOfferBenefitInputKey(input))
    ));

    let insertedRows: Row<'seller_offer_benefits'>[] = [];
    if (rowsToInsert.length > 0) {
      const { data, error } = await this.client
        .from('seller_offer_benefits')
        .insert(rowsToInsert)
        .select('*');
      throwOnSupabaseError('create seller offer benefits', error);
      insertedRows = data ?? [];
    }

    const rowsByKey = new Map<string, Row<'seller_offer_benefits'>>();
    for (const row of [...existingRows, ...insertedRows]) {
      rowsByKey.set(sellerOfferBenefitRowKey(row), row);
    }
    return uniqueInputs
      .map((input) => rowsByKey.get(sellerOfferBenefitInputKey(input)))
      .filter((row): row is Row<'seller_offer_benefits'> => row !== undefined);
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

function sellerOfferBenefitInputKey(input: Insert<'seller_offer_benefits'>): string {
  return [
    input.seller_offer_id,
    input.benefit_type,
    input.provider ?? '',
    input.required_membership_type ?? '',
    input.required_grade ?? '',
    input.required_card_issuer ?? '',
    input.required_card_product_code ?? '',
    input.discount_amount,
    input.exclusive_group ?? '',
  ].join(':');
}

function sellerOfferBenefitRowKey(row: Row<'seller_offer_benefits'>): string {
  return [
    row.seller_offer_id,
    row.benefit_type,
    row.provider ?? '',
    row.required_membership_type ?? '',
    row.required_grade ?? '',
    row.required_card_issuer ?? '',
    row.required_card_product_code ?? '',
    row.discount_amount,
    row.exclusive_group ?? '',
  ].join(':');
}
