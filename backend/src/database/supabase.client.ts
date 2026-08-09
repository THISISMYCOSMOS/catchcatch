import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadSupabaseEnv, SupabaseEnv } from '../config/env';
import { Database } from './database.types';

export const SUPABASE_CLIENT = Symbol('SUPABASE_CLIENT');

export type CatchCatchSupabaseClient = SupabaseClient<Database>;

export function createSupabaseServerClient(
  env: SupabaseEnv = loadSupabaseEnv(),
): CatchCatchSupabaseClient {
  return createClient<Database>(
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
