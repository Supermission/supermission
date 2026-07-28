/**
 * Supabase client for Cloudflare services
 * Uses the service role key for admin operations
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

/**
 * Create a Supabase admin client for worker operations
 * Each call creates a fresh client - suitable for stateless workers
 */
export function createSupabaseClient(env: SupabaseEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Helper to safely execute Supabase operations with error handling
 */
export async function withSupabase<T>(
  env: SupabaseEnv,
  operation: (client: SupabaseClient) => Promise<T>
): Promise<T> {
  const client = createSupabaseClient(env);
  return operation(client);
}
