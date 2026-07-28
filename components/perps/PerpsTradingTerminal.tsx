'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useHLMarkets } from '@/lib/hyperliquid/hooks';
import { useHyperliquidStore } from '@/lib/hyperliquid/store';
import { useUIStore } from '@/lib/store/ui';
import {
  formatPrice,
  formatVolume,
  formatOI,
  formatFundingRate,
  pctChange,
} from '@/lib/hyperliquid/utils';
import { CoinIcon } from '@/components/perps/CoinIcon';

const FONT = 'var(--font-bricolage), Bricolage Grotesque, sans-serif';

// Dynamic imports — no SSR for these heavy components
const PerpsChart = dynamic(
  () => import('@/components/perps/PerpsChart').then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 min-h-[240px] max-h-[320px] bg-[#fafafa] rounded-[14px] border border-black/[0.08] animate-pulse" />
    ),
  },
);

const TradePanelSkeleton = () => (
  <div className="bg-white h-full flex flex-col p-3 gap-5">
    {/* Long/Short toggle */}
    <div className="flex gap-2">
      <div className="flex-1 h-12 rounded-[10px] bg-[#f0f0f0] animate-pulse" />
      <div className="flex-1 h-12 rounded-[10px] bg-[#f0f0f0] animate-pulse" />
    </div>
    {/* Order type */}
    <div className="px-1 space-y-1.5">
      <div className="h-3 w-20 bg-[#f0f0f0] rounded animate-pulse" />
      <div className="flex gap-1.5">
        <div className="flex-1 h-9 rounded-[8px] bg-[#f0f0f0] animate-pulse" />
        <div className="flex-1 h-9 rounded-[8px] bg-[#f0f0f0] animate-pulse" />
      </div>
    </div>
    {/* Size */}
    <div className="px-1 space-y-1.5">
      <div className="h-3 w-12 bg-[#f0f0f0] rounded animate-pulse" />
      <div className="h-12 rounded-[10px] bg-[#f0f0f0] animate-pulse" />
    </div>
    {/* Leverage */}
    <div className="px-1 space-y-1.5">
      <div className="h-3 w-20 bg-[#f0f0f0] rounded animate-pulse" />
      <div className="h-6 rounded bg-[#f0f0f0] animate-pulse" />
      <div className="flex gap-2">
        {[1,2,3,4,5,6].map(i => <div key={i} className="h-7 flex-1 rounded-[6px] bg-[#f0f0f0] animate-pulse" />)}
      </div>
    </div>
    {/* Info rows */}
    <div className="px-1 space-y-3 border-t border-black/[0.04] pt-3">
      {[1,2,3,4].map(i => (
        <div key={i} className="flex justify-between">
          <div className="h-3.5 w-24 bg-[#f0f0f0] rounded animate-pulse" />
          <div className="h-3.5 w-16 bg-[#f0f0f0] rounded animate-pulse" />
        </div>
      ))}
    </div>
    <div className="flex-1" />
    {/* Submit button */}
    <div className="h-14 rounded-[12px] bg-[#f0f0f0] animate-pulse" />
  </div>
);

const PerpsTradePanel = dynamic(
  () =>
    import('@/components/perps/PerpsTradePanel').then((m) => ({
      default: m.PerpsTradePanel,
    })),
  {
    ssr: false,
    loading: () => <TradePanelSkeleton />,
  },
);

const PerpsPositions = dynamic(
  () =>
    import('@/components/perps/PerpsPositions').then((m) => ({
      default: m.PerpsPositions,
    })) as Promise<{ default: React.ComponentType<{ filterCoin?: string }> }>,
  { ssr: false },
);

const PerpsOrderHistory = dynamic(
  () =>
    import('@/components/perps/PerpsOrderHistory').then((m) => ({
      default: m.PerpsOrderHistory,
    })),
  { ssr: false },
);

const PerpsRecentTrades = dynamic(
  () =>
    import('@/components/perps/PerpsRecentTrades').then((m) => ({
      default: m.PerpsRecentTrades,
    })),
  { ssr: false },
);

const PerpsAccountSummary = dynamic(
  () =>
    import('@/components/perps/PerpsAccountSummary').then((m) => ({
      default: m.PerpsAccountSummary,
    })),
  { ssr: false },
);

type BottomTab = 'positions' | 'orders' | 'trades';

const BOTTOM_TABS: { id: BottomTab; label: string }[] = [
  { id: 'positions', label: 'Positions' },
  { id: 'orders', label: 'Open Orders' },
];

const MOBILE_BOTTOM_TABS: { id: BottomTab; label: string }[] = [
  ...BOTTOM_TABS,
  { id: 'trades', label: 'Trades' },
];

export function PerpsTradingTerminal({ coin, isSpot = false }: { coin: string; isSpot?: boolean }) {
  const { markets } = useHLMarkets();
  const spotMeta = useHyperliquidStore((s) => s.spotMeta);
  const perpsDarkMode = useUIStore((s) => s.perpsDarkMode);
  const [bottomTab, setBottomTab] = useState<BottomTab>('positions');
  const [limitPrice, setLimitPrice] = useState<string>('');

  const market = useMemo(
    () => {
      if (isSpot) {
        return markets.find((m) => m.coin === coin && m.marketType === 'spot');
      }
      return markets.find((m) => m.coin === coin && m.marketType !== 'spot');
    },
    [markets, coin, isSpot],
  );

  // For spot charts, Hyperliquid needs "@{pairIndex}" format
  const chartCoin = useMemo(() => {
    if (!isSpot || !spotMeta) return coin;
    const tokenMap: Record<number, string> = {};
    for (const t of spotMeta.tokens) {
      tokenMap[t.index] = t.name;
    }
    const spotIdx = spotMeta.universe.findIndex(pair => {
      const baseName = tokenMap[pair.tokens[0]];
      return baseName === coin;
    });
    return spotIdx >= 0 ? `@${spotIdx}` : coin;
  }, [isSpot, spotMeta, coin]);

  const midPx = market ? parseFloat(market.midPx) : 0;
  const prevPx = market ? parseFloat(market.prevDayPx) : 0;
  const change = prevPx > 0 ? pctChange(midPx, prevPx) : 0;
  const isPositive = change >= 0;
  const decimals = midPx >= 1000 ? 2 : midPx >= 1 ? 4 : 6;
  const volume = market ? parseFloat(market.dayNtlVlm) : 0;
  const oi = market
    ? parseFloat(market.openInterest) * parseFloat(market.markPx)
    : 0;

  const handlePriceClick = (px: string) => {
    setLimitPrice(px);
  };

  // Stats data
  const stats = market ? (isSpot ? [
    { label: 'VOL', value: formatVolume(volume) },
  ] : [
    { label: 'VOL', value: formatVolume(volume) },
    { label: 'OI', value: formatOI(oi) },
    { label: 'FUNDING', value: formatFundingRate(market.funding), colored: true },
    { label: 'MAX', value: `${market.maxLeverage}x` },
  ]) : [];

  return (
    <div className="flex flex-col bg-white">

      {/* ── Desktop layout ── */}
      <div className="flex-1 hidden lg:flex lg:flex-col gap-0">
        {/* Row 1: Coin info + Stats | News placeholder */}
        <div className="flex items-center border-b border-[#f0f0f0] bg-[#fafbfc] px-4 py-2.5">
          {/* Left: coin info + stats */}
          <div className="flex items-center gap-3 mr-auto">
            <div className="flex items-center gap-3 mr-5">
              <CoinIcon symbol={coin} size={28} className="w-7 h-7" />
              <span className="text-[18px] font-bold text-[#1a1a1a] tracking-tight" style={{ fontFamily: FONT }}>
                {coin}/USDC {isSpot ? 'Spot' : 'Perp'}
              </span>
              <span className="text-[22px] font-bold text-[#1a1a1a] tabular-nums" style={{ fontFamily: FONT }}>
                {market ? `$${formatPrice(midPx, decimals)}` : '...'}
              </span>
              {market && (
                <span className={`text-[14px] font-bold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-rose-500'}`} style={{ fontFamily: FONT }}>
                  {isPositive ? '+' : ''}{change.toFixed(2)}%
                </span>
              )}
            </div>
            <div className="w-px h-6 bg-[#e5e7eb] mr-2" />
            <div className="flex items-center gap-5">
              {stats.map((stat) => (
                <div key={stat.label} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider" style={{ fontFamily: FONT }}>{stat.label}</span>
                  <span
                    className={`text-[14px] font-bold tabular-nums ${
                      stat.colored ? (parseFloat(market?.funding || '0') >= 0 ? 'text-emerald-600' : 'text-rose-500') : 'text-[#1a1a1a]'
                    }`}
                    style={{ fontFamily: FONT }}
                  >
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: News placeholder */}
          <div className="flex items-center gap-2 px-4 py-1.5 bg-white border border-[#e5e7eb] rounded-[8px]">
            <span className="text-[12px] font-bold text-[#1a1a1a] uppercase tracking-wider" style={{ fontFamily: FONT }}>
              News
            </span>
            <span className="text-[10px] text-[#9ca3af] font-medium" style={{ fontFamily: FONT }}>Coming soon</span>
          </div>
        </div>

        {/* Row 2: Left (Chart + Positions) | Right (Trade Panel) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px' }}>
          {/* Left column: Chart stacked with Positions */}
          <div className="flex flex-col" style={{ height: 'calc(100vh - 110px)' }}>
            <div
              className={`perps-chart-panel h-[360px] flex-shrink-0 overflow-hidden ${
                perpsDarkMode ? '' : 'border-b border-[#f0f0f0]'
              }`}
            >
              <PerpsChart coin={chartCoin} />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <div className="flex items-center border-b border-[#f0f0f0] px-4">
                {BOTTOM_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setBottomTab(tab.id)}
                    className={`px-4 py-3 text-[12px] font-bold uppercase tracking-wider transition-colors relative cursor-pointer ${
                      bottomTab === tab.id
                        ? 'text-[#1a1a1a]'
                        : 'text-[#9ca3af] hover:text-[#1a1a1a]'
                    }`}
                    style={{ fontFamily: FONT }}
                  >
                    {tab.label}
                    {bottomTab === tab.id && (
                      <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#1a1a1a] rounded-full" />
                    )}
                  </button>
                ))}
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                {bottomTab === 'positions' && <PerpsPositions filterCoin={coin} />}
                {bottomTab === 'orders' && <PerpsOrderHistory />}
              </div>
            </div>
          </div>
          {/* Right column: Trade Panel */}
          <div className={`overflow-y-auto ${perpsDarkMode ? 'border-l border-white/[0.06]' : 'border-l border-[#f0f0f0]'}`} style={{ height: 'calc(100vh - 110px)' }}>
            <PerpsTradePanel
              coin={coin}
              maxLeverage={isSpot ? 1 : (market?.maxLeverage ?? 50)}
              limitPrice={limitPrice}
              isSpot={isSpot}
              darkMode={perpsDarkMode}
            />
          </div>
        </div>
      </div>

      {/* ── Mobile layout: supports light/dark ── */}
      <div className={`flex-1 flex flex-col lg:hidden min-h-screen ${perpsDarkMode ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
        {/* Hero price section */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <CoinIcon symbol={coin} size={24} className="w-6 h-6" />
            <span className={`text-[15px] font-black tracking-tight ${perpsDarkMode ? 'text-white' : 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>
              {coin}
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${perpsDarkMode ? 'text-white/40' : 'text-black/40'}`}>
              {isSpot ? 'SPOT' : 'PERP'}
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className={`text-[32px] font-black tabular-nums tracking-tight ${perpsDarkMode ? 'text-white' : 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>
              ${market ? formatPrice(midPx, decimals) : '—'}
            </span>
            {market && (
              <span className={`text-[14px] font-bold tabular-nums px-2 py-0.5 rounded ${
                isPositive
                  ? perpsDarkMode ? 'text-[#00ff88] bg-[#00ff88]/10' : 'text-emerald-600 bg-emerald-500/10'
                  : perpsDarkMode ? 'text-[#ff4466] bg-[#ff4466]/10' : 'text-rose-500 bg-rose-500/10'
              }`} style={{ fontFamily: FONT }}>
                {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(2)}%
              </span>
            )}
          </div>
          {/* Stats row */}
          <div className={`flex items-center gap-4 mt-2 text-[10px] ${perpsDarkMode ? 'text-white/50' : 'text-black/50'}`} style={{ fontFamily: FONT }}>
            {stats.map((stat) => (
              <span key={stat.label} className={stat.colored ? (parseFloat(market?.funding || '0') >= 0 ? (perpsDarkMode ? 'text-[#00ff88]' : 'text-emerald-600') : (perpsDarkMode ? 'text-[#ff4466]' : 'text-rose-500')) : ''}>
                {stat.label}: <span className={perpsDarkMode ? 'text-white/80' : 'text-black/80'}>{stat.value}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="h-[220px] overflow-hidden flex-shrink-0 [&>*]:!min-h-0 [&>*]:h-full">
          <PerpsChart coin={chartCoin} />
        </div>

        {/* Trade panel */}
        <div className={`flex-1 rounded-t-[20px] -mt-2 relative z-10 flex flex-col overflow-hidden ${perpsDarkMode ? 'bg-[#111]' : 'bg-[#fafafa]'}`}>
          <div className={`w-10 h-1 rounded-full mx-auto mt-2 mb-1 ${perpsDarkMode ? 'bg-white/20' : 'bg-black/10'}`} />
          <PerpsTradePanel
            coin={coin}
            maxLeverage={market?.maxLeverage ?? 50}
            limitPrice={limitPrice}
            compact
            darkMode={perpsDarkMode}
          />
        </div>

        {/* Bottom tabs */}
        <div className={`border-t px-3 py-2 ${perpsDarkMode ? 'bg-[#0a0a0a] border-white/[0.06]' : 'bg-white border-black/[0.06]'}`}>
          <div className={`flex items-center rounded-full p-1 ${perpsDarkMode ? 'bg-[#1a1a1a]' : 'bg-black/[0.04]'}`}>
            {MOBILE_BOTTOM_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setBottomTab(tab.id)}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer ${
                  bottomTab === tab.id
                    ? perpsDarkMode ? 'bg-white text-black' : 'bg-[#1a1a1a] text-white'
                    : perpsDarkMode ? 'text-white/50' : 'text-black/50'
                }`}
                style={{ fontFamily: FONT }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="mt-2 max-h-[160px] overflow-y-auto">
            {bottomTab === 'positions' && <PerpsPositions filterCoin={coin} />}
            {bottomTab === 'orders' && <PerpsOrderHistory />}
            {bottomTab === 'trades' && <PerpsRecentTrades coin={coin} />}
          </div>
        </div>
      </div>
    </div>
  );
}
