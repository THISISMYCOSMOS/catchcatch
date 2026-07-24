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
