'use client';

import React, { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { useSendTransaction } from 'wagmi';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useChatStore } from '@/lib/store/chat';
import { usePaymentTransaction } from '@/lib/hooks/use-payment-transaction';
import { CONTRACTS } from '@/lib/contracts/addresses';
import type { X402PaymentProof } from '@/lib/x402/types';
import type { Address } from 'viem';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const DEFI_YIELD_RECIPIENT = '0xE7138DF3CcB480718Dc2C37fAf7Aee70B08157e7' as Address;
const DEFI_YIELD_PRICE = '0.1';
const DEFI_YIELD_PRICE_UNITS = '100000';
const MARKETS_PER_PAGE = 3;

type OldPool = {
  pool: string;
  chain?: string;
  project?: string;
  symbol?: string;
  tvlUsd?: number;
  apy?: number;
  apyBase?: number | null;
  apyReward?: number | null;
  stablecoin?: boolean;
  ilRisk?: boolean | string;
  exposure?: string;
  apyMean30d?: number;
};

type NewOpp = {
  poolId: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number;
  apyReward: number;
  stablecoin: boolean;
  ilRisk: boolean;
  exposure: string;
  apyMean30d: number;
  volatility30d: number;
  rewardShare: number;
  riskScore: number;
  score: number;
  reasons: string[];
  underlyingTokens?: string[];
};

type ExecutionHint = {
  poolId: string;
  entryAsset: { chainId: number; address: string; symbol?: string; decimals?: number };
  targetAsset: { chainId: number; address: string } | null;
  suggestedSlippageBps: number;
};

type SwapPreview = {
  poolId: string;
  ok: boolean;
  source?: 'cdp' | '0x';
  slippageBps?: number;
  price?: any;
  reason?: string;
};

type WalletMode = 'auto' | 'privy' | 'external';

type DefiYieldResultData =
  | {
      // New pipeline output
      rankedOpportunities: NewOpp[];
      shortlist?: NewOpp[];
      poolsConsidered?: number;
      filtersApplied?: Record<string, any>;
      aiInsights?: any;
      executionHints?: ExecutionHint[];
      swapPreviews?: SwapPreview[];
    }
  | {
      // Old output (kept for backwards compatibility in chat history)
      pools: OldPool[];
      totalPoolsFound?: number;
      filtersApplied?: Record<string, any>;
      aiInsights?: any;
    };

function formatUsd(n?: number) {
  if (!n || !Number.isFinite(n)) return '-';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPct(n?: number) {
  if (n == null || !Number.isFinite(n)) return '-';
  if (n >= 1000) return `${Math.round(n).toLocaleString()}%`;
  if (n >= 100) return `${n.toFixed(1)}%`;
  if (n >= 10) return `${n.toFixed(2)}%`;
  return `${n.toFixed(3)}%`;
}

function asBool(x: any): boolean {
  if (typeof x === 'boolean') return x;
  if (typeof x === 'string') return x.toLowerCase() === 'yes' || x.toLowerCase() === 'true';
  return !!x;
}

function riskBadge(riskScore: number) {
  if (riskScore >= 75) return { label: 'HIGH', cls: 'bg-red-700 text-white' };
  if (riskScore >= 55) return { label: 'MED', cls: 'bg-amber-600 text-white' };
  return { label: 'LOW', cls: 'bg-green-700 text-white' };
}

function shortAddr(addr?: string | null) {
  if (!addr || typeof addr !== 'string') return '-';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatUserError(error: any, action: 'swap' | 'approval'): string {
  // Get error message and code
  const message = error?.message || error?.reason || String(error);
  const code = error?.code || error?.error?.code;
  const lowerMessage = message.toLowerCase();

  // User rejected/cancelled transaction
  if (
    code === 4001 ||
    code === 'ACTION_REJECTED' ||
    lowerMessage.includes('user rejected') ||
    lowerMessage.includes('user denied') ||
    lowerMessage.includes('user cancelled') ||
    lowerMessage.includes('cancelled') ||
    lowerMessage.includes('rejected')
  ) {
    return action === 'approval'
      ? 'Approval cancelled. Click "Approve USDC" to try again.'
      : 'Transaction cancelled. No funds were spent.';
  }

  // Insufficient funds
  if (
    lowerMessage.includes('insufficient funds') ||
    lowerMessage.includes('insufficient balance') ||
    code === 'INSUFFICIENT_FUNDS'
  ) {
    return 'Insufficient balance to cover transaction cost. Add more ETH for gas fees.';
  }

  // Network/connection errors
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('connection') ||
    code === 'NETWORK_ERROR' ||
    code === 'TIMEOUT'
  ) {
    return 'Network error. Check your connection and try again.';
  }

  // Transaction underpriced (gas too low)
  if (
    lowerMessage.includes('underpriced') ||
    lowerMessage.includes('gas too low') ||
    lowerMessage.includes('max fee per gas')
  ) {
    return 'Transaction gas price too low. Please try again.';
  }

  // Nonce errors
  if (lowerMessage.includes('nonce')) {
    return 'Transaction nonce error. Refresh the page and try again.';
  }

  // Contract execution errors
  if (
    lowerMessage.includes('execution reverted') ||
    lowerMessage.includes('revert') ||
    lowerMessage.includes('call exception')
  ) {
    return action === 'approval'
      ? 'Approval transaction failed. The token contract may have restrictions.'
      : 'Swap failed. This could be due to price movement or insufficient liquidity. Try again with higher slippage.';
  }

  // Generic fallback with minimal technical details
  // Extract only the first line or first 100 chars to avoid overwhelming users
  const shortMessage = message.split('\n')[0].slice(0, 100);

  return action === 'approval'
    ? `Approval failed: ${shortMessage}`
    : `Transaction failed: ${shortMessage}`;
}

export function DefiYieldResultPanel({ data, offset = 0 }: { data: DefiYieldResultData | null; offset?: number }) {
  const { address: externalAddress } = useAccount();
  const { paymentAddress, isReady: isWalletReady } = usePaymentWallet();
  const addMessage = useChatStore((state) => state.addMessage);
  const payment = usePaymentTransaction();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const { sendTransactionAsync } = useSendTransaction();
  const [swapAmount, setSwapAmount] = useState<string>('');
  const [walletMode, setWalletMode] = useState<WalletMode>('auto');
  const [busyPoolId, setBusyPoolId] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [needsApproval, setNeedsApproval] = useState<boolean>(false);
  const [approvalPending, setApprovalPending] = useState<boolean>(false);

  const normalized = useMemo(() => {
    if (!data) return { items: [] as Array<any>, aiInsights: null as any, meta: null as any };

    // New pipeline
    if ('rankedOpportunities' in data && Array.isArray((data as any).rankedOpportunities)) {
      const items = (data as any).rankedOpportunities as NewOpp[];
      return {
        items: items.slice(0, 20).map((o) => ({
          poolId: o.poolId,
          chain: o.chain,
          project: o.project,
          symbol: o.symbol,
          tvlUsd: o.tvlUsd,
          apy: o.apy,
          stablecoin: o.stablecoin,
          ilRisk: o.ilRisk,
          riskScore: o.riskScore,
          score: o.score,
          reasons: o.reasons || [],
          underlyingTokens: (o as any).underlyingTokens || [],
        })),
        aiInsights: (data as any).aiInsights || null,
        meta: {
          poolsConsidered: (data as any).poolsConsidered,
          filters: (data as any).filtersApplied,
          executionHints: (data as any).executionHints || [],
          swapPreviews: (data as any).swapPreviews || [],
        },
      };
    }

    // Old output
    const pools = (data as any).pools as OldPool[];
    const items = (pools || []).slice(0, 20).map((p) => {
      const apy = Number(p.apy || 0);
      const tvlUsd = Number(p.tvlUsd || 0);
      const apyBase = Number(p.apyBase || 0);
      const apyReward = Number(p.apyReward || 0);
      const denom = Math.max(1e-9, Math.abs(apyBase) + Math.abs(apyReward));
      const rewardShare = Math.min(1, Math.abs(apyReward) / denom);
      let riskScore = 35;
      riskScore += rewardShare * 30;
      if (asBool(p.ilRisk)) riskScore += 15;
      if (tvlUsd < 5_000_000) riskScore += 12;
      if (apy > 150) riskScore += 10;
      riskScore = Math.max(0, Math.min(100, riskScore));

      const reasons: string[] = [];
      if (rewardShare > 0.7) reasons.push('Reward-heavy APY');
      if (asBool(p.ilRisk)) reasons.push('IL risk');
      if (tvlUsd < 1_000_000) reasons.push('Low TVL');
      if (apy > 150) reasons.push('Very high APY');

      return {
        poolId: p.pool,
        chain: p.chain || 'Unknown',
        project: p.project || 'Unknown',
        symbol: p.symbol || 'Unknown',
        tvlUsd,
        apy,
        stablecoin: !!p.stablecoin,
        ilRisk: asBool(p.ilRisk),
        riskScore,
        score: null,
        reasons,
      };
    });

    return {
      items,
      aiInsights: (data as any).aiInsights || null,
      meta: {
        poolsConsidered: (data as any).totalPoolsFound,
        filters: (data as any).filtersApplied,
      },
    };
  }, [data]);

  // Derive risk filter directly from the user's conversation choice (filtersApplied.riskTolerance)
  const riskFilter = useMemo((): 'ALL' | 'LOW' | 'MED' | 'HIGH' => {
    const tolerance = normalized.meta?.filters?.riskTolerance;
    if (tolerance === 'low') return 'LOW';
    if (tolerance === 'medium') return 'MED';
    if (tolerance === 'high') return 'HIGH';
    return 'ALL';
  }, [normalized.meta?.filters?.riskTolerance]);

  const filteredItems = useMemo(() => {
    if (riskFilter === 'ALL') return normalized.items;
    return normalized.items.filter((o: any) => {
      const score = Number(o.riskScore || 0);
      if (riskFilter === 'HIGH') return score >= 75;
      if (riskFilter === 'MED') return score >= 55 && score < 75;
      return score < 55; // LOW
    });
  }, [normalized.items, riskFilter]);

  const visibleItems = useMemo(() => filteredItems.slice(offset, offset + MARKETS_PER_PAGE), [filteredItems, offset]);
  const hasMore = filteredItems.length > offset + MARKETS_PER_PAGE;

  async function handleShowMore() {
    if (!payment.isWalletReady) {
      toast.error('Please connect a wallet first');
      return;
    }

    const nextOffset = offset + MARKETS_PER_PAGE;
    setIsLoadingMore(true);

    try {
      await new Promise<void>((resolve, reject) => {
        payment.executePayment({
          recipient: DEFI_YIELD_RECIPIENT,
          amount: DEFI_YIELD_PRICE,
          tokenAddress: CONTRACTS.USDC,
          onSuccess: async (txHash) => {
            toast.success('Payment sent!');

            const proof: X402PaymentProof = {
              txHash: txHash as `0x${string}`,
              from: payment.paymentAddress as Address,
              to: DEFI_YIELD_RECIPIENT,
              amount: DEFI_YIELD_PRICE_UNITS,
              token: CONTRACTS.USDC,
              timestamp: Date.now(),
            };

            try {
              const response = await fetch('/api/new-agents/defi-yield', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-payment-proof': JSON.stringify(proof),
                },
                body: JSON.stringify({}),
              });

              if (!response.ok) throw new Error(`API error: ${response.status}`);
              const result = await response.json();

              if (result.success && result.data) {
                addMessage({
                  role: 'assistant',
                  content: 'Here are more DeFi yield opportunities on Base.',
                  metadata: {
                    action: {
                      type: 'defi_yield_result',
                      data: { ...result.data, _offset: nextOffset },
                    },
                  },
                });
                toast.success('More markets loaded!');
              } else {
                throw new Error(result.error || 'Failed to fetch markets');
              }
            } catch (e) {
              toast.error(`Failed to fetch markets: ${e instanceof Error ? e.message : 'Unknown error'}`);
            }
            resolve();
          },
          onError: (error) => reject(error),
        });
      });
    } catch (err) {
      toast.error(`Payment failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoadingMore(false);
    }
  }

  // Build a lookup from AI top picks by poolId for inline risk notes
  const aiTopPickMap = useMemo(() => {
    const map = new Map<string, any>();
    const picks = normalized.aiInsights?.topPicks;
    if (Array.isArray(picks)) {
      for (const pick of picks) {
        if (pick.poolId) map.set(pick.poolId, pick);
      }
    }
    return map;
  }, [normalized.aiInsights]);

  if (!data) return null;
  if (!normalized.items.length) return null;

  const executionHints: ExecutionHint[] = Array.isArray(normalized.meta?.executionHints) ? normalized.meta.executionHints : [];
  const swapPreviews: SwapPreview[] = Array.isArray(normalized.meta?.swapPreviews) ? normalized.meta.swapPreviews : [];

  function resolveWallet(): { mode: WalletMode; taker?: string; canSend: boolean; label: string } {
    if (walletMode === 'privy') {
      return { mode: 'privy', taker: paymentAddress || undefined, canSend: Boolean(isWalletReady && paymentAddress), label: 'Payment wallet' };
    }
    if (walletMode === 'external') {
      return { mode: 'external', taker: externalAddress || undefined, canSend: Boolean(externalAddress), label: 'External wallet' };
    }
    // auto
    if (isWalletReady && paymentAddress) return { mode: 'privy', taker: paymentAddress, canSend: true, label: 'Payment wallet' };
    if (externalAddress) return { mode: 'external', taker: externalAddress, canSend: true, label: 'External wallet' };
    return { mode: 'auto', taker: undefined, canSend: false, label: 'No wallet connected' };
  }

  function toggleCard(poolId: string) {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(poolId)) {
        next.delete(poolId);
      } else {
        next.add(poolId);
      }
      return next;
    });
  }

  async function executeSwapForPool(poolId: string) {
    try {
      const hint = executionHints.find((h) => h.poolId === poolId);
      if (!hint?.targetAsset?.address) {
        toast.error('Swap not available for this pool (missing token address)');
        return;
      }

      const slippageBps = Number(hint.suggestedSlippageBps || 100);
      const sellAmount = String(swapAmount || '').trim();
      if (!sellAmount || Number(sellAmount) <= 0) {
        toast.error('Enter a valid USDC amount');
        return;
      }

      const resolved = resolveWallet();
      if (!resolved.canSend) {
        toast.error('Connect a wallet (external or payment wallet) to execute');
        return;
      }
      const taker = resolved.taker;

      setBusyPoolId(poolId);

      toast.info('Fetching swap quote...');
      const res = await fetch('/api/trade/swap/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: 8453,
          sellToken: hint.entryAsset.address,
          buyToken: hint.targetAsset.address,
          sellAmount,
          slippageBps,
          taker,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        // Extract error details from various possible response formats
        const errorMsg = json?.error as string | undefined;
        const detailsMsg =
          (json?.details?.message as string | undefined) ||
          (json?.details?.reason as string | undefined) ||
          (json?.details?.error as string | undefined);

        // Check if it's an allowance error
        const isAllowanceError =
          errorMsg?.toLowerCase().includes('allowance') ||
          detailsMsg?.toLowerCase().includes('allowance');

        if (isAllowanceError) {
          if (approvalPending) {
            toast.error('Approval is still confirming. Please wait 10 seconds and try again.');
          } else {
            setNeedsApproval(true);
            toast.error('Approval required. Click "Approve USDC" below.');
          }
          return;
        }

        // Show the most specific error available
        const displayError = detailsMsg || errorMsg || `Failed to get swap quote (HTTP ${res.status})`;

        console.error('[Swap] Quote failed:', {
          status: res.status,
          error: errorMsg,
          details: json?.details,
          fullResponse: json
        });

        toast.error(displayError);
        return;
      }

      // Reset approval state on success
      setNeedsApproval(false);

      const quote = json.quote || {};
      // 0x API returns transaction data inside a 'transaction' object
      const txData = quote.transaction || quote;
      const to = txData.to as `0x${string}` | undefined;
      const dataHex = txData.data as `0x${string}` | undefined;
      const value = BigInt(txData.value || '0');

      if (!to || !dataHex) {
        console.error('[Swap] Missing transaction data:', { quote, txData });
        toast.error('Quote missing transaction data');
        return;
      }

      // Use wagmi sendTransaction for all wallets (Privy embedded or external)
      const senderAddress = resolved.taker;
      if (!senderAddress) throw new Error('Wallet not connected');

      toast.info('Sending swap via external wallet...');
      const tx = await sendTransactionAsync({
        to,
        data: dataHex,
        value,
      });
      toast.success(`Swap submitted: ${String(tx).slice(0, 10)}…`);
    } catch (e: any) {
      // Handle user-friendly error messages for production
      const errorMessage = formatUserError(e, 'swap');
      toast.error(errorMessage);

      // Log detailed error for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.error('[Swap Error]', e);
      }
    } finally {
      setBusyPoolId(null);
    }
  }

  async function approvePermit2() {
    try {
      const resolved = resolveWallet();
      if (!resolved.canSend) {
        toast.error('Connect a wallet to approve');
        return;
      }

      setIsApproving(true);
      setApprovalPending(true);
      toast.info('Getting approval transaction...');

      const res = await fetch('/api/trade/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Failed to generate approval');
        return;
      }

      const tx = json.transaction;
      const to = tx.to as `0x${string}`;
      const dataHex = tx.data as `0x${string}`;
      const value = BigInt(tx.value || '0');

      // Use wagmi sendTransaction for all wallets
      const senderAddr = resolved.taker;
      if (!senderAddr) throw new Error('Wallet not connected');

      toast.info('Approving...');
      const txHash = await sendTransactionAsync({
        to,
        data: dataHex,
        value,
      });

      toast.success(`Approval submitted! ${String(txHash).slice(0, 10)}…`);
      toast.info('Waiting for confirmation... (~5 seconds)');

      // Wait 6 seconds for the transaction to be mined
      await new Promise(resolve => setTimeout(resolve, 6000));

      toast.success('Approval confirmed! You can now execute swaps.');
      setNeedsApproval(false);
      setApprovalPending(false);
    } catch (e: any) {
      // Handle user-friendly error messages for production
      const errorMessage = formatUserError(e, 'approval');
      toast.error(errorMessage);
      setApprovalPending(false);

      // Log detailed error for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.error('[Approval Error]', e);
      }
    } finally {
      setIsApproving(false);
    }
  }

  const riskFilterLabel = riskFilter === 'ALL' ? 'All Risk Levels' : `${riskFilter} Risk`;

  return (
    <div className="bg-white border border-[#e5e7eb] p-6 rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      {/* Header */}
      <div className="border-b border-[#e5e7eb] pb-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-sans font-black tracking-tight text-2xl text-[#3a3a3a]">
              DeFi Yield Scanner
            </h2>
            <div className="text-[10px] text-[#3a3a3a]/60 mt-2">
              {normalized.meta?.poolsConsidered ? `${normalized.meta.poolsConsidered} pools analyzed` : 'ranked opportunities'}
            </div>
          </div>
          <div className="flex gap-3">
            <div className={`text-center border border-[#e5e7eb] px-4 py-2 rounded-[12px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)] ${
              riskFilter === 'HIGH' ? 'bg-red-700 text-white border-red-700' : riskFilter === 'MED' ? 'bg-amber-600 text-white border-amber-600' : riskFilter === 'LOW' ? 'bg-green-700 text-white border-green-700' : 'bg-[#3a3a3a] text-white border-[#3a3a3a]'
            }`}>
              <div className="text-[10px] text-white/60">{riskFilterLabel}</div>
              <div className="font-sans font-black text-lg text-white">{filteredItems.length}</div>
            </div>
            <div className="text-center border border-[#e5e7eb] bg-white px-4 py-2 rounded-[12px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)]">
              <div className="text-[10px] text-[#3a3a3a]/60">All Markets</div>
              <div className="font-sans font-black text-xl">{normalized.items.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtered count note */}
      {riskFilter !== 'ALL' && filteredItems.length !== normalized.items.length && (
        <div className="mb-6 text-[11px] text-[#3a3a3a]/40">
          Showing {filteredItems.length} of {normalized.items.length} markets matching your {riskFilter.toLowerCase()} risk preference
        </div>
      )}

      {/* Approval Warning */}
      {needsApproval && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 border border-amber-600 p-4 bg-amber-50 rounded-[12px] shadow-[0px_4px_12px_0px_rgba(217,119,6,0.15)]"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold text-amber-900 mb-1">
                Approval Required
              </div>
              <div className="text-sm text-amber-900">
                You need to approve Permit2 contract to spend USDC. This is a one-time setup.
              </div>
            </div>
            <button
              onClick={approvePermit2}
              disabled={isApproving}
              className="px-4 py-2 border border-amber-900 bg-amber-600 text-white text-[11px] font-bold rounded-[8px] hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {isApproving ? 'Approving...' : 'Approve USDC'}
            </button>
          </div>
        </motion.div>
      )}

      {/* Wallet Controls */}
      <div className="mb-6 border border-[#e5e7eb] p-4 bg-white rounded-[12px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold text-[#3a3a3a]/60 block mb-2">
              Amount (USDC)
            </label>
            <input
              value={swapAmount}
              onChange={(e) => setSwapAmount(e.target.value)}
              inputMode="decimal"
              className="w-full border border-[#e5e7eb] px-3 py-2 font-mono text-sm rounded-[8px] focus:outline-none focus:shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] transition-shadow"
              placeholder="Enter amount"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[#3a3a3a]/60 block mb-2">
              Connected Wallet
            </label>
            <div className="font-mono text-[11px] text-[#3a3a3a] bg-[#f8fafc] border border-[#e5e7eb] px-3 py-2 rounded-[8px] truncate">
              {(() => {
                const r = resolveWallet();
                if (r.taker) {
                  return `${shortAddr(r.taker)}`;
                }
                return 'No wallet connected';
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Opportunities List */}
      {filteredItems.length === 0 && (
        <div className="mb-6 border border-[#e5e7eb] p-6 text-center rounded-[12px]">
          <div className="text-sm text-[#3a3a3a]/50">No {riskFilter.toLowerCase()} risk markets found in the current scan.</div>
        </div>
      )}
      <div className="space-y-3">
        {visibleItems.map((o: any, idx: number) => {
          const rb = riskBadge(Number(o.riskScore || 0));
          const hint = executionHints.find((h) => h.poolId === o.poolId) || null;
          const preview = swapPreviews.find((p) => p.poolId === o.poolId) || null;
          const isExpanded = expandedCards.has(o.poolId);
          const aiPick = aiTopPickMap.get(o.poolId);

          // Build a short conversational risk note
          const riskNotes: string[] = [];
          if (aiPick?.watchouts) {
            riskNotes.push(...(aiPick.watchouts as string[]).slice(0, 2));
          } else {
            if (o.ilRisk) riskNotes.push('Impermanent loss risk');
            if (o.apy > 150) riskNotes.push('Very high APY, verify sustainability');
            if (Array.isArray(o.reasons)) riskNotes.push(...o.reasons.slice(0, 2));
          }

          return (
            <motion.div
              key={o.poolId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              className="border border-[#e5e7eb] bg-white rounded-[12px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)]"
            >
              {/* Collapsed Header - Clickable */}
              <button
                onClick={() => toggleCard(o.poolId)}
                className="w-full p-4 text-left hover:bg-[#f7f7f7] transition-colors duration-150 rounded-t-[12px]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-sans font-black tracking-tight text-lg text-[#3a3a3a] truncate">
                      {o.symbol}
                    </div>
                    <div className="text-[10px] text-[#3a3a3a]/60 truncate mt-1">
                      {o.project} &middot; {o.chain}
                    </div>
                    {/* Inline conversational risk note */}
                    {riskNotes.length > 0 && (
                      <div className="text-[10px] text-amber-700 mt-1.5 truncate">
                        heads up: {riskNotes[0].toLowerCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="px-3 py-1 font-mono text-[10px] font-bold border border-[#e5e7eb] bg-white rounded-[6px]">
                      {formatUsd(o.tvlUsd)}
                    </span>
                    <span className={`px-3 py-1 font-mono text-[10px] font-bold border border-[#e5e7eb] rounded-[6px] ${rb.cls}`}>
                      {rb.label}
                    </span>
                    <span className="px-3 py-1 font-mono text-[10px] font-bold bg-[#3a3a3a] text-white border border-[#3a3a3a] rounded-[6px]">
                      {formatPct(o.apy)}
                    </span>
                    <motion.span
                      animate={{ rotate: isExpanded ? 90 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-sm text-[#3a3a3a]/60 ml-1"
                    >
                      &#9654;
                    </motion.span>
                  </div>
                </div>
              </button>

              {/* Expanded Details */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-[#e5e7eb] p-4 bg-white">
                      {/* AI Pick insight (conversational) */}
                      {aiPick?.why && (
                        <div className="mb-4 border border-[#e5e7eb]/60 p-3 bg-[#f8fafc] rounded-[8px]">
                          <div className="text-[11px] text-[#3a3a3a]/80 leading-relaxed">{aiPick.why}</div>
                          {riskNotes.length > 0 && (
                            <div className="mt-2 text-[10px] text-amber-700 leading-relaxed">
                              but do remember: {riskNotes.map((n: string) => n.toLowerCase()).join('; ')}
                            </div>
                          )}
                          {aiPick.whoItsFor && (
                            <div className="mt-1.5 text-[10px] text-[#3a3a3a]/50">best for: {aiPick.whoItsFor}</div>
                          )}
                        </div>
                      )}

                      {/* Metrics Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div className="border border-[#e5e7eb] p-3 bg-[#f8fafc] rounded-[8px]">
                          <div className="text-[10px] text-[#3a3a3a]/60 mb-1">TVL</div>
                          <div className="font-mono text-sm font-bold text-[#3a3a3a]">{formatUsd(o.tvlUsd)}</div>
                        </div>
                        <div className="border border-[#e5e7eb] p-3 bg-[#f8fafc] rounded-[8px]">
                          <div className="text-[10px] text-[#3a3a3a]/60 mb-1">IL Risk</div>
                          <div className="font-mono text-sm font-bold text-[#3a3a3a]">{o.ilRisk ? 'YES' : 'NO'}</div>
                        </div>
                        <div className="border border-[#e5e7eb] p-3 bg-[#f8fafc] rounded-[8px]">
                          <div className="text-[10px] text-[#3a3a3a]/60 mb-1">Risk</div>
                          <div className="font-mono text-sm font-bold text-[#3a3a3a]">{Math.round(Number(o.riskScore || 0))}/100</div>
                        </div>
                        <div className="border border-[#e5e7eb] p-3 bg-[#f8fafc] rounded-[8px]">
                          <div className="text-[10px] text-[#3a3a3a]/60 mb-1">Score</div>
                          <div className="font-mono text-sm font-bold text-[#3a3a3a]">
                            {o.score == null ? '-' : `${Math.round(Number(o.score))}/100`}
                          </div>
                        </div>
                      </div>

                      {/* Reasons (only if no AI pick insight shown) */}
                      {!aiPick?.why && Array.isArray(o.reasons) && o.reasons.length > 0 && (
                        <div className="mb-4 border border-[#e5e7eb] p-3 rounded-[8px]">
                          <div className="text-[10px] font-bold text-[#3a3a3a]/60 mb-2">
                            Analysis
                          </div>
                          <div className="text-[11px] text-[#3a3a3a]/80 space-y-1">
                            {o.reasons.slice(0, 4).map((reason: string, i: number) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="text-[#3a3a3a]/40">&bull;</span>
                                <span>{reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Underlying Tokens */}
                      {Array.isArray(o.underlyingTokens) && o.underlyingTokens.length > 0 && (
                        <div className="mb-4 border border-[#e5e7eb] p-3 rounded-[8px]">
                          <div className="text-[10px] font-bold text-[#3a3a3a]/60 mb-2">
                            Underlying Tokens
                          </div>
                          <div className="font-mono text-[11px] text-[#3a3a3a]/80 space-y-1">
                            {o.underlyingTokens.slice(0, 3).map((token: string, i: number) => (
                              <div key={i} className="flex items-start gap-2 truncate">
                                <span className="text-[#3a3a3a]/40">&bull;</span>
                                <span className="truncate">{shortAddr(token)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Swap Execution */}
                      {hint?.targetAsset?.address ? (
                        <div className={`border p-3 rounded-[8px] ${needsApproval ? 'border-amber-600 bg-amber-600' : 'border-[#3a3a3a] bg-[#3a3a3a]'} text-white`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-bold text-white/60 mb-1">
                                {needsApproval ? 'Approval Required' : 'Execute Swap'}
                              </div>
                              <div className="font-mono text-sm font-bold text-white truncate">
                                {needsApproval ? 'Approve Permit2 to spend USDC' : `${hint.entryAsset.symbol || 'USDC'} → ${shortAddr(hint.targetAsset.address)}`}
                                {!needsApproval && (
                                  <span className="font-mono text-xs font-normal text-white/60 ml-2">
                                    slippage {hint.suggestedSlippageBps}bps
                                  </span>
                                )}
                              </div>
                              {preview?.ok && !needsApproval && (
                                <div className="font-mono text-[10px] text-white/60 mt-1">
                                  preview via <span className="font-bold text-white/80">{preview.source}</span>
                                </div>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (needsApproval) {
                                  approvePermit2();
                                } else {
                                  executeSwapForPool(o.poolId);
                                }
                              }}
                              disabled={busyPoolId === o.poolId || isApproving}
                              className={`px-4 py-2 border border-white text-[11px] font-bold rounded-[8px] bg-white ${needsApproval ? 'text-amber-900' : 'text-[#3a3a3a]'} hover:bg-transparent hover:text-white hover:border-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150`}
                            >
                              {isApproving ? 'Approving...' : busyPoolId === o.poolId ? 'Executing...' : needsApproval ? 'Approve USDC' : 'Execute'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="border border-[#e5e7eb] p-3 bg-[#f8fafc] rounded-[8px]">
                          <div className="text-[11px] text-[#3a3a3a]/50 italic">
                            Swap unavailable (missing token address)
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Show More Markets */}
      {hasMore && (
        <div className="mt-4 border-t border-[#e5e7eb] pt-4">
          <div className="text-[9px] text-[#3a3a3a]/50 mb-2">Want to see more?</div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleShowMore}
              disabled={isLoadingMore || !payment.isWalletReady}
              className="text-[9px] px-3 py-1.5 border border-[#e5e7eb] text-[#3a3a3a]/70 hover:border-[#3a3a3a] hover:bg-[#f7f7f7] cursor-pointer transition-colors font-bold rounded-[6px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingMore ? 'Loading...' : 'Show more markets'}
            </button>
            <span className="font-mono text-[9px] text-green-700 font-bold">$0.10</span>
          </div>
        </div>
      )}
    </div>
  );
}
