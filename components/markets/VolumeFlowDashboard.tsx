'use client';

import { useMemo, useState } from 'react';
import { useLiveVolume, VolumeMarket } from '@/lib/hooks/use-live-volume';
import BuilderStatsCard from './BuilderStatsCard';

// ── Helpers ────────────────────────────────────────────────────────

type SortKey = 'volume24h' | 'openInterest' | 'volumeChange' | 'liquidity';

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatChange(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

interface CategoryTile {
  name: string;
  totalVolume: number;
  avgChange: number;
  count: number;
}

// ── Category Heatmap ───────────────────────────────────────────────

function CategoryHeatmap({ markets }: { markets: VolumeMarket[] }) {
  const categories = useMemo<CategoryTile[]>(() => {
    const map = new Map<string, { vol: number; changes: number[]; count: number }>();

    for (const m of markets) {
      const cat = m.category;
      const entry = map.get(cat) || { vol: 0, changes: [], count: 0 };
      entry.vol += m.volume24h;
      entry.changes.push(m.volumeChange);
      entry.count += 1;
      map.set(cat, entry);
    }

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        totalVolume: data.vol,
        avgChange:
          data.changes.length > 0
            ? data.changes.reduce((a, b) => a + b, 0) / data.changes.length
            : 0,
        count: data.count,
      }))
      .sort((a, b) => b.totalVolume - a.totalVolume);
  }, [markets]);

  if (categories.length === 0) return null;

  const maxVol = Math.max(...categories.map((c) => c.totalVolume), 1);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
      {categories.map((cat) => {
        // Size the tile based on relative volume (min height 60px)
        const relSize = Math.max(cat.totalVolume / maxVol, 0.3);
        const isPositive = cat.avgChange >= 0;

        return (
          <div
            key={cat.name}
            className={`rounded-lg border p-3 transition-colors ${
              isPositive
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-red-500/30 bg-red-500/5'
            }`}
            style={{ minHeight: `${Math.round(60 + relSize * 40)}px` }}
          >
            <p className="text-xs font-medium text-[#3a3a3a] truncate">
              {cat.name}
            </p>
            <p className="text-sm font-mono text-[#3a3a3a] mt-1">
              {formatUsd(cat.totalVolume)}
            </p>
            <p
              className={`text-xs font-mono mt-0.5 ${
                isPositive ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {formatChange(cat.avgChange)}
            </p>
            <p className="text-[10px] text-[#9ca3af] mt-0.5">
              {cat.count} market{cat.count !== 1 ? 's' : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Sortable Table ─────────────────────────────────────────────────

function TopMoversTable({ markets }: { markets: VolumeMarket[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('volume24h');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...markets];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortAsc ? av - bv : bv - av;
    });
    return copy;
  }, [markets, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function SortHeader({
    label,
    field,
  }: {
    label: string;
    field: SortKey;
  }) {
    const active = sortKey === field;
    return (
      <th
        className="px-3 py-2 text-right cursor-pointer select-none hover:text-[#3a3a3a] transition-colors"
        onClick={() => handleSort(field)}
      >
        <span className={active ? 'text-[#3a3a3a]' : ''}>
          {label}
          {active ? (sortAsc ? ' \u2191' : ' \u2193') : ''}
        </span>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[#6b7280] border-b border-[#e5e7eb]">
            <th className="px-3 py-2 text-left">Market</th>
            <SortHeader label="Volume 24h" field="volume24h" />
            <SortHeader label="OI" field="openInterest" />
            <SortHeader label="Change %" field="volumeChange" />
            <SortHeader label="Liquidity" field="liquidity" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr
              key={m.conditionId}
              className="border-b border-[#e5e7eb]/50 hover:bg-[#f7f7f7] transition-colors"
            >
              <td className="px-3 py-2.5 text-left">
                <p className="text-[#3a3a3a] truncate max-w-[300px]">
                  {m.question}
                </p>
                <p className="text-[10px] text-[#9ca3af] mt-0.5">
                  {m.category}
                </p>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-[#3a3a3a]">
                {formatUsd(m.volume24h)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-[#3a3a3a]">
                {m.openInterest > 0 ? formatUsd(m.openInterest) : '\u2014'}
              </td>
              <td
                className={`px-3 py-2.5 text-right font-mono ${
                  m.volumeChange >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {formatChange(m.volumeChange)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-[#3a3a3a]">
                {formatUsd(m.liquidity)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-6 w-36 rounded bg-[#f0f0f0]" />
        <div className="h-4 w-24 rounded bg-[#f0f0f0]" />
      </div>

      {/* Heatmap skeleton */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[12px] border border-[#e5e7eb] bg-[#f8fafc] p-3"
            style={{ minHeight: '70px' }}
          >
            <div className="h-3 w-16 rounded bg-[#e5e7eb] mb-2" />
            <div className="h-4 w-20 rounded bg-[#e5e7eb]" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-3 py-2"
          >
            <div className="h-4 flex-1 rounded bg-[#f0f0f0]" />
            <div className="h-4 w-16 rounded bg-[#f0f0f0]" />
            <div className="h-4 w-16 rounded bg-[#f0f0f0]" />
            <div className="h-4 w-14 rounded bg-[#f0f0f0]" />
            <div className="h-4 w-16 rounded bg-[#f0f0f0]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────

export default function VolumeFlowDashboard() {
  const { topMovers, loading, error, refresh } = useLiveVolume();

  if (loading && topMovers.length === 0) {
    return (
      <div className="rounded-[12px] border border-[#e5e7eb] bg-white p-6">
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-[#e5e7eb] bg-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-[#3a3a3a]">Volume Flow</h2>
          {/* Pulsing auto-refresh indicator */}
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[10px] text-[#9ca3af]">
              Live
            </span>
          </div>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-[#6b7280] hover:text-[#3a3a3a] transition-colors px-2 py-1 rounded-[8px] border border-[#e5e7eb] hover:border-[#d1d5db]"
        >
          Refresh
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Category Heatmap */}
      {topMovers.length > 0 && (
        <div>
          <h3 className="text-xs text-[#6b7280] mb-3">
            Category Volume Heatmap
          </h3>
          <CategoryHeatmap markets={topMovers} />
        </div>
      )}

      {/* Top Movers Table */}
      {topMovers.length > 0 && (
        <div>
          <h3 className="text-xs text-[#6b7280] mb-3">
            Top Movers
          </h3>
          <TopMoversTable markets={topMovers} />
        </div>
      )}

      {/* Builder Stats */}
      <div>
        <h3 className="text-xs text-[#6b7280] mb-3">
          Builder Activity
        </h3>
        <BuilderStatsCard />
      </div>
    </div>
  );
}
