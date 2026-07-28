/**
 * Tests for AI performance overview aggregation logic.
 * Tests the logic from app/api/admin/ai/overview/route.ts
 */
import { describe, it, expect } from 'vitest';

// --- Paper Trading Stats ---

function aggregatePaperTrading(statsRows: any[]) {
  const latestStats = statsRows.length > 0 ? statsRows[statsRows.length - 1] : null;

  const history = statsRows.map((r: any) => ({
    date: r.snapshot_date,
    hitRate: Number(r.hit_rate) || 0,
    brierScore: Number(r.brier_score) || 0,
    pnl: Number(r.cumulative_pnl) || 0,
    roi: Number(r.roi_pct) || 0,
    predictions: Number(r.total_predictions) || 0,
  }));

  const totalPredictions = latestStats ? Number(latestStats.total_predictions) || 0 : 0;
  const overallCorrect = latestStats ? Number(latestStats.correct_predictions) || 0 : 0;
  const overallHitRate = totalPredictions > 0 ? overallCorrect / totalPredictions : 0;
  const overallPnl = latestStats ? Number(latestStats.cumulative_pnl) || 0 : 0;

  return { latestStats, history, totalPredictions, overallHitRate, overallPnl };
}

describe('paper trading aggregation', () => {
  it('returns null latestStats when no data', () => {
    const result = aggregatePaperTrading([]);
    expect(result.latestStats).toBeNull();
    expect(result.history).toEqual([]);
    expect(result.totalPredictions).toBe(0);
    expect(result.overallHitRate).toBe(0);
    expect(result.overallPnl).toBe(0);
  });

  it('picks the last row as latestStats (assumes ascending order)', () => {
    const rows = [
      { snapshot_date: '2026-01-01', total_predictions: 10, correct_predictions: 6, hit_rate: 0.6, brier_score: 0.25, cumulative_pnl: 50, roi_pct: 5 },
      { snapshot_date: '2026-01-02', total_predictions: 20, correct_predictions: 14, hit_rate: 0.7, brier_score: 0.2, cumulative_pnl: 120, roi_pct: 12 },
    ];
    const result = aggregatePaperTrading(rows);
    expect(result.latestStats?.snapshot_date).toBe('2026-01-02');
    expect(result.totalPredictions).toBe(20);
    expect(result.overallHitRate).toBe(14 / 20);
    expect(result.overallPnl).toBe(120);
  });

  it('builds history array from all rows', () => {
    const rows = [
      { snapshot_date: '2026-01-01', hit_rate: 0.6, brier_score: 0.3, cumulative_pnl: 10, roi_pct: 1, total_predictions: 5 },
      { snapshot_date: '2026-01-02', hit_rate: 0.7, brier_score: 0.2, cumulative_pnl: 20, roi_pct: 2, total_predictions: 10 },
    ];
    const result = aggregatePaperTrading(rows);
    expect(result.history).toHaveLength(2);
    expect(result.history[0]).toEqual({ date: '2026-01-01', hitRate: 0.6, brierScore: 0.3, pnl: 10, roi: 1, predictions: 5 });
    expect(result.history[1]).toEqual({ date: '2026-01-02', hitRate: 0.7, brierScore: 0.2, pnl: 20, roi: 2, predictions: 10 });
  });

  it('handles string numbers via Number() coercion', () => {
    const rows = [
      { snapshot_date: '2026-01-01', total_predictions: '50', correct_predictions: '30', hit_rate: '0.6', brier_score: '0.25', cumulative_pnl: '100', roi_pct: '10' },
    ];
    const result = aggregatePaperTrading(rows);
    expect(result.totalPredictions).toBe(50);
    expect(result.overallHitRate).toBe(30 / 50);
    expect(result.overallPnl).toBe(100);
  });

  it('handles null/undefined fields gracefully', () => {
    const rows = [
      { snapshot_date: null, total_predictions: null, correct_predictions: null, hit_rate: null, brier_score: null, cumulative_pnl: null, roi_pct: null },
    ];
    const result = aggregatePaperTrading(rows);
    expect(result.totalPredictions).toBe(0);
    expect(result.overallHitRate).toBe(0);
    expect(result.overallPnl).toBe(0);
    expect(result.history[0].hitRate).toBe(0);
  });
});

// --- Accuracy ---

function aggregateAccuracy(accuracyRows: any[]) {
  const total = accuracyRows.length;
  const correct = accuracyRows.filter((r: any) => r.was_correct).length;
  const hitRate = total > 0 ? correct / total : 0;

  // By category
  const categoryMap = new Map<string, { total: number; correct: number }>();
  for (const r of accuracyRows) {
    const cat = r.category || 'unknown';
    if (!categoryMap.has(cat)) categoryMap.set(cat, { total: 0, correct: 0 });
    const entry = categoryMap.get(cat)!;
    entry.total++;
    if (r.was_correct) entry.correct++;
  }
  const byCategory = Array.from(categoryMap.entries()).map(([category, v]) => ({
    category,
    total: v.total,
    correct: v.correct,
    hitRate: v.total > 0 ? v.correct / v.total : 0,
  }));

  // By confidence bucket
  const bucketMap = new Map<string, { total: number; correct: number }>();
  for (const r of accuracyRows) {
    const conf = Number(r.predicted_confidence) || 0;
    let bucket: string;
    if (conf < 0.5) bucket = '0.0-0.5';
    else if (conf < 0.6) bucket = '0.5-0.6';
    else if (conf < 0.7) bucket = '0.6-0.7';
    else if (conf < 0.8) bucket = '0.7-0.8';
    else if (conf < 0.9) bucket = '0.8-0.9';
    else bucket = '0.9-1.0';
    if (!bucketMap.has(bucket)) bucketMap.set(bucket, { total: 0, correct: 0 });
    const entry = bucketMap.get(bucket)!;
    entry.total++;
    if (r.was_correct) entry.correct++;
  }
  const byConfidenceBucket = Array.from(bucketMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, v]) => ({
      bucket,
      total: v.total,
      correct: v.correct,
      hitRate: v.total > 0 ? v.correct / v.total : 0,
    }));

  return { total, correct, hitRate, byCategory, byConfidenceBucket };
}

describe('accuracy aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateAccuracy([]);
    expect(result.total).toBe(0);
    expect(result.correct).toBe(0);
    expect(result.hitRate).toBe(0);
    expect(result.byCategory).toEqual([]);
    expect(result.byConfidenceBucket).toEqual([]);
  });

  it('computes hit rate correctly', () => {
    const rows = [
      { was_correct: true, category: 'politics', predicted_confidence: 0.7 },
      { was_correct: false, category: 'politics', predicted_confidence: 0.6 },
      { was_correct: true, category: 'sports', predicted_confidence: 0.8 },
    ];
    const result = aggregateAccuracy(rows);
    expect(result.total).toBe(3);
    expect(result.correct).toBe(2);
    expect(result.hitRate).toBeCloseTo(2 / 3);
  });

  it('groups by category', () => {
    const rows = [
      { was_correct: true, category: 'politics', predicted_confidence: 0.7 },
      { was_correct: false, category: 'politics', predicted_confidence: 0.6 },
      { was_correct: true, category: 'sports', predicted_confidence: 0.8 },
    ];
    const result = aggregateAccuracy(rows);
    const politics = result.byCategory.find(c => c.category === 'politics');
    const sports = result.byCategory.find(c => c.category === 'sports');
    expect(politics).toEqual({ category: 'politics', total: 2, correct: 1, hitRate: 0.5 });
    expect(sports).toEqual({ category: 'sports', total: 1, correct: 1, hitRate: 1 });
  });

  it('uses "unknown" for null/undefined category', () => {
    const rows = [
      { was_correct: true, category: null, predicted_confidence: 0.5 },
      { was_correct: false, category: undefined, predicted_confidence: 0.5 },
    ];
    const result = aggregateAccuracy(rows);
    expect(result.byCategory).toHaveLength(1);
    expect(result.byCategory[0].category).toBe('unknown');
    expect(result.byCategory[0].total).toBe(2);
  });

  it('buckets confidence correctly', () => {
    const rows = [
      { was_correct: true, category: 'a', predicted_confidence: 0.45 },  // 0.0-0.5
      { was_correct: true, category: 'a', predicted_confidence: 0.55 },  // 0.5-0.6
      { was_correct: false, category: 'a', predicted_confidence: 0.65 }, // 0.6-0.7
      { was_correct: true, category: 'a', predicted_confidence: 0.75 },  // 0.7-0.8
      { was_correct: false, category: 'a', predicted_confidence: 0.85 }, // 0.8-0.9
      { was_correct: true, category: 'a', predicted_confidence: 0.95 },  // 0.9-1.0
    ];
    const result = aggregateAccuracy(rows);
    expect(result.byConfidenceBucket).toHaveLength(6);
    expect(result.byConfidenceBucket[0]).toEqual({ bucket: '0.0-0.5', total: 1, correct: 1, hitRate: 1 });
    expect(result.byConfidenceBucket[5]).toEqual({ bucket: '0.9-1.0', total: 1, correct: 1, hitRate: 1 });
  });

  it('confidence buckets are sorted alphabetically', () => {
    const rows = [
      { was_correct: true, category: 'a', predicted_confidence: 0.95 },
      { was_correct: true, category: 'a', predicted_confidence: 0.45 },
    ];
    const result = aggregateAccuracy(rows);
    expect(result.byConfidenceBucket[0].bucket).toBe('0.0-0.5');
    expect(result.byConfidenceBucket[1].bucket).toBe('0.9-1.0');
  });

  it('boundary: confidence exactly 0.5 goes to 0.5-0.6 bucket', () => {
    const rows = [
      { was_correct: true, category: 'a', predicted_confidence: 0.5 },
    ];
    const result = aggregateAccuracy(rows);
    expect(result.byConfidenceBucket[0].bucket).toBe('0.5-0.6');
  });

  it('boundary: confidence exactly 0.9 goes to 0.9-1.0 bucket', () => {
    const rows = [
      { was_correct: true, category: 'a', predicted_confidence: 0.9 },
    ];
    const result = aggregateAccuracy(rows);
    expect(result.byConfidenceBucket[0].bucket).toBe('0.9-1.0');
  });

  it('null confidence falls into 0.0-0.5 bucket', () => {
    const rows = [
      { was_correct: false, category: 'a', predicted_confidence: null },
    ];
    const result = aggregateAccuracy(rows);
    expect(result.byConfidenceBucket[0].bucket).toBe('0.0-0.5');
  });
});

// --- Experiments ---

function aggregateExperiments(experimentRows: any[], defaultsData: any) {
  const active = experimentRows.filter((r: any) => r.status === 'active' || r.status === 'running');
  const completed = experimentRows.filter((r: any) => r.winner != null);
  const currentDefaults = defaultsData?.params || null;
  return { active, completed, currentDefaults };
}

describe('experiment aggregation', () => {
  it('separates active from completed', () => {
    const experiments = [
      { id: '1', status: 'active', winner: null },
      { id: '2', status: 'running', winner: null },
      { id: '3', status: 'completed', winner: 'A' },
      { id: '4', status: 'completed', winner: 'B' },
      { id: '5', status: 'completed', winner: null }, // completed but no winner
    ];
    const result = aggregateExperiments(experiments, null);
    expect(result.active).toHaveLength(2);
    expect(result.completed).toHaveLength(2); // only those with winner != null
  });

  it('an experiment can be both active AND completed (has a winner but status is active)', () => {
    const experiments = [
      { id: '1', status: 'active', winner: 'A' },
    ];
    const result = aggregateExperiments(experiments, null);
    expect(result.active).toHaveLength(1);
    expect(result.completed).toHaveLength(1);
  });

  it('returns null defaults when no data', () => {
    const result = aggregateExperiments([], null);
    expect(result.currentDefaults).toBeNull();
  });

  it('extracts params from defaults', () => {
    const defaults = { params: { relevanceThreshold: 0.5, confidenceGate: 0.6 } };
    const result = aggregateExperiments([], defaults);
    expect(result.currentDefaults).toEqual({ relevanceThreshold: 0.5, confidenceGate: 0.6 });
  });

  it('handles empty experiments array', () => {
    const result = aggregateExperiments([], { params: {} });
    expect(result.active).toEqual([]);
    expect(result.completed).toEqual([]);
  });
});

// --- Live Trades ---

function aggregateLiveTrades(liveTradeRows: any[]) {
  const totalTrades = liveTradeRows.length;
  const totalPnl = liveTradeRows.reduce((s: number, r: any) => s + (Number(r.pnl) || 0), 0);
  const correct = liveTradeRows.filter((r: any) => r.is_correct).length;
  const resolved = liveTradeRows.filter((r: any) => r.is_correct !== null).length;
  const winRate = resolved > 0 ? correct / resolved : 0;

  // By coin
  const coinMap = new Map<string, { trades: number; pnl: number; correct: number; resolved: number }>();
  for (const r of liveTradeRows) {
    const coin = r.coin || 'unknown';
    if (!coinMap.has(coin)) coinMap.set(coin, { trades: 0, pnl: 0, correct: 0, resolved: 0 });
    const entry = coinMap.get(coin)!;
    entry.trades++;
    entry.pnl += Number(r.pnl) || 0;
    if (r.is_correct !== null) {
      entry.resolved++;
      if (r.is_correct) entry.correct++;
    }
  }
  const byCoin = Array.from(coinMap.entries()).map(([coin, v]) => ({
    coin,
    trades: v.trades,
    pnl: Math.round(v.pnl * 100) / 100,
    winRate: v.resolved > 0 ? v.correct / v.resolved : 0,
  }));

  // By strategy
  const strategyMap = new Map<string, { trades: number; pnl: number }>();
  for (const r of liveTradeRows) {
    const strategy = r.strategy || 'unknown';
    if (!strategyMap.has(strategy)) strategyMap.set(strategy, { trades: 0, pnl: 0 });
    const entry = strategyMap.get(strategy)!;
    entry.trades++;
    entry.pnl += Number(r.pnl) || 0;
  }
  const byStrategy = Array.from(strategyMap.entries()).map(([strategy, v]) => ({
    strategy,
    trades: v.trades,
    pnl: Math.round(v.pnl * 100) / 100,
  }));

  return { totalTrades, totalPnl: Math.round(totalPnl * 100) / 100, winRate, byCoin, byStrategy };
}

describe('live trades aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateLiveTrades([]);
    expect(result.totalTrades).toBe(0);
    expect(result.totalPnl).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.byCoin).toEqual([]);
    expect(result.byStrategy).toEqual([]);
  });

  it('computes total P&L correctly', () => {
    const trades = [
      { coin: 'BTC', pnl: 10, is_correct: true, strategy: 'edge' },
      { coin: 'BTC', pnl: -5, is_correct: false, strategy: 'edge' },
      { coin: 'ETH', pnl: 3, is_correct: true, strategy: 'momentum' },
    ];
    const result = aggregateLiveTrades(trades);
    expect(result.totalTrades).toBe(3);
    expect(result.totalPnl).toBe(8);
  });

  it('win rate only considers resolved trades (is_correct !== null)', () => {
    const trades = [
      { coin: 'BTC', pnl: 10, is_correct: true, strategy: 'edge' },
      { coin: 'BTC', pnl: -5, is_correct: false, strategy: 'edge' },
      { coin: 'BTC', pnl: null, is_correct: null, strategy: 'edge' }, // unresolved
    ];
    const result = aggregateLiveTrades(trades);
    expect(result.winRate).toBe(0.5); // 1 correct out of 2 resolved
  });

  it('groups by coin correctly', () => {
    const trades = [
      { coin: 'BTC', pnl: 10, is_correct: true, strategy: 'a' },
      { coin: 'BTC', pnl: -5, is_correct: false, strategy: 'a' },
      { coin: 'ETH', pnl: 3, is_correct: true, strategy: 'a' },
    ];
    const result = aggregateLiveTrades(trades);
    const btc = result.byCoin.find(c => c.coin === 'BTC');
    const eth = result.byCoin.find(c => c.coin === 'ETH');
    expect(btc).toEqual({ coin: 'BTC', trades: 2, pnl: 5, winRate: 0.5 });
    expect(eth).toEqual({ coin: 'ETH', trades: 1, pnl: 3, winRate: 1 });
  });

  it('groups by strategy correctly', () => {
    const trades = [
      { coin: 'BTC', pnl: 10, is_correct: true, strategy: 'edge' },
      { coin: 'BTC', pnl: -5, is_correct: false, strategy: 'momentum' },
    ];
    const result = aggregateLiveTrades(trades);
    const edge = result.byStrategy.find(s => s.strategy === 'edge');
    const momentum = result.byStrategy.find(s => s.strategy === 'momentum');
    expect(edge).toEqual({ strategy: 'edge', trades: 1, pnl: 10 });
    expect(momentum).toEqual({ strategy: 'momentum', trades: 1, pnl: -5 });
  });

  it('uses "unknown" for null coin or strategy', () => {
    const trades = [
      { coin: null, pnl: 5, is_correct: true, strategy: null },
    ];
    const result = aggregateLiveTrades(trades);
    expect(result.byCoin[0].coin).toBe('unknown');
    expect(result.byStrategy[0].strategy).toBe('unknown');
  });

  it('rounds P&L to 2 decimal places', () => {
    const trades = [
      { coin: 'BTC', pnl: 1.005, is_correct: true, strategy: 'a' },
      { coin: 'BTC', pnl: 2.005, is_correct: true, strategy: 'a' },
    ];
    const result = aggregateLiveTrades(trades);
    expect(result.totalPnl).toBe(3.01);
  });

  it('handles string pnl values via Number() coercion', () => {
    const trades = [
      { coin: 'BTC', pnl: '10.5', is_correct: true, strategy: 'a' },
    ];
    const result = aggregateLiveTrades(trades);
    expect(result.totalPnl).toBe(10.5);
  });
});
