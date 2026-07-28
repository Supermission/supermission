'use client';

import { useEffect, useState, useCallback } from 'react';
import { OverviewCards } from '@/components/admin/market/OverviewCards';
import { TradersTable, type TraderRow } from '@/components/admin/market/TradersTable';
import { TraderDetail } from '@/components/admin/market/TraderDetail';
import { MarketCatalogTable } from '@/components/admin/market/MarketCatalogTable';
import { RecentTradesTable } from '@/components/admin/market/RecentTradesTable';
import { TopMarketsTable } from '@/components/admin/market/TopMarketsTable';
import { VolumeChart } from '@/components/admin/market/VolumeChart';

type Tab = 'overview' | 'markets' | 'trades';

export default function AdminMarketPage() {
  const [tab, setTab] = useState<Tab>('overview');

  // Overview
  const [overview, setOverview] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Traders table
  const [traders, setTraders] = useState<TraderRow[]>([]);
  const [tradersTotal, setTradersTotal] = useState(0);
  const [tradersPage, setTradersPage] = useState(0);
  const [tradersLoading, setTradersLoading] = useState(true);
  const [sortBy, setSortBy] = useState('totalVolume');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');

  // Trader detail
  const [selectedTrader, setSelectedTrader] = useState<string | null>(null);

  // Fetch overview
  useEffect(() => {
    setOverviewLoading(true);
    fetch('/api/admin/market/overview')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setOverview(data);
      })
      .catch(console.error)
      .finally(() => setOverviewLoading(false));
  }, []);

  // Fetch traders
  useEffect(() => {
    setTradersLoading(true);
    const params = new URLSearchParams({
      page: tradersPage.toString(),
      limit: '50',
      sort: sortBy,
      dir: sortDir,
      ...(search ? { search } : {}),
    });

    fetch(`/api/admin/market/traders?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTraders(data.traders || []);
        setTradersTotal(data.total || 0);
      })
      .catch(console.error)
      .finally(() => setTradersLoading(false));
  }, [tradersPage, sortBy, sortDir, search]);

  const handleSort = useCallback(
    (key: string) => {
      if (sortBy === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(key);
        setSortDir('desc');
      }
      setTradersPage(0);
    },
    [sortBy]
  );

  const handleSearch = useCallback((q: string) => {
    setSearch(q);
    setTradersPage(0);
  }, []);

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1a1a1a]">Markets Dashboard</h1>
          <p className="text-[13px] text-gray-400 mt-1">
            Platform trading activity, market catalog, trader performance, and P&amp;L overview
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <OverviewCards data={overview} loading={overviewLoading} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#e5e7eb] pb-0 overflow-x-auto">
        {([
          { key: 'overview', label: 'Overview & Traders' },
          { key: 'markets', label: 'Market Catalog' },
          { key: 'trades', label: 'Recent Trades' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-[12px] font-semibold transition-colors border-b-2 -mb-[1px] whitespace-nowrap ${
              tab === t.key
                ? 'border-[#1a1a1a] text-[#1a1a1a]'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <>
          {/* Volume Chart + Top Markets */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <VolumeChart data={overview?.dailyVolume ?? []} loading={overviewLoading} />
            </div>
            <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Top Markets by Volume
              </p>
              {overviewLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-8 bg-gray-50 rounded animate-pulse" />
                  ))}
                </div>
              ) : (overview?.topMarkets || []).length === 0 ? (
                <p className="text-[13px] text-gray-300 py-8 text-center">No data</p>
              ) : (
                <div className="space-y-2">
                  {(overview?.topMarkets || []).slice(0, 5).map((m: any, i: number) => {
                    const maxVol = overview?.topMarkets?.[0]?.platformVolume || 1;
                    return (
                      <div key={m.conditionId} className="group">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-gray-300 w-4">{i + 1}</span>
                          <span className="text-[11px] text-[#1a1a1a] font-medium truncate flex-1" title={m.question}>
                            {m.question || m.conditionId.slice(0, 16)}
                          </span>
                          <span className="text-[11px] font-mono text-gray-500">
                            ${(m.platformVolume >= 1000 ? (m.platformVolume / 1000).toFixed(1) + 'K' : m.platformVolume.toFixed(0))}
                          </span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden ml-6">
                          <div
                            className="h-full bg-[#1a1a1a] rounded-full"
                            style={{ width: `${(m.platformVolume / maxVol) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Traders Table */}
          <div>
            <h2 className="text-sm font-bold text-gray-600 mb-3">Traders</h2>
            <TradersTable
              traders={traders}
              total={tradersTotal}
              page={tradersPage}
              loading={tradersLoading}
              onPageChange={setTradersPage}
              onSort={handleSort}
              sortBy={sortBy}
              sortDir={sortDir}
              search={search}
              onSearchChange={handleSearch}
              onSelectTrader={setSelectedTrader}
            />
          </div>
        </>
      )}

      {tab === 'markets' && (
        <div>
          <h2 className="text-sm font-bold text-gray-600 mb-3">All Markets</h2>
          <MarketCatalogTable
            markets={overview?.marketCatalog ?? []}
            loading={overviewLoading}
          />
        </div>
      )}

      {tab === 'trades' && (
        <div>
          <h2 className="text-sm font-bold text-gray-600 mb-3">Recent Trades</h2>
          <RecentTradesTable
            trades={overview?.recentTrades ?? []}
            loading={overviewLoading}
          />
        </div>
      )}

      {/* Trader Detail Modal */}
      {selectedTrader && (
        <TraderDetail
          address={selectedTrader}
          onClose={() => setSelectedTrader(null)}
        />
      )}
    </div>
  );
}
