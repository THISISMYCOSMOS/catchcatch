export type SupabaseEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

export type SupabaseAuthEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export function loadSupabaseEnv(
  source: NodeJS.ProcessEnv = process.env,
): SupabaseEnv {
  const supabaseUrl = source.SUPABASE_URL;
  const supabaseServiceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required');
  }
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  }

  return { supabaseUrl, supabaseServiceRoleKey };
}

export function loadSupabaseAuthEnv(
  source: NodeJS.ProcessEnv = process.env,
): SupabaseAuthEnv {
  const supabaseUrl = source.SUPABASE_URL;
  const supabaseAnonKey = source.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required');
  }
  if (!supabaseAnonKey) {
    throw new Error('SUPABASE_ANON_KEY is required');
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function loadInternalApiToken(
  source: NodeJS.ProcessEnv = process.env,
): string {
  const token = source.INTERNAL_API_TOKEN?.trim();
  if (!token) {
    throw new Error('INTERNAL_API_TOKEN is required');
  }
  return token;
}
