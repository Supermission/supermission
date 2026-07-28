/**
 * Shared helper for Next.js API routes that need to proxy through the
 * Supermission worker (where server-only secrets live).
 *
 * Parallel to `lib/ucl/worker-fetch.ts` but league-neutral so the PL
 * table/stats routes don't need their own copy. UCL's copy stays for
 * backwards compatibility — safe to migrate later.
 */

const WORKER = (
  process.env.NEXT_PUBLIC_WORKER_URL || 'https://worker.supermission.fun'
).replace(/\/+$/, '');

export async function workerFetch<T = unknown>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${WORKER}${path}`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout?.(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
