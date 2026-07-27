import { loadSupabaseEnv } from '../config/env';
import { createSupabaseServerClient } from './supabase.client';

describe('Supabase server client', () => {
  it('creates a client when all required environment variables exist', () => {
    const client = createSupabaseServerClient({
      supabaseUrl: 'https://example.supabase.co',
      supabaseServiceRoleKey: 'test-service-role-key',
    });

    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });

  it('throws a clear error when SUPABASE_URL is missing', () => {
    expect(() => loadSupabaseEnv({
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    })).toThrow('SUPABASE_URL is required');
  });

  it('throws a clear error when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    expect(() => loadSupabaseEnv({
      SUPABASE_URL: 'https://example.supabase.co',
    })).toThrow('SUPABASE_SERVICE_ROLE_KEY is required');
  });
});
