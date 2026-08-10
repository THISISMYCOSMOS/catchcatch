export type SupabaseEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
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

export function loadInternalApiToken(
  source: NodeJS.ProcessEnv = process.env,
): string {
  const token = source.INTERNAL_API_TOKEN?.trim();
  if (!token) {
    throw new Error('INTERNAL_API_TOKEN is required');
  }
  return token;
}
