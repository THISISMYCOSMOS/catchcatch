import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Insert, Row } from '../database.types';
import { AnalysisOfferRepository } from './repository.interfaces';
import { throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseAnalysisOfferRepository implements AnalysisOfferRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async createMany(inputs: Insert<'analysis_offers'>[]): Promise<Row<'analysis_offers'>[]> {
    if (inputs.length === 0) {
      return [];
    }

    const uniqueInputs = uniqueBy(inputs, analysisOfferKey);
    const analysisIds = [...new Set(uniqueInputs.map((input) => input.analysis_id))];
    const existingRows = await this.findByAnalysisIds(analysisIds);
    const existingKeys = new Set(existingRows.map(analysisOfferRowKey));
    const rowsToInsert = uniqueInputs.filter((input) => !existingKeys.has(analysisOfferKey(input)));

    let insertedRows: Row<'analysis_offers'>[] = [];
    if (rowsToInsert.length > 0) {
      const { data, error } = await this.client
        .from('analysis_offers')
        .insert(rowsToInsert)
        .select('*');
      throwOnSupabaseError('create analysis offer snapshots', error);
      insertedRows = data ?? [];
    }

    const rowsByKey = new Map<string, Row<'analysis_offers'>>();
    for (const row of [...existingRows, ...insertedRows]) {
      rowsByKey.set(analysisOfferRowKey(row), row);
    }

    return uniqueInputs
      .map((input) => rowsByKey.get(analysisOfferKey(input)))
      .filter((row): row is Row<'analysis_offers'> => row !== undefined);
  }

  async findByAnalysisId(analysisId: string): Promise<Row<'analysis_offers'>[]> {
    const { data, error } = await this.client
      .from('analysis_offers')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('created_at', { ascending: true });
    throwOnSupabaseError('find analysis offer snapshots by analysis_id', error);
    return data ?? [];
  }

  private async findByAnalysisIds(analysisIds: string[]): Promise<Row<'analysis_offers'>[]> {
    const { data, error } = await this.client
      .from('analysis_offers')
      .select('*')
      .in('analysis_id', analysisIds);
    throwOnSupabaseError('find existing analysis offer snapshots', error);
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

function analysisOfferKey(input: Insert<'analysis_offers'>): string {
  return `${input.analysis_id}:${input.seller_identifier}`;
}

function analysisOfferRowKey(row: Row<'analysis_offers'>): string {
  return `${row.analysis_id}:${row.seller_identifier}`;
}
