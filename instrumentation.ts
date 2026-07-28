/**
 * Next.js instrumentation entry point — runs once at server boot.
 * See https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 *
 * Side-effect imports validate environment variables early and log
 * warnings for any missing/invalid required vars.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/config/env');
  }
}
