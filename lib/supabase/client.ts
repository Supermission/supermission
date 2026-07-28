/**
 * Supabase Client Utilities
 * Server-side and client-side Supabase clients
 */
import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

// Supabase configuration
// NOTE: Vercel env var names vary across deployments. We support a few common aliases
// to avoid hard crashes in the browser when a key is misnamed.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_KEY || // common alias
  process.env.SUPABASE_ANON_KEY || // server-side alias (not exposed to browser)
  '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing Supabase environment variable: NEXT_PUBLIC_SUPABASE_URL');
}

/**
 * Client-side Supabase client (uses anon key, respects RLS)
 * Use this in frontend components
 */
function createBrowserClient() {
  if (!supabaseAnonKey) {
    // Avoid crashing the entire app at import time. Call sites that truly need
    // the browser client will get a clear error.
    throw new Error(
      'Supabase browser key is missing. Set NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_KEY) in your deployment environment.'
    );
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

let _supabase: ReturnType<typeof createBrowserClient> | null = null;
export const supabase = new Proxy({} as Record<string, unknown>, {
  get(_target, prop) {
    if (!_supabase) {
      _supabase = createBrowserClient();
    }
    return (_supabase as any)[prop];
  },
}) as unknown as ReturnType<typeof createBrowserClient>;

/**
 * Server-side Supabase client (uses service role key, bypasses RLS)
 * Use this in API routes for admin operations
 *
 * NOTE: This will throw an error if accessed in browser context (where service key is not available)
 */
function createAdminClient() {
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not available. This should only be used server-side in API routes.');
  }
  // Untyped intentionally — database.types.ts is outdated after 45+ migrations.
  // Admin queries use raw types to avoid false type errors on new columns/tables.
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Lazy initialization - only creates admin client when actually accessed
let _supabaseAdmin: ReturnType<typeof createAdminClient> | null = null;

export const supabaseAdmin = new Proxy({} as Record<string, unknown>, {
  get(_target, prop) {
    if (!_supabaseAdmin) {
      _supabaseAdmin = createAdminClient();
    }
    return (_supabaseAdmin as any)[prop];
  }
}) as unknown as ReturnType<typeof createAdminClient>;

/**
 * Create a client for a specific user (for RLS policies)
 */
export function createUserClient(accessToken: string) {
  if (!supabaseAnonKey) {
    throw new Error(
      'Supabase browser key is missing. Set NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_KEY) in your deployment environment.'
    );
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}