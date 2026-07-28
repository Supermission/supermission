'use client';

/**
 * PerpsDepositBanner
 *
 * Persistent banner shown at top of /perps when user has no Hyperliquid balance.
 * Guides the user through bridging USDC from Base/Polygon/Ethereum to Arbitrum,
 * then depositing to Hyperliquid via the bridge contract.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePrivy, useWallets, useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth';
import { usePublicClient } from 'wagmi';
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from 'viem';
import { arbitrum } from 'wagmi/chains';
import { useUsdcBalances } from '@/lib/hooks/use-usdc-balances';
import { toast } from 'sonner';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useLifiSwap } from '@/lib/hooks/use-uniswap-swap';
import {
  HL_BRIDGE_ADDRESS,
  USDC_ARBITRUM,
  MIN_DEPOSIT_USDC,
  MIN_DEPOSIT_USDC_ETH,
  USDC_BY_CHAIN,
  USDC_POLYGON_BRIDGED,
  CHAIN_NAMES,
  encodeApproveUsdc,
  encodeDepositUsd,
  getHLBalance,
  waitForArbUsdcBalance,
} from '@/lib/hyperliquid/deposit';
import { BaseIcon, PolygonIcon, EthereumIcon, ArbitrumIcon } from '@/components/dashboard/shared/ChainIcons';
import { QRCodeSVG } from 'qrcode.react';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

type FlowState = 'idle' | 'bridging' | 'waiting' | 'approving' | 'depositing' | 'done' | 'error';

interface StepDef {
  label: string;
  key: FlowState;
}

const BRIDGE_STEPS: StepDef[] = [
  { label: 'Bridge to Arbitrum', key: 'bridging' },
  { label: 'Waiting for USDC', key: 'waiting' },
  { label: 'Approve USDC', key: 'approving' },
  { label: 'Deposit to HL', key: 'depositing' },
];

const DIRECT_STEPS: StepDef[] = [
  { label: 'Approve USDC', key: 'approving' },
  { label: 'Deposit to HL', key: 'depositing' },
];

const ChainIcon = ({ chainId, size = 16 }: { chainId: number; size?: number }) => {
  if (chainId === 8453) return <BaseIcon size={size} />;
  if (chainId === 137) return <PolygonIcon size={size} />;
  if (chainId === 1) return <EthereumIcon size={size} />;
  if (chainId === 42161) return <ArbitrumIcon size={size} />;
  return null;
};

function getMinDeposit(chainId: number): number {
  return chainId === 1 ? MIN_DEPOSIT_USDC_ETH : MIN_DEPOSIT_USDC;
}

export default function PerpsDepositBanner() {
  const { ready, authenticated } = usePrivy();
  const { paymentAddress } = usePaymentWallet();
  const { wallets } = useWallets();
  const { sendTransaction: privySendTx } = usePrivySendTransaction();
  const { fetchQuote, executeSwap } = useLifiSwap();
  const arbPublicClient = usePublicClient({ chainId: arbitrum.id });

  // HL balance
  const [hlBalance, setHlBalance] = useState<number | null>(null);
  const [hlLoading, setHlLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  // Flow state
  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [flowError, setFlowError] = useState<string | null>(null);
  const [stepMessage, setStepMessage] = useState('');
  const flowAbortRef = useRef(false);

  // Fade-out
  const [fadeOut, setFadeOut] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);

  // Listen for external deposit trigger (from TradingBalancePill)
  useEffect(() => {
    const handler = () => setModalOpen(true);
    window.addEventListener('open-perps-deposit', handler);
    return () => window.removeEventListener('open-perps-deposit', handler);
  }, []);
  const [selectedChain, setSelectedChain] = useState<typeof chains[0] | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [showQr, setShowQr] = useState(false);

  // USDC balances — single consolidated poll instead of 5 separate wagmi hooks
  const { baseUsdc, polyBridgedUsdc, polyNativeUsdc, arbUsdc, ethUsdc, refetch: refetchBalances } = useUsdcBalances(paymentAddress ?? undefined);

  // Build chain list with balances
  // Polygon: show native USDC and USDC.e separately — USDC.e is used for Polymarket, not for HL bridging
  const chains = [
    ...(polyNativeUsdc > 0.01 ? [{ chainId: 137, name: 'Polygon USDC', balance: polyNativeUsdc, usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as string }] : []),
    ...(polyBridgedUsdc > 0.01 ? [{ chainId: 137, name: 'Polygon USDC.e', balance: polyBridgedUsdc, usdcAddress: USDC_POLYGON_BRIDGED as string }] : []),
    { chainId: 8453, name: 'Base', balance: baseUsdc, usdcAddress: USDC_BY_CHAIN[8453] },
    { chainId: 1, name: 'Ethereum', balance: ethUsdc, usdcAddress: USDC_BY_CHAIN[1] },
    { chainId: 42161, name: 'Arbitrum', balance: arbUsdc, usdcAddress: USDC_ARBITRUM as string },
  ].sort((a, b) => b.balance - a.balance);

  const recommended = chains.find(c => c.balance >= getMinDeposit(c.chainId));
  const hasArbBalance = arbUsdc >= MIN_DEPOSIT_USDC;

  // Fetch HL balance
  useEffect(() => {
    if (!paymentAddress) { setHlLoading(false); return; }
    let cancelled = false;
    setHlLoading(true);

    getHLBalance(paymentAddress).then((bal) => {
      if (!cancelled) {
        setHlBalance(bal);
        setHlLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setHlBalance(0);
        setHlLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [paymentAddress]);

  const getEmbedded = useCallback(() => wallets.find(w => w.walletClientType === 'privy'), [wallets]);

  // ─── Direct Deposit (Arb USDC -> HL) ──────────────────────────────────────

  const directDeposit = useCallback(async (amount: number) => {
    const embedded = getEmbedded();
    if (!embedded || !paymentAddress) {
      toast.error('Wallet not available');
      return;
    }

    flowAbortRef.current = false;
    setFlowState('depositing');
    setFlowError(null);
    setStepMessage('Depositing USDC to Hyperliquid...');

    try {
      // Single transfer to HL bridge — per Privy's official Hyperliquid docs,
      // just transfer USDC to the bridge address. No approve + depositUsd needed.
      const transferData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [HL_BRIDGE_ADDRESS, parseUnits(String(amount), 6)],
      });

      await privySendTx(
        { to: USDC_ARBITRUM as string, data: transferData, chainId: 42161 },
        { address: paymentAddress, sponsor: true },
      );

      // Wait for HL to process
      await new Promise(r => setTimeout(r, 5000));

      setFlowState('done');
      setStepMessage('Deposit complete!');
      toast.success(`Deposited $${amount.toFixed(2)} USDC to Hyperliquid`);

      setTimeout(() => setFadeOut(true), 2000);
      setTimeout(() => setHlBalance(amount), 3000);
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : 'Deposit failed';
      if (msg === 'DIRECT_DEPOSIT' || msg.includes('insufficient funds') || msg.includes('exceeds the balance') || msg.includes('UserOperation')) {
        msg = 'Deposit directly via Hyperliquid — click the link below.';
        setFlowState('error');
        setFlowError('SHOW_DIRECT_LINK');
        toast.error('Auto-deposit unavailable. Use the direct deposit link.', { duration: 4000 });
      } else {
        setFlowState('error');
        setFlowError(msg);
        toast.error(msg, { duration: 4000 });
      }
    }
  }, [getEmbedded, paymentAddress, privySendTx, arbPublicClient]);

  // ─── Bridge + Deposit Flow ─────────────────────────────────────────────────

  const bridgeAndDeposit = useCallback(async (sourceChainId: number, usdcAddress: string, amount: number) => {
    const embedded = getEmbedded();
    if (!embedded || !paymentAddress) {
      toast.error('Wallet not available');
      return;
    }

    flowAbortRef.current = false;
    setFlowState('bridging');
    setFlowError(null);
    setStepMessage(`Bridging $${amount.toFixed(2)} USDC from ${CHAIN_NAMES[sourceChainId] || 'source'} to Arbitrum...`);

    try {
      // Step 1: Get bridge quote
      const quote = await fetchQuote({
        tokenIn: usdcAddress,
        tokenOut: USDC_ARBITRUM,
        amountIn: amount.toFixed(6),
        decimalsIn: 6,
        decimalsOut: 6,
        chainId: sourceChainId as 8453 | 137 | 1,
        toChainId: 42161,
        slippageBps: 50,
      });

      if (!quote || !quote.methodParameters) {
        throw new Error('Could not get bridge quote. Try again.');
      }

      if (flowAbortRef.current) return;

      // Step 2: Execute bridge
      await executeSwap(
        {
          tokenIn: usdcAddress,
          tokenOut: USDC_ARBITRUM,
          amountIn: amount.toFixed(6),
          decimalsIn: 6,
          decimalsOut: 6,
          chainId: sourceChainId as 8453 | 137 | 1,
          toChainId: 42161,
          slippageBps: 50,
        },
        quote,
      );

      if (flowAbortRef.current) return;

      // Step 3: Wait for USDC on Arbitrum
      setFlowState('waiting');
      setStepMessage('Waiting for USDC to arrive on Arbitrum...');

      // Account for slippage — expect ~98% of amount
      const expectedMin = amount * 0.95;
      const arrived = await waitForArbUsdcBalance(
        paymentAddress,
        expectedMin,
        180_000,
        arbPublicClient,
      );

      if (flowAbortRef.current) return;

      if (!arrived) {
        throw new Error('USDC did not arrive on Arbitrum within 3 minutes. Check your wallet — the bridge may still be processing.');
      }

      // Refetch balance to get exact amount
      await refetchBalances();

      // Step 4: Approve + Deposit
      // Re-check actual Arb USDC balance
      let depositAmount = amount * 0.95; // conservative
      try {
        if (arbPublicClient) {
          const balance = await arbPublicClient.readContract({
            address: USDC_ARBITRUM,
            abi: [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
            functionName: 'balanceOf',
            args: [paymentAddress as `0x${string}`],
          });
          depositAmount = parseFloat(formatUnits(balance, 6));
        }
      } catch {
        // use conservative estimate
      }

      if (depositAmount < MIN_DEPOSIT_USDC) {
        throw new Error(`Only $${depositAmount.toFixed(2)} USDC arrived on Arbitrum (minimum $${MIN_DEPOSIT_USDC}). Try with a larger amount.`);
      }

      // Single transfer to HL bridge — no approve needed
      setFlowState('depositing');
      setStepMessage('Depositing to Hyperliquid...');

      const transferData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [HL_BRIDGE_ADDRESS, parseUnits(String(depositAmount), 6)],
      });

      await privySendTx(
        { to: USDC_ARBITRUM as string, data: transferData, chainId: 42161 },
        { address: paymentAddress, sponsor: true },
      );

      await new Promise(r => setTimeout(r, 5000));

      setFlowState('done');
      setStepMessage('Deposit complete!');
      toast.success(`Deposited $${depositAmount.toFixed(2)} USDC to Hyperliquid`);

      setTimeout(() => setFadeOut(true), 2000);
      setTimeout(() => setHlBalance(depositAmount), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bridge failed';
      setFlowState('error');
      setFlowError(msg);
      toast.error(msg);
    }
  }, [getEmbedded, paymentAddress, fetchQuote, executeSwap, arbPublicClient, refetchBalances, privySendTx]);

  // ─── Rendering ─────────────────────────────────────────────────────────────

  // Don't render anything if not connected
  if (!ready || !authenticated || !paymentAddress) return null;

  // Determine if we should show the inline banner (only when zero HL balance)
  const showBanner = !hlLoading && (hlBalance === null || hlBalance <= 0) && !fadeOut;

  // Always render the modal (so TradingBalancePill "+" works even when user has balance)
  // Only conditionally render the inline banner

  const isProcessing = flowState !== 'idle' && flowState !== 'done' && flowState !== 'error';
  const steps = hasArbBalance && !recommended ? DIRECT_STEPS : (recommended && recommended.chainId !== 42161 ? BRIDGE_STEPS : DIRECT_STEPS);
  const activeStepIdx = steps.findIndex(s => s.key === flowState);

  return (
    <div className={showBanner ? "mx-4 sm:mx-6 md:mx-8 mt-3 mb-1" : ""} id="perps-deposit-banner">
      {showBanner && <div className="border border-black/[0.06] rounded-[10px] bg-white overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {/* ── Idle: clean inline banner ── */}
        {flowState === 'idle' && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5">
            {/* Left: icon + text */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <img src="/tokens/usdc-base.png" alt="USDC" className="w-8 h-8 rounded-full flex-shrink-0" />
              <div>
                <p className="text-[13px] font-bold text-[#1a1a1a] leading-tight" style={{ fontFamily: FONT }}>
                  Deposit USDC to start trading
                </p>
                <p className="text-[11px] text-[#71717a] mt-0.5" style={{ fontFamily: FONT }}>
                  {recommended
                    ? `You have $${recommended.balance.toFixed(2)} on ${recommended.name}`
                    : hasArbBalance
                      ? `$${arbUsdc.toFixed(2)} on Arbitrum ready to deposit`
                      : `Fund your wallet with at least $${MIN_DEPOSIT_USDC} USDC`
                  }
                </p>
              </div>
            </div>

            {/* Right: open deposit modal */}
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
              <button
                onClick={() => {
                  setSelectedChain(hasArbBalance ? chains.find(c => c.chainId === 42161) ?? null : recommended ?? null);
                  setDepositAmount(hasArbBalance ? String(Math.floor(arbUsdc * 100) / 100) : recommended ? String(Math.floor(recommended.balance * 100) / 100) : '');
                  setModalOpen(true);
                }}
                disabled={!recommended && !hasArbBalance}
                className="flex-1 sm:flex-none h-9 px-5 bg-[#1a1a1a] text-white text-[11px] font-bold rounded-[8px] hover:bg-[#333] transition-colors active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ fontFamily: FONT }}
              >
                {hasArbBalance ? 'Deposit to Hyperliquid' : recommended ? `Bridge & Deposit` : 'No USDC found'}
              </button>
            </div>
          </div>
        )}

        {/* ── Processing: compact inline progress ── */}
        {(isProcessing || flowState === 'done') && (
          <div className="flex items-center gap-4 px-4 py-3">
            {flowState === 'done' ? (
              <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <div className="w-4 h-4 border-2 border-[#1a1a1a] border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-[#1a1a1a] truncate" style={{ fontFamily: FONT }}>
                {flowState === 'done' ? 'Ready to trade' : stepMessage || 'Processing...'}
              </p>
              {flowState !== 'done' && (
                <div className="flex gap-1 mt-1.5">
                  {steps.map((step, idx) => {
                    const isCompleted = activeStepIdx > idx || (flowState as string) === 'done';
                    const isActive = step.key === flowState;
                    return (
                      <div
                        key={step.key}
                        className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                          isCompleted ? 'bg-[#1a1a1a]' : isActive ? 'bg-[#1a1a1a]/40' : 'bg-[#e5e7eb]'
                        }`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Error: compact inline with direct deposit fallback ── */}
        {flowState === 'error' && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-4 sm:px-5 py-3.5">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="3" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                  {flowError === 'SHOW_DIRECT_LINK' ? 'Deposit directly via Hyperliquid' : (flowError || 'Something went wrong')}
                </p>
                {flowError === 'SHOW_DIRECT_LINK' && (
                  <p className="text-[10px] text-[#71717a] mt-0.5" style={{ fontFamily: FONT }}>
                    Send USDC on Arbitrum to Hyperliquid. Takes 30 seconds.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {flowError === 'SHOW_DIRECT_LINK' && (
                <a
                  href="https://app.hyperliquid.xyz/portfolio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 px-4 bg-[#1a1a1a] text-white text-[10px] font-bold rounded-[6px] hover:bg-[#333] transition-colors flex items-center gap-1.5"
                  style={{ fontFamily: FONT }}
                >
                  Open Hyperliquid
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" /></svg>
                </a>
              )}
              <button
                onClick={() => { setFlowState('idle'); setFlowError(null); setStepMessage(''); }}
                className="h-8 px-3 bg-[#f5f5f5] text-[#1a1a1a] text-[10px] font-bold rounded-[6px] hover:bg-[#eee] transition-colors flex-shrink-0"
                style={{ fontFamily: FONT }}
              >
                {flowError === 'SHOW_DIRECT_LINK' ? 'Back' : 'Dismiss'}
              </button>
              {flowError !== 'SHOW_DIRECT_LINK' && (
                <button
                  onClick={() => { setFlowState('idle'); setFlowError(null); setStepMessage(''); setModalOpen(true); }}
                  className="h-8 px-3 bg-[#1a1a1a] text-white text-[10px] font-bold rounded-[6px] hover:bg-[#333] transition-colors flex-shrink-0"
                  style={{ fontFamily: FONT }}
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
      </div>}

      {/* ── Deposit Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (flowState === 'idle' || flowState === 'done' || flowState === 'error') setModalOpen(false); }} />

          {/* Modal */}
          <div data-hl-deposit-modal className="relative bg-white dark:bg-[#161616] rounded-[14px] border border-black/[0.08] dark:border-white/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.5)] w-full max-w-[420px] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f0f0] dark:border-white/[0.08]">
              <h2 className="text-[15px] font-bold text-[#1a1a1a] dark:text-white" style={{ fontFamily: FONT }}>
                Hyperliquid Trading Account
              </h2>
              <button
                onClick={() => { if (flowState === 'idle' || flowState === 'done' || flowState === 'error') { setModalOpen(false); setFlowState('idle'); setSelectedChain(null); } }}
                className="w-7 h-7 flex items-center justify-center rounded-[6px] hover:bg-[#f5f5f5] dark:hover:bg-white/[0.06] transition-colors text-[#9ca3af] dark:text-[#666]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Trading balance */}
            {flowState === 'idle' && (
              <div className="px-5 pt-4">
                <div className="text-center pb-4 border-b border-[#f0f0f0] dark:border-white/[0.08]">
                  <span className="text-[10px] font-bold text-[#9ca3af] dark:text-[#888] uppercase tracking-wider" style={{ fontFamily: FONT }}>
                    Available for Trading
                  </span>
                  <div className="mt-1.5 flex items-center justify-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/tokens/chain-hyperliquid.png" alt="" width={20} height={20} className="rounded-full" />
                    <span className={`text-[28px] font-bold tabular-nums ${(hlBalance ?? 0) > 0 ? 'text-[#1a1a1a] dark:text-white' : 'text-[#9ca3af] dark:text-[#666]'}`} style={{ fontFamily: FONT }}>
                      ${(hlBalance ?? 0).toFixed(2)}
                    </span>
                  </div>
                  {(hlBalance ?? 0) < 1 && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-1" style={{ fontFamily: FONT }}>
                      Fund your account to start trading perpetuals
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Add funds — chain list */}
            {flowState === 'idle' && !selectedChain && (
              <div className="px-5 pt-3 pb-3">
                {chains.filter(c => c.balance > 0.01).length > 0 ? (
                  <>
                    <label className="text-[10px] font-bold text-[#9ca3af] dark:text-[#888] uppercase tracking-wider block mb-2" style={{ fontFamily: FONT }}>
                      Add funds from
                    </label>
                    <div className="space-y-1.5">
                      {chains.filter(c => c.balance > 0.01).map(c => (
                        <button
                          key={c.chainId}
                          onClick={() => {
                            setSelectedChain(c);
                            setDepositAmount(String(Math.floor(c.balance * 100) / 100));
                          }}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-[8px] bg-white dark:bg-[#1e1e1e] border border-[#e5e7eb] dark:border-[#333] hover:border-[#1a1a1a] dark:hover:border-[#555] transition-all text-left"
                        >
                          <div className="flex items-center gap-2.5">
                            <ChainIcon chainId={c.chainId} size={18} />
                            <span className="text-[13px] font-semibold text-[#1a1a1a] dark:text-white" style={{ fontFamily: FONT }}>
                              {c.name.includes('USDC') ? c.name : `${c.name} USDC`}
                            </span>
                            {c.chainId === 42161 && (
                              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded" style={{ fontFamily: FONT }}>
                                direct
                              </span>
                            )}
                          </div>
                          <span className="text-[13px] font-bold text-[#1a1a1a] dark:text-white tabular-nums" style={{ fontFamily: FONT }}>
                            ${c.balance.toFixed(2)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-[#9ca3af] text-center py-4" style={{ fontFamily: FONT }}>
                    No USDC available on other chains to transfer
                  </p>
                )}

                {/* External wallet option */}
                <div className="mt-3 pt-3 border-t border-[#f0f0f0] dark:border-white/[0.08]">
                  <label className="text-[10px] font-bold text-[#9ca3af] dark:text-[#888] uppercase tracking-wider block mb-2" style={{ fontFamily: FONT }}>
                    Or from an external wallet
                  </label>
                  <div className="rounded-[8px] border border-[#e5e7eb] dark:border-[#333] overflow-hidden">
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <div className="w-[18px] h-[18px] rounded-full bg-[#f0f0f0] dark:bg-[#333] flex items-center justify-center flex-shrink-0">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round" className="dark:stroke-[#aaa]"><path d="M21 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a1 1 0 100 2 1 1 0 000-2z" /></svg>
                      </div>
                      <span className="text-[13px] font-semibold text-[#1a1a1a] dark:text-white flex-1" style={{ fontFamily: FONT }}>
                        External Wallet
                      </span>
                    </div>
                    {/* Copy + Show QR buttons */}
                    <div className="flex border-t border-[#f0f0f0] dark:border-white/[0.08]">
                      <button
                        onClick={() => {
                          if (!paymentAddress) return;
                          navigator.clipboard.writeText(paymentAddress);
                          toast.success('Deposit address copied', { duration: 3000 });
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold text-[#666] dark:text-[#aaa] hover:text-[#1a1a1a] dark:hover:text-white hover:bg-[#f9f9f9] dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
                        style={{ fontFamily: FONT }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                        Copy Address
                      </button>
                      <div className="w-px bg-[#f0f0f0] dark:bg-white/[0.08]" />
                      <button
                        onClick={() => setShowQr(v => !v)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors cursor-pointer ${showQr ? 'text-[#1a1a1a] dark:text-white bg-[#f5f5f5] dark:bg-white/[0.06]' : 'text-[#666] dark:text-[#aaa] hover:text-[#1a1a1a] dark:hover:text-white hover:bg-[#f9f9f9] dark:hover:bg-white/[0.04]'}`}
                        style={{ fontFamily: FONT }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="2" width="8" height="8" rx="1" /><rect x="14" y="2" width="8" height="8" rx="1" /><rect x="2" y="14" width="8" height="8" rx="1" /><rect x="14" y="14" width="4" height="4" /><path d="M22 14h-4v4" /><path d="M22 22h-4v-4" />
                        </svg>
                        {showQr ? 'Hide QR' : 'Show QR'}
                      </button>
                    </div>
                    {/* QR Code */}
                    {showQr && paymentAddress && (
                      <div className="border-t border-[#f0f0f0] px-4 py-4 flex flex-col items-center gap-2 bg-[#fafafa]">
                        <div className="bg-white p-3 rounded-[10px] border border-[#e5e7eb]">
                          <QRCodeSVG value={paymentAddress} size={140} level="M" />
                        </div>
                        <span className="text-[10px] text-[#9ca3af] font-medium text-center" style={{ fontFamily: FONT }}>
                          Send USDC on Arbitrum to this address
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Withdraw / Move funds */}
                <div className="mt-3 pt-3 border-t border-[#f0f0f0] dark:border-white/[0.08]">
                  <label className="text-[10px] font-bold text-[#9ca3af] dark:text-[#888] uppercase tracking-wider block mb-2" style={{ fontFamily: FONT }}>
                    Withdraw or move funds
                  </label>
                  <div className="space-y-1.5">
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('open-move-funds', { detail: { from: 'hl', to: 'base' } }));
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] border border-[#e5e7eb] dark:border-[#333] hover:border-[#d1d5db] dark:hover:border-[#555] hover:bg-[#fafbfc] dark:hover:bg-white/[0.02] transition-all cursor-pointer"
                    >
                      <img src="/tokens/chain-base.png" alt="" width={18} height={18} className="rounded-full flex-shrink-0" />
                      <span className="text-[13px] font-semibold text-[#1a1a1a] dark:text-white flex-1 text-left" style={{ fontFamily: FONT }}>
                        Withdraw to Wallet
                      </span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" className="dark:stroke-[#555]"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('open-move-funds', { detail: { from: 'hl', to: 'poly' } }));
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] border border-[#e5e7eb] dark:border-[#333] hover:border-[#d1d5db] dark:hover:border-[#555] hover:bg-[#fafbfc] dark:hover:bg-white/[0.02] transition-all cursor-pointer"
                    >
                      <img src="/tokens/polymarket.png" alt="" width={18} height={18} className="rounded-full flex-shrink-0" />
                      <span className="text-[13px] font-semibold text-[#1a1a1a] dark:text-white flex-1 text-left" style={{ fontFamily: FONT }}>
                        Move to Polymarket
                      </span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" className="dark:stroke-[#555]"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Amount input — after selecting source chain */}
            {selectedChain && flowState === 'idle' && (
              <div className="px-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold text-[#9ca3af] dark:text-[#888] uppercase tracking-wider" style={{ fontFamily: FONT }}>
                    Amount from {selectedChain.name}
                  </label>
                  <button
                    onClick={() => { setSelectedChain(null); setDepositAmount(''); }}
                    className="text-[9px] font-bold text-[#9ca3af] dark:text-[#888] hover:text-[#1a1a1a] dark:hover:text-white transition-colors"
                    style={{ fontFamily: FONT }}
                  >
                    Change
                  </button>
                </div>
                <div className="flex items-center gap-2 border border-[#e5e7eb] dark:border-[#333] rounded-[8px] px-3 py-2 focus-within:border-[#1a1a1a] dark:focus-within:border-[#555] transition-colors">
                  <span className="text-[13px] text-[#9ca3af] dark:text-[#666] font-semibold">$</span>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    min={MIN_DEPOSIT_USDC}
                    max={selectedChain.balance}
                    step="0.01"
                    className="flex-1 text-[15px] font-bold text-[#1a1a1a] dark:text-white bg-transparent outline-none tabular-nums dark:placeholder:text-[#555]"
                    style={{ fontFamily: FONT }}
                    placeholder="0.00"
                  />
                  <button
                    onClick={() => setDepositAmount(String(Math.floor(selectedChain.balance * 100) / 100))}
                    className="text-[10px] font-bold text-[#1a1a1a] dark:text-[#aaa] bg-[#f5f5f5] dark:bg-[#333] px-2 py-1 rounded-[4px] hover:bg-[#eee] dark:hover:bg-[#444] dark:hover:text-white transition-colors"
                    style={{ fontFamily: FONT }}
                  >
                    MAX
                  </button>
                </div>

                {/* Minimum warning */}
                {depositAmount && parseFloat(depositAmount) < getMinDeposit(selectedChain.chainId) && (
                  <p className="mt-1.5 text-[10px] font-semibold text-amber-600 px-1" style={{ fontFamily: FONT }}>
                    Minimum ${getMinDeposit(selectedChain.chainId)} USDC{selectedChain.chainId === 1 ? ' for Ethereum' : ''} required
                  </p>
                )}

                {/* Fee info */}
                <div className="mt-2 flex items-center justify-between text-[9px] text-[#9ca3af] px-1">
                  <span style={{ fontFamily: FONT }}>{selectedChain.name} → Hyperliquid · {selectedChain.chainId === 42161 ? 'instant' : '~30-90s'}</span>
                  {selectedChain.chainId !== 42161 && <span style={{ fontFamily: FONT }}>Fee ~$0.10</span>}
                </div>
              </div>
            )}

            {/* Action button / Progress */}
            <div className="px-5 pb-5">
              {flowState !== 'idle' && flowState !== 'error' ? (
                <div className="flex flex-col items-center gap-3 py-3">
                  {flowState === 'done' ? (
                    <>
                      <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-[13px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>Deposit Complete!</span>
                      <button
                        onClick={() => { setModalOpen(false); setFlowState('idle'); }}
                        className="w-full h-10 bg-[#1a1a1a] text-white text-[12px] font-bold rounded-[10px] hover:bg-[#333] transition-colors mt-1"
                        style={{ fontFamily: FONT }}
                      >
                        Done
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 border-[3px] border-[#e5e7eb] border-t-[#1a1a1a] rounded-full animate-spin" />
                      <span className="text-[12px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                        {stepMessage || 'Processing...'}
                      </span>
                      <span className="text-[10px] text-[#9ca3af]" style={{ fontFamily: FONT }}>
                        This may take a few seconds
                      </span>
                    </>
                  )}
                </div>
              ) : flowState === 'error' ? (
                <div className="flex flex-col items-center gap-2 py-2">
                  <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </div>
                  <span className="text-[11px] font-semibold text-rose-600 text-center" style={{ fontFamily: FONT }}>
                    {flowError === 'SHOW_DIRECT_LINK' ? 'Auto-deposit unavailable' : (flowError || 'Something went wrong')}
                  </span>
                  <div className="flex gap-2 w-full mt-1">
                    <button
                      onClick={() => { setFlowState('idle'); setFlowError(null); }}
                      className="flex-1 h-10 border border-[#e5e7eb] text-[#1a1a1a] text-[11px] font-bold rounded-[8px] hover:bg-[#f5f5f5] transition-colors"
                      style={{ fontFamily: FONT }}
                    >
                      Try Again
                    </button>
                    {flowError === 'SHOW_DIRECT_LINK' && (
                      <a
                        href="https://app.hyperliquid.xyz/portfolio"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 h-10 bg-[#1a1a1a] text-white text-[11px] font-bold rounded-[8px] hover:bg-[#333] transition-colors flex items-center justify-center gap-1.5"
                        style={{ fontFamily: FONT }}
                      >
                        Open Hyperliquid
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" /></svg>
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    const amt = parseFloat(depositAmount);
                    if (!amt || !selectedChain) return;
                    if (selectedChain.chainId === 42161) {
                      directDeposit(amt);
                    } else {
                      bridgeAndDeposit(selectedChain.chainId, selectedChain.usdcAddress, amt);
                    }
                  }}
                  disabled={!selectedChain || !depositAmount || parseFloat(depositAmount) < getMinDeposit(selectedChain?.chainId ?? 0) || parseFloat(depositAmount) > (selectedChain?.balance || 0)}
                  className="w-full h-11 bg-[#1a1a1a] text-white text-[13px] font-bold rounded-[10px] hover:bg-[#333] transition-colors active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ fontFamily: FONT }}
                >
                  {selectedChain?.chainId === 42161
                    ? `Add $${depositAmount || '0'} to Trading Account`
                    : `Add $${depositAmount || '0'} to Trading Account`
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
