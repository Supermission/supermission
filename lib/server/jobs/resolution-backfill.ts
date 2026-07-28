/**
 * Resolution backfill job — Vercel-runnable port of
 * worker/src/resolutionTracker.ts:backfillResolutions().
 *
 * Reads unresolved predictions from Supabase, looks them up against the
 * Polymarket Gamma API, and writes resolutions + scored prediction rows
 * back to Supabase. Pure DB-driven, no in-memory state.
 *
 * Phase 1 migration: this is the first job moved off worker-batch onto
 * Vercel Cron. Worker copy in resolutionTracker.ts will be deleted once
 * this is verified running on Vercel for ≥24h.
 */

import { supabaseAdmin } from '@/lib/supabase/client';

const GAMMA_API = 'https://gamma-api.polymarket.com';

// Mirror worker economics so paper PnL stays comparable to live PnL.
// See worker/src/liveTrader.ts for the source.
const PAPER_FEE_RATE = Number(process.env.PAPER_FEE_RATE ?? '0.10');
const PAPER_SLIPPAGE_RATE = Number(process.env.PAPER_SLIPPAGE_RATE ?? '0.03');

interface GammaMarket {
  id: string;
  question: string;
  closed: boolean;
  outcomes: string;       // JSON-stringified array
  outcomePrices: string;  // JSON-stringified array
  active: boolean;
  resolutionSource?: string;
}

function calculatePositionSize(confidence: number): number {
  if (confidence >= 90) return 200;
  if (confidence >= 80) return 150;
  if (confidence >= 70) return 100;
  return 50;
}

function calculatePnL(
  outcomes: string[],
  favouriteOutcome: string,
  outcomePricesAtSignal: number[],
  resolvedOutcome: string,
  confidence: number,
): { entryPrice: number; exitPrice: number; positionSize: number; pnl: number; roiPct: number } {
  const outcomeIndex = outcomes.indexOf(favouriteOutcome);
  const snapshotPrice = outcomeIndex >= 0 ? outcomePricesAtSignal[outcomeIndex] : 0.5;
  const isCorrect = favouriteOutcome.toLowerCase() === resolvedOutcome.toLowerCase();
  const exitPrice = isCorrect ? 1.0 : 0.0;
  const positionSize = calculatePositionSize(confidence);

  const entryPrice = Math.min(snapshotPrice * (1 + PAPER_SLIPPAGE_RATE), 0.99);
  const capitalAfterFee = positionSize * (1 - PAPER_FEE_RATE);
  const shares = entryPrice > 0 ? capitalAfterFee / entryPrice : 0;
  const pnl = shares * exitPrice - positionSize;
  const roiPct = positionSize > 0 ? (pnl / positionSize) * 100 : 0;

  return { entryPrice, exitPrice, positionSize, pnl, roiPct };
}

async function fetchMarketFromGamma(marketId: string | null, conditionId: string): Promise<GammaMarket | null> {
  if (!marketId) {
    console.warn(`[RESOLUTION-BACKFILL] No market_id for condition ${conditionId} — Gamma conditionId param is unreliable, skipping`);
    return null;
  }
  try {
    const res = await fetch(`${GAMMA_API}/markets/${marketId}`);
    if (!res.ok) {
      console.warn(`[RESOLUTION-BACKFILL] Gamma ${res.status} for market ${marketId}`);
      return null;
    }
    const data = await res.json();
    if (!data || !data.id) return null;
    return data as GammaMarket;
  } catch (err: any) {
    console.error(`[RESOLUTION-BACKFILL] Gamma fetch failed for market ${marketId}:`, err?.message || err);
    return null;
  }
}

function getResolvedOutcome(outcomes: string[], outcomePrices: number[]): string | null {
  if (outcomes.length === 0 || outcomePrices.length === 0) return null;

  let maxIdx = 0;
  let maxPrice = outcomePrices[0];
  for (let i = 1; i < outcomePrices.length; i++) {
    if (outcomePrices[i] > maxPrice) {
      maxPrice = outcomePrices[i];
      maxIdx = i;
    }
  }
  if (maxPrice >= 0.95 && outcomes[maxIdx]) return outcomes[maxIdx];
  return null;
}

async function scorePredictions(conditionId: string, resolvedOutcome: string): Promise<number> {
  const { data: predictions, error } = await supabaseAdmin
    .from('prediction_log')
    .select('id, outcomes, favourite_outcome, ai_confidence, outcome_prices_at_signal')
    .eq('condition_id', conditionId)
    .is('resolved_at', null);

  if (error) {
    console.error(`[RESOLUTION-BACKFILL] Failed to fetch unresolved predictions for ${conditionId}:`, error.message);
    return 0;
  }
  if (!predictions || predictions.length === 0) return 0;

  const now = new Date().toISOString();
  let scored = 0;

  for (const pred of predictions) {
    const isCorrect = pred.favourite_outcome.toLowerCase() === resolvedOutcome.toLowerCase();
    const { entryPrice, exitPrice, positionSize, pnl, roiPct } = calculatePnL(
      pred.outcomes,
      pred.favourite_outcome,
      pred.outcome_prices_at_signal,
      resolvedOutcome,
      pred.ai_confidence,
    );

    const { error: rowErr } = await supabaseAdmin
      .from('prediction_log')
      .update({
        resolved_at: now,
        resolved_outcome: resolvedOutcome,
        is_correct: isCorrect,
        entry_price: entryPrice,
        exit_price: exitPrice,
        position_size: positionSize,
        pnl,
        roi_pct: roiPct,
      })
      .eq('id', pred.id);

    if (!rowErr) scored += 1;
  }

  return scored;
}

export interface ResolutionBackfillResult {
  durationMs: number;
  unresolvedChecked: number;
  resolved: number;
  scored: number;
  skippedNotClosed: number;
  skippedNoOutcome: number;
  skippedFetchFailed: number;
}

export interface AiAccuracyResult {
  durationMs: number;
  closedFound: number;
  alreadyScored: number;
  unscored: number;
  inserted: number;
  skipped: number;
}

/**
 * Writes one row per scored prediction to ai_accuracy_log. Port of
 * worker/src/resolutionTracker.ts:trackResolutions().
 */
export async function runAiAccuracyTracking(): Promise<AiAccuracyResult> {
  const t = Date.now();

  const { data: closedMarkets, error: fetchErr } = await supabaseAdmin
    .from('market_catalog')
    .select('condition_id, market_id, favourite_outcome, ai_confidence, categories')
    .eq('is_closed', true)
    .not('favourite_outcome', 'is', null);

  if (fetchErr) {
    throw new Error(`Failed to fetch closed markets from market_catalog: ${fetchErr.message}`);
  }
  if (!closedMarkets || closedMarkets.length === 0) {
    return { durationMs: Date.now() - t, closedFound: 0, alreadyScored: 0, unscored: 0, inserted: 0, skipped: 0 };
  }

  const conditionIds = closedMarkets.map((m: any) => m.condition_id);
  const alreadyScored = new Set<string>();

  const BATCH_SIZE = 200;
  for (let i = 0; i < conditionIds.length; i += BATCH_SIZE) {
    const batch = conditionIds.slice(i, i + BATCH_SIZE);
    const { data: existing, error: existErr } = await supabaseAdmin
      .from('ai_accuracy_log')
      .select('condition_id')
      .in('condition_id', batch);
    if (existErr) {
      throw new Error(`Failed to check ai_accuracy_log: ${existErr.message}`);
    }
    if (existing) {
      for (const row of existing as Array<{ condition_id: string }>) {
        alreadyScored.add(row.condition_id);
      }
    }
  }

  const unscored = closedMarkets.filter((m: any) => !alreadyScored.has(m.condition_id));

  if (unscored.length === 0) {
    return {
      durationMs: Date.now() - t,
      closedFound: closedMarkets.length,
      alreadyScored: alreadyScored.size,
      unscored: 0,
      inserted: 0,
      skipped: 0,
    };
  }

  let skipped = 0;
  const accuracyRows: Array<Record<string, any>> = [];

  for (const market of unscored as any[]) {
    try {
      const gammaMarket = await fetchMarketFromGamma(market.market_id || null, market.condition_id);
      if (!gammaMarket || !gammaMarket.closed) { skipped += 1; continue; }

      let outcomes: string[];
      let outcomePrices: number[];
      try {
        outcomes = JSON.parse(gammaMarket.outcomes || '[]');
        outcomePrices = JSON.parse(gammaMarket.outcomePrices || '[]').map(Number);
      } catch {
        skipped += 1;
        continue;
      }

      const actualOutcome = getResolvedOutcome(outcomes, outcomePrices);
      if (!actualOutcome) { skipped += 1; continue; }

      const predictedOutcome = market.favourite_outcome as string;
      const wasCorrect = predictedOutcome.toLowerCase() === actualOutcome.toLowerCase();
      const confidence = market.ai_confidence ?? 0;
      const category = Array.isArray(market.categories) && market.categories.length > 0
        ? market.categories[0]
        : null;

      accuracyRows.push({
        condition_id: market.condition_id,
        predicted_outcome: predictedOutcome,
        predicted_confidence: confidence,
        actual_outcome: actualOutcome,
        was_correct: wasCorrect,
        category,
        edge_at_prediction: confidence > 0 ? (confidence / 100) - 0.5 : null,
        resolved_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error(`[AI-ACCURACY] Error scoring ${market.condition_id}:`, err?.message || err);
      skipped += 1;
    }
  }

  let inserted = 0;
  if (accuracyRows.length > 0) {
    const { error: insertErr } = await supabaseAdmin
      .from('ai_accuracy_log')
      .insert(accuracyRows);
    if (insertErr) {
      throw new Error(`ai_accuracy_log insert failed (${accuracyRows.length} rows): ${insertErr.message}`);
    }
    inserted = accuracyRows.length;
  }

  return {
    durationMs: Date.now() - t,
    closedFound: closedMarkets.length,
    alreadyScored: alreadyScored.size,
    unscored: unscored.length,
    inserted,
    skipped,
  };
}

export async function runResolutionBackfill(): Promise<ResolutionBackfillResult> {
  const t = Date.now();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('prediction_log')
    .select('condition_id, market_id')
    .is('resolved_at', null)
    .lt('predicted_at', oneHourAgo)
    .order('predicted_at', { ascending: false })
    .limit(5000);

  if (error) {
    throw new Error(`Failed to query unresolved predictions: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return {
      durationMs: Date.now() - t,
      unresolvedChecked: 0,
      resolved: 0,
      scored: 0,
      skippedNotClosed: 0,
      skippedNoOutcome: 0,
      skippedFetchFailed: 0,
    };
  }

  const marketsByCondition = new Map<string, string>();
  for (const d of data) {
    if (!marketsByCondition.has(d.condition_id)) {
      marketsByCondition.set(d.condition_id, d.market_id);
    }
  }

  let resolved = 0;
  let scored = 0;
  let skippedNotClosed = 0;
  let skippedNoOutcome = 0;
  let skippedFetchFailed = 0;

  for (const [cid, marketId] of marketsByCondition) {
    try {
      const gammaMarket = await fetchMarketFromGamma(marketId, cid);
      if (!gammaMarket) { skippedFetchFailed += 1; continue; }
      if (!gammaMarket.closed) { skippedNotClosed += 1; continue; }

      let outcomes: string[];
      let outcomePrices: number[];
      try {
        outcomes = JSON.parse(gammaMarket.outcomes || '[]');
        outcomePrices = JSON.parse(gammaMarket.outcomePrices || '[]').map(Number);
      } catch {
        continue;
      }

      const resolvedOutcome = getResolvedOutcome(outcomes, outcomePrices);
      if (!resolvedOutcome) { skippedNoOutcome += 1; continue; }

      const { error: resError } = await supabaseAdmin
        .from('market_resolutions')
        .upsert({
          condition_id: cid,
          market_id: marketId,
          question: gammaMarket.question || '',
          outcomes,
          resolved_outcome: resolvedOutcome,
          resolved_at: new Date().toISOString(),
          final_prices: outcomePrices,
          resolution_source: gammaMarket.resolutionSource || 'gamma_api_backfill',
        }, { onConflict: 'condition_id' });

      if (resError) {
        console.error(`[RESOLUTION-BACKFILL] Upsert failed for ${cid}:`, resError.message);
        continue;
      }

      resolved += 1;
      scored += await scorePredictions(cid, resolvedOutcome);
    } catch (err: any) {
      console.error(`[RESOLUTION-BACKFILL] Error processing ${cid}:`, err?.message || err);
    }
  }

  return {
    durationMs: Date.now() - t,
    unresolvedChecked: marketsByCondition.size,
    resolved,
    scored,
    skippedNotClosed,
    skippedNoOutcome,
    skippedFetchFailed,
  };
}
