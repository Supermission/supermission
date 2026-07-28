/**
 * Environment variable validator and typed accessor.
 *
 * Runs Zod validation once at module load. Warn-only — never throws,
 * so a missing var can't brick the boot. The point is observability:
 * you see exactly which var is wrong in the logs instead of debugging
 * a downstream 500.
 *
 * Usage (in new code):
 *   import { env } from '@/lib/config/env';
 *   const url = env.NEXT_PUBLIC_SUPABASE_URL;
 *
 * Existing `process.env.*` call-sites are unchanged.
 */

import { z } from 'zod';

// ------------------------------------------------------------------
// Schemas
// ------------------------------------------------------------------

const hardRequiredClient = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_USDC_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 20-byte hex address'),
});

const hardRequiredServer = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PRIVY_APP_SECRET: z.string().min(1),
});

const prodRequiredServer = z.object({
  CRON_SECRET: z.string().min(1),
  INTERNAL_API_SECRET: z.string().min(1),
  ADMIN_SECRET: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'must be 0x + 64 hex chars'),
  RESEND_API_KEY: z.string().min(1),
  PINATA_JWT: z.string().min(1),
});

// ------------------------------------------------------------------
// Validation (warn-only)
// ------------------------------------------------------------------

function formatIssues(issues: z.ZodIssue[]): string {
  return issues.map((i) => `${i.path.join('.')} (${i.message})`).join(', ');
}

function runValidation(): void {
  const isServer = typeof window === 'undefined';
  const isProd = process.env.NODE_ENV === 'production';

  const client = hardRequiredClient.safeParse(process.env);
  if (!client.success) {
    console.warn(
      `[env] hard-required client vars invalid: ${formatIssues(client.error.issues)}`
    );
  }

  if (isServer) {
    const server = hardRequiredServer.safeParse(process.env);
    if (!server.success) {
      console.warn(
        `[env] hard-required server vars invalid: ${formatIssues(server.error.issues)}`
      );
    }

    if (isProd) {
      const prod = prodRequiredServer.safeParse(process.env);
      if (!prod.success) {
        console.warn(
          `[env] prod-required server vars invalid: ${formatIssues(prod.error.issues)}`
        );
      }
    }
  }
}

runValidation();

// ------------------------------------------------------------------
// Typed accessor
//
// Hard-required vars are typed `string` (non-nullable). If they're
// actually missing the warning above fired and downstream code will
// fail loudly — that's the point. Server-only vars accessed from the
// client will be `undefined` at runtime (Next.js doesn't inline them),
// which matches the type.
// ------------------------------------------------------------------

export const env = {
  // --- hard-required client (inlined by Next.js, available everywhere) ---
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env
    .NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID as string,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL as string,
  NEXT_PUBLIC_USDC_ADDRESS: process.env.NEXT_PUBLIC_USDC_ADDRESS as string,

  // --- hard-required server ---
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,

  // --- prod-required server ---
  CRON_SECRET: process.env.CRON_SECRET,
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
  ADMIN_SECRET: process.env.ADMIN_SECRET,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  PINATA_JWT: process.env.PINATA_JWT,

  // --- runtime context ---
  NODE_ENV: process.env.NODE_ENV,
} as const;
