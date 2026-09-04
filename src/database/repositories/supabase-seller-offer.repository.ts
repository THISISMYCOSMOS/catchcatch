import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row, Update } from '../database.types';
import { SellerOfferRepository } from './repository.interfaces';
import { requireSupabaseData, throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseSellerOfferRepository implements SellerOfferRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async findByProductId(productId: string): Promise<Row<'seller_offers'>[]> {
    const { data, error } = await this.client
      .from('seller_offers')
      .select('*')
      .eq('product_id', productId)
      .eq('is_active', true);
    throwOnSupabaseError('find seller offers by product_id', error);
    return data ?? [];
  }

  async findAllByProductId(productId: string): Promise<Row<'seller_offers'>[]> {
    const { data, error } = await this.client
      .from('seller_offers')
      .select('*')
      .eq('product_id', productId);
    throwOnSupabaseError('find all seller offers by product_id', error);
    return data ?? [];
  }

  async createMany(inputs: Insert<'seller_offers'>[]): Promise<Row<'seller_offers'>[]> {
    if (inputs.length === 0) {
      return [];
    }
    assertNoNegativeOfferPrices(inputs);
    const { data, error } = await this.client
      .from('seller_offers')
      .insert(inputs)
      .select('*');
    throwOnSupabaseError('create seller offers', error);
    return data ?? [];
  }

  async upsertMany(inputs: Insert<'seller_offers'>[]): Promise<Row<'seller_offers'>[]> {
    if (inputs.length === 0) {
      return [];
    }
    assertNoNegativeOfferPrices(inputs);

    const existing = await this.findExistingOffers(inputs);
    const existingByKey = new Map(existing.map((row) => [sellerOfferInputKey(row), row]));
    const rowsByKey = new Map<string, Row<'seller_offers'>>();
    const toCreate: Insert<'seller_offers'>[] = [];

    for (const input of inputs) {
      const key = sellerOfferInputKey(input);
      const existingRow = existingByKey.get(key);
      if (!existingRow) {
        toCreate.push(input);
        continue;
      }
      const updated = await this.updateExisting(existingRow.id, input);
      rowsByKey.set(key, updated);
    }

    if (toCreate.length > 0) {
      const insertRows = toCreate.map(({ id: _id, ...input }) => input);
      const { data, error } = await this.client
        .from('seller_offers')
        .upsert(insertRows, { onConflict: 'product_id,seller_name,seller_url' })
        .select('*');
      const createdRows = error?.code === '42P10'
        ? await this.insertWithoutConflictTarget(insertRows)
        : (() => {
          throwOnSupabaseError('upsert seller offers', error);
          return data ?? [];
        })();
      for (const row of createdRows) {
        rowsByKey.set(sellerOfferInputKey(row), row);
      }
    }

    return inputs
      .map((input) => rowsByKey.get(sellerOfferInputKey(input)))
      .filter((row): row is Row<'seller_offers'> => row !== undefined);
  }

  async deactivateExcept(productId: string, activeOfferIds: string[]): Promise<void> {
    const all = await this.findAllByProductId(productId);
    const activeIds = new Set(activeOfferIds);
    const idsToDeactivate = all
      .filter((row) => !activeIds.has(row.id))
      .map((row) => row.id);
    if (idsToDeactivate.length === 0) {
      return;
    }
    const { error } = await this.client
      .from('seller_offers')
      .update({ is_active: false })
      .in('id', idsToDeactivate);
    throwOnSupabaseError('deactivate stale seller offers', error);
  }

  private async findExistingOffers(inputs: readonly Insert<'seller_offers'>[]): Promise<Row<'seller_offers'>[]> {
    const productIds = Array.from(new Set(inputs.map((input) => input.product_id)));
    const { data, error } = await this.client
      .from('seller_offers')
      .select('*')
      .in('product_id', productIds);
    throwOnSupabaseError('find existing seller offers', error);
    const keys = new Set(inputs.map(sellerOfferInputKey));
    return (data ?? []).filter((row) => keys.has(sellerOfferInputKey(row)));
  }

  private async updateExisting(
    id: string,
    input: Insert<'seller_offers'>,
  ): Promise<Row<'seller_offers'>> {
    const update: Update<'seller_offers'> = {
      listed_price: input.listed_price ?? null,
      listed_sale_price: input.listed_sale_price ?? null,
      market_effective_price: input.market_effective_price ?? null,
      user_effective_price: input.user_effective_price ?? null,
      shipping_fee: input.shipping_fee ?? null,
      public_discount_amount: input.public_discount_amount ?? null,
      automatic_discount_amount: input.automatic_discount_amount ?? null,
      reward_value: input.reward_value ?? null,
      official_seller_status: input.official_seller_status ?? null,
      return_policy_status: input.return_policy_status ?? null,
      delivery_days: input.delivery_days ?? null,
      comparison_status: input.comparison_status ?? null,
      app_benefit_advertised: input.app_benefit_advertised ?? false,
      is_active: input.is_active ?? true,
      ...(input.purchase_url === undefined ? {} : { purchase_url: input.purchase_url }),
      observed_at: input.observed_at ?? null,
    };
    const { data, error } = await this.client
      .from('seller_offers')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    throwOnSupabaseError('update seller offer', error);
    return requireSupabaseData('update seller offer', data);
  }

  private async insertWithoutConflictTarget(
    inputs: Omit<Insert<'seller_offers'>, 'id'>[],
  ): Promise<Row<'seller_offers'>[]> {
    const { data, error } = await this.client
      .from('seller_offers')
      .insert(inputs)
      .select('*');
    throwOnSupabaseError('insert seller offers without conflict target', error);
    return data ?? [];
  }
}

function sellerOfferInputKey(input: Pick<Row<'seller_offers'>, 'product_id' | 'seller_name' | 'seller_url'>): string {
  return `${input.product_id}:${input.seller_name.trim().toLowerCase()}:${input.seller_url.trim().replace(/\/+$/, '').toLowerCase()}`;
}

function assertNoNegativeOfferPrices(inputs: Insert<'seller_offers'>[]): void {
  const hasNegativePrice = inputs.some((input) => (
    (input.listed_price ?? 0) < 0 ||
    (input.listed_sale_price ?? 0) < 0 ||
    (input.market_effective_price ?? 0) < 0 ||
    (input.user_effective_price ?? 0) < 0 ||
    (input.shipping_fee ?? 0) < 0 ||
    (input.public_discount_amount ?? 0) < 0 ||
    (input.automatic_discount_amount ?? 0) < 0 ||
    (input.reward_value ?? 0) < 0
  ));
  if (hasNegativePrice) {
    throw new Error('Seller offer prices cannot be negative');
  }
}
