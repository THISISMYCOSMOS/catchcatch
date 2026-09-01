import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadSupabaseAuthEnv, loadSupabaseEnv, SupabaseAuthEnv, SupabaseEnv } from '../config/env';
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

export function createSupabaseAuthClient(
  env: SupabaseAuthEnv = loadSupabaseAuthEnv(),
): CatchCatchSupabaseClient {
  return createClient<Database>(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
