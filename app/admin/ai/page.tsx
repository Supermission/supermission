'use client';

import { useEffect, useState } from 'react';

interface HistoryEntry {
  date: string;
  hitRate: number;
  brierScore: number;
  pnl: number;
  roi: number;
  predictions: number;
}

interface CategoryEntry {
  category: string;
  total: number;
  correct: number;
  hitRate: number;
}

interface BucketEntry {
  bucket: string;
  total: number;
  correct: number;
  hitRate: number;
}

interface AccuracyRecord {
  condition_id: string;
  predicted_outcome: string;
  predicted_confidence: number;
  actual_outcome: string | null;
  was_correct: boolean | null;
  category: string | null;
  edge_at_prediction: number | null;
  created_at: string;
}

interface CoinEntry {
  coin: string;
  trades: number;
  pnl: number;
  winRate: number;
}

interface StrategyEntry {
  strategy: string;
  trades: number;
  pnl: number;
}

interface LiveTrade {
  condition_id: string;
  outcome: string;
  direction: string;
  coin: string;
  amount: number;
  buy_price: number;
  strategy: string;
  confidence: number;
  status: string;
  pnl: number | null;
  is_correct: boolean | null;
  created_at: string;
}

interface Experiment {
  id: string;
  name: string;
  status: string;
  group_a_params: any;
  group_b_params: any;
  winner: string | null;
  group_a_stats: any;
  group_b_stats: any;
  created_at: string;
}

interface AIData {
  paperTrading: {
    latestStats: any;
    history: HistoryEntry[];
    totalPredictions: number;
    overallHitRate: number;
    overallPnl: number;
  };
  accuracy: {
    total: number;
    correct: number;
    hitRate: number;
    byCategory: CategoryEntry[];
    byConfidenceBucket: BucketEntry[];
    recentAccuracy: AccuracyRecord[];
  };
  experiments: {
    active: Experiment[];
    completed: Experiment[];
    currentDefaults: any;
  };
  liveTrades: {
    totalTrades: number;
    totalPnl: number;
    winRate: number;
    byCoin: CoinEntry[];
    byStrategy: StrategyEntry[];
    recentTrades: LiveTrade[];
  };
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                           */
/* ------------------------------------------------------------------ */

function CardSkeleton({ rows = 0 }: { rows?: number }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="h-3 bg-gray-100 rounded w-24 mb-3" />
      <div className="h-7 bg-gray-50 rounded w-20" />
      {rows > 0 && (
        <div className="mt-4 space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-5 bg-gray-50 rounded" />
          ))}
        </div>
      )}
    </div>
  );
}

function TableSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="h-3 bg-gray-100 rounded w-32 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: cols }).map((_, j) => (
              <div key={j} className="h-4 bg-gray-50 rounded flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview Cards                                                     */
/* ------------------------------------------------------------------ */

function OverviewCards({ data, loading }: { data: AIData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'Total Predictions',
      value: data?.paperTrading.totalPredictions?.toLocaleString() ?? '0',
    },
    {
      label: 'Hit Rate',
      value: `${((data?.paperTrading.overallHitRate ?? 0) * 100).toFixed(1)}%`,
    },
    {
      label: 'Brier Score',
      value: data?.paperTrading.latestStats?.brier_score != null
        ? Number(data.paperTrading.latestStats.brier_score).toFixed(3)
        : '--',
    },
    {
      label: 'Cumulative P&L',
      value: `$${(data?.paperTrading.overallPnl ?? 0).toFixed(2)}`,
      color: (data?.paperTrading.overallPnl ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500',
    },
    {
      label: 'Live Trades',
      value: data?.liveTrades.totalTrades?.toLocaleString() ?? '0',
    },
    {
      label: 'Live Win Rate',
      value: `${((data?.liveTrades.winRate ?? 0) * 100).toFixed(1)}%`,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
        >
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {c.label}
          </p>
          <p className={`text-2xl font-bold mt-1 ${c.color ?? 'text-[#1a1a1a]'}`}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Paper Trading History Chart                                        */
/* ------------------------------------------------------------------ */

function PaperTradingChart({ data, loading }: { data: HistoryEntry[]; loading: boolean }) {
  if (loading) return <CardSkeleton rows={6} />;

  const maxRate = Math.max(...data.map((d) => d.hitRate), 0.01);

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Paper Trading Hit Rate
      </p>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">
          No history data
        </div>
      ) : (
        <div className="flex items-end gap-[3px] h-40">
          {data.slice(-30).map((d) => {
            const pct = (d.hitRate / maxRate) * 100;
            return (
              <div
                key={d.date}
                className="flex-1 rounded-t bg-blue-400 hover:bg-blue-500 transition-colors cursor-default"
                style={{ height: `${pct}%`, minWidth: 4 }}
                title={`${d.date}: ${(d.hitRate * 100).toFixed(1)}% (${d.predictions} predictions)`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal Bar Section                                             */
/* ------------------------------------------------------------------ */

function HorizontalBars({
  title,
  items,
  loading,
}: {
  title: string;
  items: Array<{ label: string; value: number; count: number }>;
  loading: boolean;
}) {
  if (loading) return <CardSkeleton rows={5} />;

  const maxVal = Math.max(...items.map((i) => i.value), 0.01);

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {title}
      </p>
      {items.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">
          No data
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const pct = (item.value / maxVal) * 100;
            return (
              <div key={item.label}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-600 font-mono truncate max-w-[200px]" title={item.label}>
                    {item.label}
                  </span>
                  <span className="text-gray-400 font-mono tabular-nums ml-2">
                    {(item.value * 100).toFixed(1)}% ({item.count})
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full">
                  <div
                    className="h-full rounded-full bg-blue-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live Trades by Coin Table                                          */
/* ------------------------------------------------------------------ */

function CoinTable({ data, loading }: { data: CoinEntry[]; loading: boolean }) {
  if (loading) return <TableSkeleton cols={4} />;

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Live Trades by Coin
      </p>
      {data.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-[13px] text-gray-300">
          No live trades
        </div>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="pb-2">Coin</th>
              <th className="pb-2 text-right">Trades</th>
              <th className="pb-2 text-right">P&L</th>
              <th className="pb-2 text-right">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {data
              .sort((a, b) => b.trades - a.trades)
              .map((row) => (
                <tr key={row.coin} className="border-b border-gray-50">
                  <td className="py-1.5 font-mono text-gray-700">{row.coin}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-gray-500">
                    {row.trades}
                  </td>
                  <td
                    className={`py-1.5 text-right font-mono tabular-nums ${
                      row.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    ${row.pnl.toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-gray-500">
                    {(row.winRate * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live Trades by Strategy Table                                      */
/* ------------------------------------------------------------------ */

function StrategyTable({ data, loading }: { data: StrategyEntry[]; loading: boolean }) {
  if (loading) return <TableSkeleton cols={3} />;

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Live Trades by Strategy
      </p>
      {data.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-[13px] text-gray-300">
          No live trades
        </div>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="pb-2">Strategy</th>
              <th className="pb-2 text-right">Trades</th>
              <th className="pb-2 text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            {data
              .sort((a, b) => b.trades - a.trades)
              .map((row) => (
                <tr key={row.strategy} className="border-b border-gray-50">
                  <td className="py-1.5 font-mono text-gray-700">{row.strategy}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-gray-500">
                    {row.trades}
                  </td>
                  <td
                    className={`py-1.5 text-right font-mono tabular-nums ${
                      row.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    ${row.pnl.toFixed(2)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Experiments Section                                                */
/* ------------------------------------------------------------------ */

function ExperimentsSection({
  data,
  loading,
}: {
  data: AIData['experiments'] | null;
  loading: boolean;
}) {
  if (loading) return <TableSkeleton cols={4} rows={3} />;

  return (
    <div className="space-y-4">
      {/* Active Experiments */}
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Active Experiments
        </p>
        {(!data?.active || data.active.length === 0) ? (
          <div className="h-16 flex items-center justify-center text-[13px] text-gray-300">
            No active experiments
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="pb-2">Name</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.active.map((exp) => (
                <tr key={exp.id} className="border-b border-gray-50">
                  <td className="py-1.5 font-mono text-gray-700">{exp.name}</td>
                  <td className="py-1.5">
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-600">
                      {exp.status}
                    </span>
                  </td>
                  <td className="py-1.5 text-gray-400 font-mono tabular-nums">
                    {new Date(exp.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Completed Experiments */}
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Completed Experiments
        </p>
        {(!data?.completed || data.completed.length === 0) ? (
          <div className="h-16 flex items-center justify-center text-[13px] text-gray-300">
            No completed experiments
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="pb-2">Name</th>
                <th className="pb-2">Winner</th>
                <th className="pb-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.completed.map((exp) => (
                <tr key={exp.id} className="border-b border-gray-50">
                  <td className="py-1.5 font-mono text-gray-700">{exp.name}</td>
                  <td className="py-1.5">
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-50 text-blue-600">
                      {exp.winner}
                    </span>
                  </td>
                  <td className="py-1.5 text-gray-400 font-mono tabular-nums">
                    {new Date(exp.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Current Defaults */}
      {data?.currentDefaults && (
        <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Current Defaults
          </p>
          <pre className="text-[11px] font-mono text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(data.currentDefaults, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recent Accuracy Table                                              */
/* ------------------------------------------------------------------ */

function RecentAccuracyTable({
  data,
  loading,
}: {
  data: AccuracyRecord[];
  loading: boolean;
}) {
  if (loading) return <TableSkeleton cols={6} rows={8} />;

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-x-auto">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Recent Accuracy Records
      </p>
      {data.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-[13px] text-gray-300">
          No accuracy records
        </div>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="pb-2">Predicted</th>
              <th className="pb-2 text-right">Confidence</th>
              <th className="pb-2">Actual</th>
              <th className="pb-2 text-center">Correct</th>
              <th className="pb-2">Category</th>
              <th className="pb-2 text-right">Date</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={`${row.condition_id}-${i}`} className="border-b border-gray-50">
                <td className="py-1.5 font-mono text-gray-700 truncate max-w-[120px]" title={row.predicted_outcome}>
                  {row.predicted_outcome}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums text-gray-500">
                  {(Number(row.predicted_confidence) * 100).toFixed(0)}%
                </td>
                <td className="py-1.5 font-mono text-gray-500 truncate max-w-[120px]" title={row.actual_outcome ?? '--'}>
                  {row.actual_outcome ?? '--'}
                </td>
                <td className="py-1.5 text-center">
                  {row.was_correct === null ? (
                    <span className="text-gray-300">--</span>
                  ) : row.was_correct ? (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-600">
                      Yes
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-50 text-red-500">
                      No
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-gray-400 font-mono">{row.category ?? '--'}</td>
                <td className="py-1.5 text-right text-gray-400 font-mono tabular-nums">
                  {row.created_at ? new Date(row.created_at).toLocaleDateString() : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminAIPage() {
  const [data, setData] = useState<AIData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/ai/overview')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setData(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-bold text-[#1a1a1a]">AI Performance</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          Prediction accuracy, paper trading metrics, live trade results, and experiment tracking
        </p>
      </div>

      <OverviewCards data={data} loading={loading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <PaperTradingChart data={data?.paperTrading.history ?? []} loading={loading} />
        </div>
        <div>
          <HorizontalBars
            title="Accuracy by Category"
            items={(data?.accuracy.byCategory ?? []).map((c) => ({
              label: c.category,
              value: c.hitRate,
              count: c.total,
            }))}
            loading={loading}
          />
        </div>
        <div>
          <HorizontalBars
            title="Accuracy by Confidence"
            items={(data?.accuracy.byConfidenceBucket ?? []).map((b) => ({
              label: b.bucket,
              value: b.hitRate,
              count: b.total,
            }))}
            loading={loading}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CoinTable data={data?.liveTrades.byCoin ?? []} loading={loading} />
        <StrategyTable data={data?.liveTrades.byStrategy ?? []} loading={loading} />
      </div>

      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">Experiments</h2>
        <ExperimentsSection data={data?.experiments ?? null} loading={loading} />
      </div>

      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">Recent Accuracy</h2>
        <RecentAccuracyTable data={data?.accuracy.recentAccuracy ?? []} loading={loading} />
      </div>
    </div>
  );
}
