import { Inject, Injectable } from '@nestjs/common';
import { CatchCatchSupabaseClient, SUPABASE_CLIENT } from '../supabase.client';
import { Row } from '../database.types';
import {
  AnalysisPersistencePayload,
  AnalysisPersistenceRepository,
} from './repository.interfaces';
import { requireSupabaseData, throwOnSupabaseError } from './supabase-repository.utils';

@Injectable()
export class SupabaseAnalysisPersistenceRepository implements AnalysisPersistenceRepository {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: CatchCatchSupabaseClient,
  ) {}

  async persistAnalysisAtomically(payload: AnalysisPersistencePayload): Promise<Row<'analyses'>> {
    const { data, error } = await this.client
      .rpc('persist_analysis_atomically', { payload });
    throwOnSupabaseError('persist analysis atomically', error);
    return requireSupabaseData('persist analysis atomically', data);
  }
}
