/**
 * Shared DB handle for ORACLE tool executors.
 *
 * supabaseAdmin cast to `any` to preserve the original call patterns
 * (dynamic OR/IN queries, etc.) without plumbing a typed client across
 * every executor. Kept in one place so future typing work can land once.
 */

import { supabaseAdmin } from '@/lib/supabase/client';

export const db = supabaseAdmin as any;
