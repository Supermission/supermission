/**
 * paperTradingStats — Vercel-runnable port of worker/src/paperTradingStats.ts:rebuildDailyStats().
 *
 * Rebuilds cumulative stats from prediction_log each day:
 *  - Hit rate, Brier score, calibration
 *  - Paper trading P&L, ROI, max drawdown
 *  - Breakdowns by signal type, confidence bucket, category, market type, coin, timeframe
 *  - Daily deltas, streak tracking, risk metrics (Sharpe, Sortino, profit factor)
 */

import { supabaseAdmin } from '@/lib/supabase/client';

// ── Helpers ──

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// ── Confidence buckets ──

const CONFIDENCE_BUCKETS = [
  { label: '50-60', min: 50, max: 60 },
  { label: '60-70', min: 60, max: 70 },
  { label: '70-80', min: 70, max: 80 },
  { label: '80-90', min: 80, max: 90 },
  { label: '90-100', min: 90, max: 100 },
];

function getConfidenceBucket(confidence: number): string {
  for (const b of CONFIDENCE_BUCKETS) {
    if (confidence >= b.min && confidence < b.max) return b.label;
  }
  if (confidence >= 100) return '90-100';
  return '50-60';
}

// ── Brier score ──

function brierScore(confidence: number, isCorrect: boolean): number {
  const predicted = confidence / 100;
  const actual = isCorrect ? 1 : 0;
  return (predicted - actual) ** 2;
}

// ── Classification helpers ──

const KNOWN_COINS = new Set(['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'MATIC', 'AVAX', 'LINK', 'ADA', 'DOT']);
const KNOWN_TIMEFRAMES = new Set(['5M', '15M', '30M', '1H', '4H', '1D']);
const SPORTS_KEYWORDS = new Set(['sports', 'nba', 'nfl', 'mlb', 'nhl', 'mls', 'ipl', 'cricket', 'tennis', 'baseball', 'basketball', 'football', 'esports', 'dota 2', 'valorant', 'counter strike 2', 'league of legends', 'games', 'march madness', 'ncaa']);

function getMarketType(categories: string[] | null): string {
  if (!categories) return 'News & Geopolitics';
  const lower = categories.map(c => c.toLowerCase());
  if (lower.includes('crypto') || lower.includes('crypto prices')) return 'Crypto';
  if (lower.some(c => SPORTS_KEYWORDS.has(c))) return 'Sports';
  return 'News & Geopolitics';
}

function getCoin(categories: string[] | null): string | null {
  if (!categories) return null;
  return categories.find(c => KNOWN_COINS.has(c.toUpperCase()))?.toUpperCase() || null;
}

function getTimeframe(categories: string[] | null): string | null {
  if (!categories) return null;
  return categories.find(c => KNOWN_TIMEFRAMES.has(c.toUpperCase()))?.toUpperCase() || null;
}

// ── Breakdown accumulator ──

interface BreakdownAccum {
  count: number;
  correct: number;
  pnl: number;
  invested: number;
}

interface BreakdownEntry {
  count: number;
  correct: number;
  pnl: number;
  invested: number;
  hit_rate: number;
  roi_pct: number;
}

function newAccum(): BreakdownAccum {
  return { count: 0, correct: 0, pnl: 0, invested: 0 };
}

function accum(a: BreakdownAccum, p: ResolvedPrediction): void {
  a.count++;
  if (p.is_correct) a.correct++;
  a.pnl += p.pnl || 0;
  a.invested += p.position_size || 0;
}

function formatBreakdown(map: Record<string, BreakdownAccum>): Record<string, BreakdownEntry> {
  const result: Record<string, BreakdownEntry> = {};
  for (const [key, val] of Object.entries(map)) {
    result[key] = {
      count: val.count,
      correct: val.correct,
      pnl: round2(val.pnl),
      invested: round2(val.invested),
      hit_rate: val.count > 0 ? round4(val.correct / val.count) : 0,
      roi_pct: val.invested > 0 ? round2((val.pnl / val.invested) * 100) : 0,
    };
  }
  return result;
}

// ── Main rebuild function ──

interface ResolvedPrediction {
  id: string;
  condition_id: string;
  ai_confidence: number;
  is_correct: boolean;
  signal_types: string[];
  pnl: number;
  position_size: number;
  roi_pct: number;
  predicted_at: string;
  resolved_at: string;
  categories: string[] | null;
}

export interface PaperTradingStatsResult {
  durationMs: number;
  totalResolved: number;
  correctPredictions: number;
  hitRate: number;
  cumulativePnl: number;
  roiPct: number;
  dailyPnl: number;
}

interface RebuildStats {
  totalResolved: number;
  correctPredictions: number;
  hitRate: number;
  cumulativePnl: number;
  roiPct: number;
  dailyPnl: number;
}

const EMPTY_STATS: RebuildStats = {
  totalResolved: 0,
  correctPredictions: 0,
  hitRate: 0,
  cumulativePnl: 0,
  roiPct: 0,
  dailyPnl: 0,
};

export async function rebuildDailyStats(): Promise<RebuildStats> {
  const t = Date.now();

  // Fetch all resolved predictions
  const allPredictions: ResolvedPrediction[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('prediction_log')
      .select('id, condition_id, ai_confidence, is_correct, signal_types, pnl, position_size, roi_pct, predicted_at, resolved_at, categories')
      .not('resolved_at', 'is', null)
      .not('is_correct', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1)
      .order('predicted_at', { ascending: true });

    if (error) {
      console.error('[PAPER-TRADING] Failed to fetch predictions at offset', offset, ':', error.message);
      break;
    }
    if (!data) break;
    allPredictions.push(...(data as ResolvedPrediction[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Also count total and unresolved predictions
  const { count: totalPredictions } = await supabaseAdmin
    .from('prediction_log')
    .select('id', { count: 'exact', head: true });

  if (allPredictions.length === 0) {
    console.log('[PAPER-TRADING] No resolved predictions to aggregate');
    return EMPTY_STATS;
  }

  const totalResolved = allPredictions.length;
  const correctPredictions = allPredictions.filter(p => p.is_correct).length;
  const hitRate = totalResolved > 0 ? correctPredictions / totalResolved : 0;

  // Brier score (average)
  const totalBrier = allPredictions.reduce((sum, p) => sum + brierScore(p.ai_confidence, p.is_correct), 0);
  const avgBrier = totalResolved > 0 ? totalBrier / totalResolved : 0;

  // Cumulative P&L
  const cumulativePnl = allPredictions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const cumulativeInvested = allPredictions.reduce((sum, p) => sum + (p.position_size || 0), 0);
  const roiPct = cumulativeInvested > 0 ? (cumulativePnl / cumulativeInvested) * 100 : 0;

  // Max drawdown — replay P&L series chronologically
  let runningPnl = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const p of allPredictions) {
    runningPnl += p.pnl || 0;
    if (runningPnl > peak) peak = runningPnl;
    const drawdown = peak > 0 ? (peak - runningPnl) / peak : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // ── Breakdowns (single pass) ──

  const bySignalType: Record<string, BreakdownAccum> = {};
  const byConfidence: Record<string, BreakdownAccum & { totalBrier: number }> = {};
  const byCategory: Record<string, BreakdownAccum> = {};
  const byMarketType: Record<string, BreakdownAccum> = {};
  const byCoin: Record<string, BreakdownAccum> = {};
  const byTimeframe: Record<string, BreakdownAccum> = {};

  // Streak tracking
  let currentStreakCount = 0;
  let currentStreakType: 'win' | 'loss' = 'win';
  let longestWin = 0;
  let longestLoss = 0;
  let runType: boolean | null = null;
  let runStreak = 0;

  for (const p of allPredictions) {
    // By signal type
    const types = p.signal_types || ['sentiment'];
    for (const st of types) {
      if (!bySignalType[st]) bySignalType[st] = newAccum();
      accum(bySignalType[st], p);
    }

    // By confidence bucket
    const bucket = getConfidenceBucket(p.ai_confidence);
    if (!byConfidence[bucket]) byConfidence[bucket] = { ...newAccum(), totalBrier: 0 };
    accum(byConfidence[bucket], p);
    byConfidence[bucket].totalBrier += brierScore(p.ai_confidence, p.is_correct);

    // By category
    const cats = p.categories || ['uncategorized'];
    for (const cat of cats) {
      if (!byCategory[cat]) byCategory[cat] = newAccum();
      accum(byCategory[cat], p);
    }

    // By market type
    const mt = getMarketType(p.categories);
    if (!byMarketType[mt]) byMarketType[mt] = newAccum();
    accum(byMarketType[mt], p);

    // By coin
    const coin = getCoin(p.categories);
    if (coin) {
      if (!byCoin[coin]) byCoin[coin] = newAccum();
      accum(byCoin[coin], p);
    }

    // By timeframe
    const tf = getTimeframe(p.categories);
    if (tf) {
      if (!byTimeframe[tf]) byTimeframe[tf] = newAccum();
      accum(byTimeframe[tf], p);
    }

    // Streak tracking
    if (runType === null || p.is_correct !== runType) {
      if (runType === true && runStreak > longestWin) longestWin = runStreak;
      if (runType === false && runStreak > longestLoss) longestLoss = runStreak;
      runType = p.is_correct;
      runStreak = 1;
    } else {
      runStreak++;
    }
  }

  // Finalize last streak
  if (runType === true && runStreak > longestWin) longestWin = runStreak;
  if (runType === false && runStreak > longestLoss) longestLoss = runStreak;
  currentStreakCount = runStreak;
  currentStreakType = runType ? 'win' : 'loss';

  const streakData = {
    current_streak: currentStreakCount,
    streak_type: currentStreakType,
    longest_win: longestWin,
    longest_loss: longestLoss,
  };

  // ── Risk metrics ──

  const pnls = allPredictions.map(p => p.pnl || 0);
  const wins = pnls.filter(x => x > 0);
  const losses = pnls.filter(x => x < 0);
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  const grossWins = wins.reduce((a, b) => a + b, 0);
  const grossLosses = Math.abs(losses.reduce((a, b) => a + b, 0));

  // Daily returns for Sharpe/Sortino
  const dailyReturns = new Map<string, number>();
  for (const p of allPredictions) {
    const day = p.resolved_at.split('T')[0];
    dailyReturns.set(day, (dailyReturns.get(day) || 0) + (p.pnl || 0));
  }
  const returns = Array.from(dailyReturns.values());
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 0;

  const downsideReturns = returns.filter(r => r < 0);
  const downsideDev = returns.length > 1
    ? Math.sqrt(downsideReturns.reduce((sum, r) => sum + r ** 2, 0) / (returns.length - 1))
    : 0;
  const sortinoRatio = downsideDev > 0 ? (meanReturn / downsideDev) * Math.sqrt(252) : 0;

  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? Infinity : 0);

  const riskMetrics = {
    sharpe_ratio: round4(sharpeRatio),
    sortino_ratio: round4(sortinoRatio),
    profit_factor: round2(profitFactor === Infinity ? 999 : profitFactor),
    avg_win: round2(avgWin),
    avg_loss: round2(avgLoss),
    win_loss_ratio: avgLoss > 0 ? round4(avgWin / avgLoss) : 0,
    total_wins: wins.length,
    total_losses: losses.length,
  };

  // ── Format breakdowns ──

  const bySignalTypeFormatted = formatBreakdown(bySignalType);
  const byCategoryFormatted = formatBreakdown(byCategory);
  const byMarketTypeFormatted = formatBreakdown(byMarketType);
  const byCoinFormatted = formatBreakdown(byCoin);
  const byTimeframeFormatted = formatBreakdown(byTimeframe);

  // Confidence bucket breakdown (includes totalBrier for calibration)
  const byConfidenceFormatted: Record<string, BreakdownEntry> = {};
  for (const [key, val] of Object.entries(byConfidence)) {
    byConfidenceFormatted[key] = {
      count: val.count,
      correct: val.correct,
      pnl: round2(val.pnl),
      invested: round2(val.invested),
      hit_rate: val.count > 0 ? round4(val.correct / val.count) : 0,
      roi_pct: val.invested > 0 ? round2((val.pnl / val.invested) * 100) : 0,
    };
  }

  // Calibration data
  const calibrationData: Record<string, { expected: number; actual: number; count: number }> = {};
  for (const [bucket, val] of Object.entries(byConfidence)) {
    const bucketDef = CONFIDENCE_BUCKETS.find(b => b.label === bucket);
    const expectedMidpoint = bucketDef ? (bucketDef.min + bucketDef.max) / 2 / 100 : 0.5;
    calibrationData[bucket] = {
      expected: expectedMidpoint,
      actual: val.count > 0 ? val.correct / val.count : 0,
      count: val.count,
    };
  }

  // ── Daily deltas ──

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const { data: prevSnapshot } = await supabaseAdmin
    .from('paper_trading_stats')
    .select('cumulative_pnl, cumulative_invested, total_resolved, correct_predictions')
    .eq('snapshot_date', yesterdayStr)
    .single();

  const dailyPnl = cumulativePnl - (prevSnapshot?.cumulative_pnl || 0);
  const dailyInvested = cumulativeInvested - (prevSnapshot?.cumulative_invested || 0);
  const dailyResolved = totalResolved - (prevSnapshot?.total_resolved || 0);
  const dailyCorrect = correctPredictions - (prevSnapshot?.correct_predictions || 0);

  // ── Upsert daily snapshot ──

  const { error } = await supabaseAdmin
    .from('paper_trading_stats')
    .upsert({
      snapshot_date: today,
      total_predictions: totalPredictions || 0,
      total_resolved: totalResolved,
      correct_predictions: correctPredictions,
      hit_rate: round4(hitRate),
      brier_score: round4(avgBrier),
      cumulative_pnl: round2(cumulativePnl),
      cumulative_invested: round2(cumulativeInvested),
      roi_pct: round2(roiPct),
      max_drawdown_pct: round4(maxDrawdown),
      by_signal_type: bySignalTypeFormatted,
      by_confidence_bucket: byConfidenceFormatted,
      by_category: byCategoryFormatted,
      calibration_data: calibrationData,
      by_market_type: byMarketTypeFormatted,
      by_coin: byCoinFormatted,
      by_timeframe: byTimeframeFormatted,
      daily_pnl: round2(dailyPnl),
      daily_invested: round2(dailyInvested),
      daily_resolved: dailyResolved,
      daily_correct: dailyCorrect,
      streak_data: streakData,
      risk_metrics: riskMetrics,
    }, { onConflict: 'snapshot_date' });

  if (error) {
    console.error('[PAPER-TRADING] Failed to upsert daily stats:', error.message);
  } else {
    const elapsed = ((Date.now() - t) / 1000).toFixed(1);
    console.log(`[PAPER-TRADING] Daily stats rebuilt in ${elapsed}s — ${totalResolved} resolved, hit_rate=${(hitRate * 100).toFixed(1)}%, P&L=$${cumulativePnl.toFixed(2)}, ROI=${roiPct.toFixed(1)}%, daily_pnl=$${dailyPnl.toFixed(2)}`);
  }

  return {
    totalResolved,
    correctPredictions,
    hitRate: round4(hitRate),
    cumulativePnl: round2(cumulativePnl),
    roiPct: round2(roiPct),
    dailyPnl: round2(dailyPnl),
  };
}

export async function runPaperTradingStats(): Promise<PaperTradingStatsResult> {
  const t = Date.now();
  const stats = await rebuildDailyStats();
  return {
    durationMs: Date.now() - t,
    ...stats,
  };
}
