'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MarketCatalogItem } from '@/lib/types/market';

interface AgentMarketResultProps {
  deals: any[];
  onMarketClick?: (market: MarketCatalogItem) => void;
}

function formatVolume(v: number | undefined | null): string {
  if (v == null || v === 0) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function useCountdown(endDate: string | null) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!endDate) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endDate]);

  if (!endDate) return null;

  const diff = new Date(endDate).getTime() - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return { days, hours, minutes, seconds };
}

export function AgentMarketResult({ deals, onMarketClick }: AgentMarketResultProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = deals[selectedIndex];

  const yesPrice = selected?.outcome_prices?.[0] ?? 0.5;
  const noPrice = selected?.outcome_prices?.[1] ?? 0.5;
  const yesPercent = Math.round(yesPrice * 100);
  const noPercent = Math.round(noPrice * 100);
  const sentiment = selected?.ai_sentiment?.toLowerCase();
  const isBullish = sentiment === 'bullish';
  const countdown = useCountdown(selected?.end_date);

  const handleViewInTerminal = useCallback(() => {
    if (selected && onMarketClick) {
      onMarketClick(selected as MarketCatalogItem);
    }
  }, [selected, onMarketClick]);

  if (!deals.length) return null;

  return (
    <div className="mt-3">
      {/* ── Horizontal carousel ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {deals.map((deal, i) => {
          const dealSentiment = deal.ai_sentiment?.toLowerCase();
          const dealBullish = dealSentiment === 'bullish';
          const isActive = i === selectedIndex;

          return (
            <button
              key={deal.market_id || i}
              onClick={() => setSelectedIndex(i)}
              className={`flex-shrink-0 w-[200px] text-left p-3 border rounded-[8px] transition-all duration-150 ${
                isActive
                  ? 'bg-[#3a3a3a] text-white border-[#3a3a3a] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)]'
                  : 'bg-white text-black border-[#e5e7eb] hover:border-black/25 hover:shadow-sm'
              }`}
            >
              <p className={`text-[10px] font-bold leading-tight line-clamp-2 ${
                isActive ? 'text-white' : 'text-black/80'
              }`}>
                {deal.question}
              </p>
              <div className="flex items-center justify-between mt-2">
                <span className={`text-[9px] font-bold ${
                  isActive
                    ? 'text-white/40'
                    : dealBullish ? 'text-emerald-500' : 'text-rose-400'
                }`}>
                  {dealBullish ? 'BULLISH' : 'BEARISH'}
                </span>
                <span className={`font-mono text-[9px] ${isActive ? 'text-white/30' : 'text-[#9ca3af]'}`}>
                  {i + 1}/{deals.length}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Expanded detail card ── */}
      {selected && (
        <div className="bg-white border border-[#e5e7eb] rounded-[12px] mt-1.5 overflow-hidden">
          {/* Top accent bar — green for bullish, red for bearish */}
          <div className={`h-1 ${isBullish ? 'bg-emerald-500' : 'bg-rose-500'}`} />

          {/* Header row: countdown + category + index */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div className="flex items-center gap-3">
              {/* Category badge */}
              {selected.categories?.[0] && (
                <span className="font-mono text-[8px] font-bold bg-[#f8fafc] text-[#9ca3af] px-2 py-0.5 rounded">
                  {selected.categories[0]}
                </span>
              )}

              {/* Countdown */}
              {countdown && (
                <div className="flex items-center gap-1.5">
                  <svg className="w-3 h-3 text-[#9ca3af]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <div className="flex items-center">
                    {[
                      { val: countdown.days, label: 'D' },
                      { val: countdown.hours, label: 'H' },
                      { val: countdown.minutes, label: 'M' },
                      { val: countdown.seconds, label: 'S' },
                    ].map((unit, i) => (
                      <span key={unit.label} className="flex items-center">
                        {i > 0 && <span className="font-mono text-[8px] text-black/15 mx-0.5">:</span>}
                        <span className="bg-[#3a3a3a] text-white font-mono text-[8px] font-bold px-1 py-px min-w-[22px] text-center rounded">
                          {unit.val}{unit.label}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <span className="font-mono text-[10px] text-[#9ca3af] font-bold">
              {selectedIndex + 1}/{deals.length}
            </span>
          </div>

          {/* Question + summary */}
          <div className="px-4 pb-4">
            <h3 className="text-[13px] font-black leading-snug text-black">
              {selected.question}
            </h3>
            {selected.ai_summary && (
              <p className="text-[10px] text-[#9ca3af] mt-2 leading-relaxed line-clamp-2">
                {selected.ai_summary}
              </p>
            )}
          </div>

          {/* REC + ODDS — two-column panel */}
          <div className="grid grid-cols-5 border-t border-[#e5e7eb]">
            {/* Recommendation — 2 cols */}
            <div className={`col-span-2 p-4 border-r border-[#e5e7eb] ${
              isBullish ? 'bg-emerald-50/50' : 'bg-rose-50/50'
            }`}>
              <span className="text-[8px] font-bold text-[#9ca3af]">
                SIGNAL
              </span>
              <div className={`font-mono text-3xl font-black mt-1 tracking-tight ${
                isBullish ? 'text-emerald-600' : 'text-rose-500'
              }`}>
                {isBullish ? 'YES' : 'NO'}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  isBullish ? 'bg-emerald-500' : 'bg-rose-500'
                }`} />
                <span className="font-mono text-[9px] text-[#9ca3af]">
                  {Math.round(selected.ai_confidence || 0)}% conf
                </span>
              </div>
            </div>

            {/* Odds bar — 3 cols */}
            <div className="col-span-3 p-4">
              <span className="text-[8px] font-bold text-[#9ca3af]">
                ODDS
              </span>
              <div className="mt-2.5">
                <div className="flex h-4 overflow-hidden rounded-sm">
                  <div
                    className="bg-emerald-500 transition-all duration-500 ease-out"
                    style={{ width: `${yesPercent}%` }}
                  />
                  <div
                    className="bg-rose-400 transition-all duration-500 ease-out"
                    style={{ width: `${noPercent}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="font-mono text-[9px] font-bold text-emerald-600">
                    YES {yesPercent}%
                  </span>
                  <span className="font-mono text-[9px] font-bold text-rose-500">
                    NO {noPercent}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Buy buttons */}
          <div className="grid grid-cols-2 border-t border-[#e5e7eb]">
            <button
              onClick={handleViewInTerminal}
              className="flex items-center justify-center gap-2 py-3.5 bg-emerald-600 text-white text-[11px] font-black hover:bg-emerald-700 active:bg-emerald-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
              </svg>
              BUY YES
            </button>
            <button
              onClick={handleViewInTerminal}
              className="flex items-center justify-center gap-2 py-3.5 bg-rose-500 text-white text-[11px] font-black hover:bg-rose-600 active:bg-rose-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5l-15 15m0 0h11.25M4.5 19.5V8.25" />
              </svg>
              BUY NO
            </button>
          </div>

          {/* Footer: volume + view in terminal */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#e5e7eb] bg-[#f8fafc]">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[9px] font-bold text-[#9ca3af]">
                VOL: {formatVolume(selected.volume)}
              </span>
              {selected.volume_24h > 0 && (
                <span className="font-mono text-[9px] text-[#9ca3af]">
                  24H: {formatVolume(selected.volume_24h)}
                </span>
              )}
            </div>
            <button
              onClick={handleViewInTerminal}
              className="flex items-center gap-1.5 font-mono text-[9px] font-bold text-[#9ca3af] hover:text-black transition-colors group"
            >
              <svg className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              VIEW IN TERMINAL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
