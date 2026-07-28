'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTradeHistory } from './use-trade-history';
import { fetchUserFills } from '@/lib/hyperliquid/client';
import type {
  UnifiedTrade,
  TradeActivityStats,
} from '@/lib/types/trading-activity';

// ─── Normalizers ───────────────────────────────────────────────────────────

function normalizePolymarketTrade(t: any): UnifiedTrade {
  const priceInCents = Math.round((t.price ?? 0) * 100);
  return {
    id: `poly-${t.id}`,
    source: 'polymarket',
    side: t.side === 'REDEEM' ? 'REDEEM' : t.side === 'SELL' ? 'SELL' : 'BUY',
    timestamp: t.created_at ? new Date(t.created_at).getTime() : 0,
    title: `${t.outcome?.toUpperCase() ?? '?'} @ ${priceInCents}\u00A2`,
    subtitle: t.marketQuestion || 'Prediction Market',
    amount: t.side === 'BUY' ? -(t.amount ?? 0) : (t.amount ?? 0),
    price: t.price,
    size: t.shares ?? null,
    pnl: t.side === 'SELL' || t.side === 'REDEEM' ? (t.amount ?? 0) : null,
    leverage: null,
    entryPrice: null,
    exitPrice: null,
    liquidationPrice: null,
    agentName: null,
    marketUrl: t.condition_id ? `/markets?cid=${t.condition_id}` : null,
    txHash: t.transactionHash || null,
    tokenIn: null,
    tokenOut: null,
    chainId: 137,
    status: 'confirmed',
  };
}

function normalizeHLFill(f: any): UnifiedTrade {
  const isBuy = f.side === 'B';
  const pnl = parseFloat(f.closedPnl || '0');
  return {
    id: `hl-${f.hash}-${f.oid}`,
    source: 'hyperliquid',
    side: isBuy ? 'LONG' : 'SHORT',
    timestamp: f.time,
    title: `${f.coin}/USDC`,
    subtitle: 'Perpetual Futures',
    amount: -(parseFloat(f.px) * parseFloat(f.sz)),
    price: parseFloat(f.px),
    size: parseFloat(f.sz),
    pnl: pnl !== 0 ? pnl : null,
    leverage: null,
    entryPrice: parseFloat(f.px),
    exitPrice: pnl !== 0 ? parseFloat(f.px) : null,
    liquidationPrice: null,
    agentName: null,
    marketUrl: `/perps/${f.coin}`,
    txHash: f.hash,
    tokenIn: null,
    tokenOut: null,
    chainId: 42161,
    status: 'confirmed',
  };
}

function normalizeDefiActivity(a: any): UnifiedTrade {
  const KNOWN_SYMBOLS: Record<string, string> = {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 'USDC.e',
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC',
    '0x4200000000000000000000000000000000000006': 'WETH',
  };
  const symIn = KNOWN_SYMBOLS[a.token_in?.toLowerCase()] || a.token_in?.slice(0, 6) || '?';
  const symOut = KNOWN_SYMBOLS[a.token_out?.toLowerCase()] || a.token_out?.slice(0, 6) || '?';
  const CHAIN_NAMES: Record<number, string> = { 8453: 'Base', 137: 'Polygon', 1: 'Ethereum', 42161: 'Arbitrum' };

  return {
    id: `defi-${a.id}`,
    source: 'defi',
    side: 'SWAP',
    timestamp: a.created_at ? new Date(a.created_at).getTime() : 0,
    title: `${symIn} \u2192 ${symOut}`,
    subtitle: `${CHAIN_NAMES[a.chain_id] || 'Chain'} \u00B7 ${a.activity_type === 'cross_chain_swap' ? 'Bridge' : 'Swap'}`,
    amount: -(a.amount_usd ?? 0),
    price: null,
    size: null,
    pnl: null,
    leverage: null,
    entryPrice: null,
    exitPrice: null,
    liquidationPrice: null,
    agentName: null,
    marketUrl: null,
    txHash: a.tx_hash || null,
    tokenIn: symIn,
    tokenOut: symOut,
    chainId: a.chain_id,
    status: a.status || 'confirmed',
  };
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useUnifiedTrades(address: string | undefined) {
  const { trades: polyTrades, loading: polyLoading } = useTradeHistory(address);
  const [hlFills, setHlFills] = useState<any[]>([]);
  const [hlLoading, setHlLoading] = useState(false);
  const [defiActivities, setDefiActivities] = useState<any[]>([]);
  const [defiLoading, setDefiLoading] = useState(false);

  // Fetch HL fills
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setHlLoading(true);
    fetchUserFills(address)
      .then((fills) => { if (!cancelled) setHlFills(fills); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHlLoading(false); });
    return () => { cancelled = true; };
  }, [address]);

  // Fetch DeFi activities
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setDefiLoading(true);
    fetch(`/api/defi/activity?wallet=${address}&limit=100`)
      .then(r => r.ok ? r.json() : { activities: [] })
      .then(data => { if (!cancelled) setDefiActivities(data.activities || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDefiLoading(false); });
    return () => { cancelled = true; };
  }, [address]);

  // Normalize + merge
  const allTrades = useMemo<UnifiedTrade[]>(() => {
    const poly = polyTrades.map(normalizePolymarketTrade);
    const hl = hlFills.map(normalizeHLFill);
    const defi = defiActivities.map(normalizeDefiActivity);
    return [...poly, ...hl, ...defi].sort((a, b) => b.timestamp - a.timestamp);
  }, [polyTrades, hlFills, defiActivities]);

  // Compute stats
  const stats = useMemo<TradeActivityStats>(() => {
    const tradesWithPnl = allTrades.filter(t => t.pnl !== null);
    const wins = tradesWithPnl.filter(t => (t.pnl ?? 0) > 0);
    const pnls = tradesWithPnl.map(t => t.pnl ?? 0);
    return {
      totalTrades: allTrades.length,
      totalVolume: allTrades.reduce((s, t) => s + Math.abs(t.amount), 0),
      winRate: tradesWithPnl.length > 0 ? (wins.length / tradesWithPnl.length) * 100 : 0,
      totalPnl: pnls.reduce((s, p) => s + p, 0),
      bestTrade: pnls.length > 0 ? Math.max(...pnls) : 0,
      worstTrade: pnls.length > 0 ? Math.min(...pnls) : 0,
    };
  }, [allTrades]);

  const loading = polyLoading || hlLoading || defiLoading;

  return { trades: allTrades, stats, loading };
}
