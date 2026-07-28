/**
 * priceSync — Vercel-runnable port of worker/src/priceSync.ts:runPriceSync().
 *
 * Responsibilities (mirrored from the worker version):
 *  1. Fetch fresh prices in one call from worker-realtime's /internal/prices
 *     (WS feed is always on the worker; Vercel never subscribes to Polymarket
 *     directly).
 *  2. Compute price_change_24h from the persisted yes_price_ago_24h anchor.
 *  3. Compute is_trending (volume spike or >10% move) and is_hot (new + vol).
 *  4. Upsert outcome_prices/flags/change_24h back to market_catalog.
 *  5. Rotate the anchor once per ~23h by copying current yes_price into
 *     yes_price_ago_24h for every active market.
 *
 * Safe to run in parallel with worker-batch's priceSync — writes are
 * idempotent and both populate the same columns with the same logic.
 */

import { supabaseAdmin } from '@/lib/supabase/client';

const WORKER_URL = (process.env.WORKER_INTERNAL_URL || process.env.NEXT_PUBLIC_WORKER_URL || 'https://worker.supermission.fun').replace(/\/+$/, '');
const ROTATION_INTERVAL_MS = 23 * 60 * 60 * 1000;
const MAX_MARKETS = 5000; // sanity cap

interface PriceEntry {
  yes: number;
  no: number;
  yesBid: number;
  noBid: number;
  updatedAt: number;
}

interface MarketRow {
  condition_id: string;
  volume: number | null;
  volume_24h: number | null;
  yes_price_ago_24h: number | null;
  created_at: string | null;
}

export interface PriceSyncResult {
  durationMs: number;
  fetchedPrices: number;
  marketsLoaded: number;
  updated: number;
  missingPrice: number;
  rotated: number;
}

export async function runPriceSync(): Promise<PriceSyncResult> {
  const t = Date.now();

  // 1. Pull fresh price snapshot from worker-realtime.
  let prices: Record<string, PriceEntry> = {};
  try {
    const res = await fetch(`${WORKER_URL}/internal/prices`, {
      headers: {
        ...(process.env.INTERNAL_API_SECRET && { 'x-internal-secret': process.env.INTERNAL_API_SECRET }),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`worker returned ${res.status}`);
    }
    prices = await res.json();
  } catch (err: any) {
    throw new Error(`Failed to fetch /internal/prices from worker: ${err?.message || err}`);
  }

  const fetchedPrices = Object.keys(prices).length;
  if (fetchedPrices === 0) {
    return { durationMs: Date.now() - t, fetchedPrices: 0, marketsLoaded: 0, updated: 0, missingPrice: 0, rotated: 0 };
  }

  // 2. Load market rows. Supabase's default row cap is 1000 per request, so
  // paginate via .range() until we hit the MAX_MARKETS cap or run out.
  const PAGE = 1000;
  const marketList: MarketRow[] = [];
  for (let from = 0; from < MAX_MARKETS; from += PAGE) {
    const to = Math.min(from + PAGE - 1, MAX_MARKETS - 1);
    const { data: page, error: pageErr } = await supabaseAdmin
      .from('market_catalog')
      .select('condition_id, volume, volume_24h, yes_price_ago_24h, created_at')
      .eq('is_active', true)
      .order('condition_id')
      .range(from, to);
    if (pageErr) {
      throw new Error(`Supabase market_catalog page ${from}-${to} failed: ${pageErr.message}`);
    }
    const rows = (page ?? []) as MarketRow[];
    marketList.push(...rows);
    if (rows.length < PAGE) break;
  }
  const marketsLoaded = marketList.length;
  if (marketsLoaded === 0) {
    return { durationMs: Date.now() - t, fetchedPrices, marketsLoaded: 0, updated: 0, missingPrice: 0, rotated: 0 };
  }

  // 3. Compute updates. We use .update() (not .upsert()) because the rows
  // already exist and Supabase's upsert validates against the full INSERT
  // schema (NOT NULL columns etc.) — update has no such requirement.
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  interface MarketUpdate {
    condition_id: string;
    outcome_prices: number[];
    price_change_24h: number;
    is_trending: boolean;
    is_hot: boolean;
    updated_at: string;
    last_synced_at: string;
  }
  const updates: MarketUpdate[] = [];
  let missingPrice = 0;

  for (const m of marketList) {
    const p = prices[m.condition_id];
    if (!p) { missingPrice += 1; continue; }

    const yes = p.yes;
    const no = p.no;
    const prevYes = Number(m.yes_price_ago_24h) || 0;
    const priceChange24h = prevYes > 0 ? yes - prevYes : 0;

    const volume = Number(m.volume) || 0;
    const volume24h = Number(m.volume_24h) || 0;
    const avgDailyVol = volume > 0 ? volume / 30 : 0;
    const isVolSpike = volume24h > 0 && avgDailyVol > 0 && volume24h > avgDailyVol * 3;
    const isPriceMover = Math.abs(priceChange24h) > 0.10;
    const isTrending = isVolSpike || isPriceMover;

    const createdAtMs = m.created_at ? new Date(m.created_at).getTime() : 0;
    const isNew = createdAtMs > 0 && nowMs - createdAtMs < 48 * 60 * 60 * 1000;
    const isHot = isNew && volume > 10_000;

    updates.push({
      condition_id: m.condition_id,
      outcome_prices: [yes, no],
      price_change_24h: priceChange24h,
      is_trending: isTrending,
      is_hot: isHot,
      updated_at: nowIso,
      last_synced_at: nowIso,
    });
  }

  // 4. Issue per-row UPDATEs in bounded parallelism. 50 concurrent updates is
  // comfortably under Supabase's connection cap and finishes a few-hundred-row
  // batch in well under a second.
  const CONCURRENCY = 50;
  let updated = 0;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const batch = updates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (u) => {
      const { condition_id, ...payload } = u;
      const { error } = await supabaseAdmin
        .from('market_catalog')
        .update(payload)
        .eq('condition_id', condition_id);
      return !error;
    }));
    updated += results.filter(Boolean).length;
  }

  // 5. Maybe rotate the 24h anchor.
  let rotated = 0;
  const { data: metaRow } = await supabaseAdmin
    .from('price_sync_meta')
    .select('last_rotated_at')
    .eq('id', 1)
    .maybeSingle();

  const lastRotated = metaRow?.last_rotated_at ? new Date(metaRow.last_rotated_at).getTime() : 0;
  if (nowMs - lastRotated >= ROTATION_INTERVAL_MS) {
    // Copy current yes price → yes_price_ago_24h for every market we just
    // updated. Same per-row UPDATE pattern as above (upsert would fail on
    // the NOT NULL INSERT schema even though rows exist).
    for (let i = 0; i < updates.length; i += CONCURRENCY) {
      const batch = updates.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async (u) => {
        const { error } = await supabaseAdmin
          .from('market_catalog')
          .update({ yes_price_ago_24h: u.outcome_prices[0] ?? 0 })
          .eq('condition_id', u.condition_id);
        return !error;
      }));
      rotated += results.filter(Boolean).length;
    }

    // price_sync_meta has only `id` and `last_rotated_at` — both present here,
    // so upsert is safe. The singleton row exists from the migration seed.
    await supabaseAdmin
      .from('price_sync_meta')
      .update({ last_rotated_at: nowIso })
      .eq('id', 1);
  }

  return {
    durationMs: Date.now() - t,
    fetchedPrices,
    marketsLoaded,
    updated,
    missingPrice,
    rotated,
  };
}
