'use client';

/**
 * MarketsDepositBanner
 *
 * Deposit modal for /markets — bridges USDC from Base/Arbitrum/Ethereum
 * to Polygon pUSD for Polymarket trading. Same UX pattern as PerpsDepositBanner.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useUIStore } from '@/lib/store/ui';
import { usePrivy, useWallets, useSendTransaction as usePrivySendTransaction, useConnectWallet } from '@privy-io/react-auth';
import { useUsdcBalances } from '@/lib/hooks/use-usdc-balances';
import { toast } from 'sonner';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useLifiSwap } from '@/lib/hooks/use-uniswap-swap';
import { BaseIcon, PolygonIcon, EthereumIcon, ArbitrumIcon } from '@/components/dashboard/shared/ChainIcons';
import { QRCodeSVG } from 'qrcode.react';
import { createPublicClient, createWalletClient, custom, http, encodeFunctionData, parseUnits, formatUnits, erc20Abi } from 'viem';
import { polygon } from 'viem/chains';
import { wrapUsdcEToPusd, POLYGON_USDC, type PrivySendTransactionFn } from '@/lib/polymarket/trade-utils';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";
const MONO = "var(--font-jetbrains-mono), monospace";

const USDC_POLYGON_BRIDGED = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const;
const USDC_POLYGON_NATIVE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as const;
const MIN_DEPOSIT = 1;

const USDC_ADDRESSES: Record<number, string> = {
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
};

type FlowState = 'idle' | 'bridging' | 'waiting' | 'done' | 'error';

const ChainIcon = ({ chainId, size = 16 }: { chainId: number; size?: number }) => {
  if (chainId === 8453) return <BaseIcon size={size} />;
  if (chainId === 137) return <PolygonIcon size={size} />;
  if (chainId === 1) return <EthereumIcon size={size} />;
  if (chainId === 42161) return <ArbitrumIcon size={size} />;
  return null;
};

export default function MarketsDepositBanner() {
  const marketsDarkMode = useUIStore((s) => s.marketsDarkMode);
  const { ready, authenticated } = usePrivy();
  const { paymentAddress } = usePaymentWallet();
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const { fetchQuote, executeSwap } = useLifiSwap();
  const { sendTransaction } = usePrivySendTransaction();

  const [modalOpen, setModalOpen] = useState(false);
  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [flowError, setFlowError] = useState<string | null>(null);
  const [stepMessage, setStepMessage] = useState('');
  const flowAbortRef = useRef(false);

  const [selectedChain, setSelectedChain] = useState<{ chainId: number; name: string; balance: number; usdcAddress: string } | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [showQr, setShowQr] = useState(false);

  // External wallet (non-embedded) flow
  const [extAmount, setExtAmount] = useState('');
  const [extBalance, setExtBalance] = useState<number | null>(null);
  const [extBalanceLoading, setExtBalanceLoading] = useState(false);
  const [extSending, setExtSending] = useState(false);
  const externalWallet = wallets.find(
    (w) => w.walletClientType !== 'privy' && paymentAddress && w.address.toLowerCase() !== paymentAddress.toLowerCase(),
  );

  // Listen for external trigger (from TradingBalancePill)
  useEffect(() => {
    const handler = () => setModalOpen(true);
    window.addEventListener('open-markets-deposit', handler);
    return () => window.removeEventListener('open-markets-deposit', handler);
  }, []);

  // Balances — single consolidated poll instead of 4 separate wagmi hooks
  const { baseUsdc, polyPusd, polyBridgedUsdc, arbUsdc, ethUsdc } = useUsdcBalances(paymentAddress ?? undefined);
  const polyUsdc = (polyPusd || 0) + (polyBridgedUsdc || 0);

  const chains = [
    { chainId: 8453, name: 'Base', balance: baseUsdc, usdcAddress: USDC_ADDRESSES[8453] },
    { chainId: 42161, name: 'Arbitrum', balance: arbUsdc, usdcAddress: USDC_ADDRESSES[42161] },
    { chainId: 1, name: 'Ethereum', balance: ethUsdc, usdcAddress: USDC_ADDRESSES[1] },
  ].sort((a, b) => b.balance - a.balance);

  // Polygon pUSD is the destination — show it separately as "already available"
  const hasPolyBalance = polyUsdc >= MIN_DEPOSIT;

  const getEmbedded = useCallback(() => wallets.find(w => w.walletClientType === 'privy'), [wallets]);

  // Bridge to Polygon
  const bridgeToPolygon = useCallback(async (sourceChainId: number, usdcAddress: string, amount: number) => {
    const embedded = getEmbedded();
    if (!embedded || !paymentAddress) {
      toast.error('Wallet not available');
      return;
    }

    flowAbortRef.current = false;
    setFlowState('bridging');
    setFlowError(null);
    setStepMessage(`Bridging $${amount.toFixed(2)} USDC to Polygon...`);

    try {
      const quote = await fetchQuote({
        tokenIn: usdcAddress,
        tokenOut: USDC_POLYGON_BRIDGED,
        amountIn: amount.toFixed(6),
        decimalsIn: 6,
        decimalsOut: 6,
        chainId: sourceChainId as 8453 | 137 | 1,
        toChainId: 137,
        slippageBps: 50,
      });

      if (!quote || !quote.methodParameters) {
        throw new Error('Could not get bridge quote. Try again.');
      }

      if (flowAbortRef.current) return;

      await executeSwap(
        {
          tokenIn: usdcAddress,
          tokenOut: USDC_POLYGON_BRIDGED,
          amountIn: amount.toFixed(6),
          decimalsIn: 6,
          decimalsOut: 6,
          chainId: sourceChainId as 8453 | 137 | 1,
          toChainId: 137,
          slippageBps: 50,
        },
        quote,
      );

      if (flowAbortRef.current) return;

      setFlowState('waiting');
      setStepMessage('Waiting for USDC to arrive on Polygon...');

      // Poll for USDC.e arrival (bridge deposits USDC.e)
      await new Promise(r => setTimeout(r, 10_000));

      if (flowAbortRef.current) return;

      // Auto-wrap USDC.e → pUSD so trades work instantly
      setStepMessage('Converting to pUSD for trading...');
      try {
        const wrapAmount = BigInt(Math.floor(amount * 1e6));
        await wrapUsdcEToPusd(
          paymentAddress,
          wrapAmount,
          sendTransaction as unknown as PrivySendTransactionFn,
        );
      } catch (wrapErr) {
        console.warn('[Deposit] Auto-wrap failed (will retry at trade time):', wrapErr);
      }

      setFlowState('done');
      setStepMessage('Deposit complete — ready to trade!');
      toast.success(`Deposited $${amount.toFixed(2)} pUSD to Polygon`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bridge failed';
      setFlowState('error');
      setFlowError(msg);
      toast.error(msg);
    }
  }, [getEmbedded, paymentAddress, fetchQuote, executeSwap]);

  // Read the external wallet's Polygon pUSD balance whenever it connects or the modal opens
  useEffect(() => {
    if (!modalOpen || !externalWallet) {
      setExtBalance(null);
      return;
    }
    let cancelled = false;
    setExtBalanceLoading(true);
    const client = createPublicClient({ chain: polygon, transport: http() });
    client
      .readContract({
        address: USDC_POLYGON_BRIDGED,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [externalWallet.address as `0x${string}`],
      })
      .then((raw) => {
        if (cancelled) return;
        const n = parseFloat(formatUnits(raw as bigint, 6));
        setExtBalance(n);
        setExtAmount(n > 0 ? (Math.floor(n * 100) / 100).toFixed(2) : '');
      })
      .catch(() => !cancelled && setExtBalance(0))
      .finally(() => !cancelled && setExtBalanceLoading(false));
    return () => {
      cancelled = true;
    };
  }, [modalOpen, externalWallet]);

  const sendFromExternal = useCallback(async () => {
    if (!externalWallet || !paymentAddress) return;
    const amount = parseFloat(extAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter an amount');
      return;
    }
    if (extBalance !== null && amount > extBalance) {
      toast.error('Amount exceeds external wallet balance');
      return;
    }

    setExtSending(true);
    try {
      // Make sure the external wallet is on Polygon before signing
      try {
        await externalWallet.switchChain(polygon.id);
      } catch {
        // Some wallets won't need an explicit switch — proceed and let the signer reject if it can't
      }

      const provider = await externalWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: externalWallet.address as `0x${string}`,
        chain: polygon,
        transport: custom(provider),
      });

      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [paymentAddress as `0x${string}`, parseUnits(amount.toFixed(6), 6)],
      });

      const hash = await walletClient.sendTransaction({
        to: USDC_POLYGON_BRIDGED,
        data,
        value: 0n,
      });

      toast.success(`Sent $${amount.toFixed(2)} USDC.e — converting to pUSD...`);

      // Wait for on-chain confirmation
      const publicClient = createPublicClient({ chain: polygon, transport: http() });
      await publicClient.waitForTransactionReceipt({ hash });

      // Auto-wrap USDC.e → pUSD for instant trading
      try {
        const wrapAmount = parseUnits(amount.toFixed(6), 6);
        await wrapUsdcEToPusd(
          paymentAddress,
          wrapAmount,
          sendTransaction as unknown as PrivySendTransactionFn,
        );
        toast.success('pUSD ready — you can trade instantly');
      } catch (wrapErr) {
        console.warn('[Deposit] Auto-wrap failed (will retry at trade time):', wrapErr);
        toast.success('Funds arrived — will convert to pUSD on first trade');
      }
      setExtAmount('');
      window.dispatchEvent(new Event('trade-completed'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transfer failed';
      toast.error(msg);
    } finally {
      setExtSending(false);
    }
  }, [externalWallet, paymentAddress, extAmount, extBalance]);

  if (!ready || !authenticated || !paymentAddress) return null;

  return (
    <>
      {/* Deposit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { if (flowState === 'idle' || flowState === 'done' || flowState === 'error') setModalOpen(false); }}
          />

          <div className="relative bg-white rounded-[14px] border border-black/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.12)] w-full max-w-[420px] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f0f0]">
              <h2 className="text-[15px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                Polymarket Trading Account
              </h2>
              <button
                onClick={() => { if (flowState === 'idle' || flowState === 'done' || flowState === 'error') { setModalOpen(false); setFlowState('idle'); setSelectedChain(null); } }}
                className="w-7 h-7 flex items-center justify-center rounded-[6px] hover:bg-[#f5f5f5] transition-colors text-[#9ca3af]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Trading balance */}
            {flowState === 'idle' && (
              <div className="px-5 pt-4">
                <div className="text-center pb-4 border-b border-[#f0f0f0]">
                  <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider" style={{ fontFamily: FONT }}>
                    Available for Trading
                  </span>
                  <div className="mt-1.5 flex items-center justify-center gap-2">
                    <img src="/tokens/polymarket.png" alt="" width={20} height={20} className="rounded-full" />
                    <span className={`text-[28px] font-bold tabular-nums ${polyUsdc > 0 ? 'text-[#1a1a1a]' : 'text-[#9ca3af]'}`} style={{ fontFamily: FONT }}>
                      ${polyUsdc.toFixed(2)}
                    </span>
                  </div>
                  {polyUsdc < 1 && (
                    <p className="text-[10px] text-amber-600 font-medium mt-1" style={{ fontFamily: FONT }}>
                      Fund your account to start trading on Polymarket
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Add funds section */}
            {flowState === 'idle' && !selectedChain && (
              <div className="px-5 pt-3 pb-3">
                {chains.filter(c => c.balance > 0.01).length > 0 ? (
                  <>
                    <label className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-2" style={{ fontFamily: FONT }}>
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
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-[8px] bg-white border border-[#e5e7eb] hover:border-[#1a1a1a] transition-all text-left"
                        >
                          <div className="flex items-center gap-2.5">
                            <ChainIcon chainId={c.chainId} size={18} />
                            <span className="text-[13px] font-semibold text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                              {c.name} USDC
                            </span>
                          </div>
                          <span className="text-[13px] font-bold text-[#1a1a1a] tabular-nums" style={{ fontFamily: FONT }}>
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
                <div className="mt-3 pt-3 border-t border-[#f0f0f0]">
                  <label className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-2" style={{ fontFamily: FONT }}>
                    Or from an external wallet
                  </label>
                  <div className="rounded-[8px] border border-[#e5e7eb] overflow-hidden">
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <div className="w-[18px] h-[18px] rounded-full bg-[#f0f0f0] flex items-center justify-center flex-shrink-0">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a1 1 0 100 2 1 1 0 000-2z" /></svg>
                      </div>
                      <span className="text-[13px] font-semibold text-[#1a1a1a] flex-1" style={{ fontFamily: FONT }}>
                        {externalWallet
                          ? `${externalWallet.address.slice(0, 6)}…${externalWallet.address.slice(-4)}`
                          : 'External Wallet'}
                      </span>
                      {!externalWallet ? (
                        <button
                          onClick={() => connectWallet()}
                          className="text-[11px] font-semibold text-[#1a1a1a] px-2.5 py-1 rounded-[6px] border border-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-colors cursor-pointer"
                          style={{ fontFamily: FONT }}
                        >
                          Connect
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold tabular-nums text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                          {extBalanceLoading ? '…' : `$${(extBalance ?? 0).toFixed(2)}`}
                        </span>
                      )}
                    </div>

                    {/* Direct send form — appears when an external wallet is connected */}
                    {externalWallet && (
                      <div className="border-t border-[#f0f0f0] px-3 py-2.5 space-y-2 bg-[#fafbfc]">
                        <div className="flex items-center gap-2 border border-[#e5e7eb] rounded-[8px] px-3 py-2 bg-white focus-within:border-[#1a1a1a] transition-colors">
                          <span className="text-[12px] text-[#9ca3af] font-semibold">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={extAmount}
                            onChange={(e) => setExtAmount(e.target.value)}
                            min={0.01}
                            max={extBalance ?? undefined}
                            step="0.01"
                            placeholder="0.00"
                            disabled={extSending}
                            className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-semibold text-[#1a1a1a] tabular-nums placeholder:text-[#d1d5db]"
                            style={{ fontFamily: FONT }}
                          />
                          {extBalance !== null && extBalance > 0 && (
                            <button
                              type="button"
                              onClick={() => setExtAmount((Math.floor(extBalance * 100) / 100).toFixed(2))}
                              disabled={extSending}
                              className="text-[10px] font-bold text-[#9ca3af] hover:text-[#1a1a1a] transition-colors"
                              style={{ fontFamily: FONT }}
                            >
                              MAX
                            </button>
                          )}
                        </div>
                        <button
                          onClick={sendFromExternal}
                          disabled={
                            extSending ||
                            !extAmount ||
                            parseFloat(extAmount) <= 0 ||
                            (extBalance !== null && parseFloat(extAmount) > extBalance)
                          }
                          className="w-full py-2 rounded-[8px] bg-[#1a1a1a] text-white text-[12px] font-semibold hover:bg-[#2a2a2a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ fontFamily: FONT }}
                        >
                          {extSending
                            ? 'Sending…'
                            : extAmount
                              ? `Send $${parseFloat(extAmount || '0').toFixed(2)} pUSD to Trading`
                              : 'Enter an amount'}
                        </button>
                        <p className="text-[10px] text-[#9ca3af] text-center" style={{ fontFamily: FONT }}>
                          Sends pUSD on Polygon from your connected wallet.
                        </p>
                      </div>
                    )}
                    {/* Copy + Show QR buttons */}
                    <div className={`flex border-t ${marketsDarkMode ? 'border-white/[0.08]' : 'border-[#f0f0f0]'}`}>
                      <button
                        onClick={() => {
                          if (!paymentAddress) return;
                          navigator.clipboard.writeText(paymentAddress);
                          toast.success('Deposit address copied', { duration: 3000 });
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors cursor-pointer ${marketsDarkMode ? 'text-[#aaa] hover:text-white hover:bg-white/[0.06]' : 'text-[#666] hover:text-[#1a1a1a] hover:bg-[#f9f9f9]'}`}
                        style={{ fontFamily: FONT }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                        Copy Address
                      </button>
                      <div className={`w-px ${marketsDarkMode ? 'bg-white/[0.08]' : 'bg-[#f0f0f0]'}`} />
                      <button
                        onClick={() => setShowQr(v => !v)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors cursor-pointer ${showQr ? (marketsDarkMode ? 'text-white bg-white/[0.08]' : 'text-[#1a1a1a] bg-[#f5f5f5]') : (marketsDarkMode ? 'text-[#aaa] hover:text-white hover:bg-white/[0.06]' : 'text-[#666] hover:text-[#1a1a1a] hover:bg-[#f9f9f9]')}`}
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
                          Send pUSD on Polygon to this address
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Withdraw / Move funds */}
                <div className="mt-3 pt-3 border-t border-[#f0f0f0]">
                  <label className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-2" style={{ fontFamily: FONT }}>
                    Withdraw or move funds
                  </label>
                  <div className="space-y-1.5">
                    <button
                      onClick={() => {
                        setModalOpen(false);
                        setTimeout(() => window.dispatchEvent(new CustomEvent('open-move-funds', { detail: { from: 'poly', to: 'base' } })), 150);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] border border-[#e5e7eb] hover:border-[#d1d5db] hover:bg-[#fafbfc] transition-all cursor-pointer"
                    >
                      <img src="/tokens/chain-base.png" alt="" width={18} height={18} className="rounded-full flex-shrink-0" />
                      <span className="text-[13px] font-semibold text-[#1a1a1a] flex-1 text-left" style={{ fontFamily: FONT }}>
                        Withdraw to Wallet
                      </span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                    <button
                      onClick={() => {
                        setModalOpen(false);
                        setTimeout(() => window.dispatchEvent(new CustomEvent('open-move-funds', { detail: { from: 'poly', to: 'hl' } })), 150);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] border border-[#e5e7eb] hover:border-[#d1d5db] hover:bg-[#fafbfc] transition-all cursor-pointer"
                    >
                      <img src="/tokens/chain-hyperliquid.png" alt="" width={18} height={18} className="rounded-full flex-shrink-0" />
                      <span className="text-[13px] font-semibold text-[#1a1a1a] flex-1 text-left" style={{ fontFamily: FONT }}>
                        Move to Hyperliquid
                      </span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Amount input — shown after selecting a source chain */}
            {selectedChain && flowState === 'idle' && (
              <div className="px-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider" style={{ fontFamily: FONT }}>
                    Amount from {selectedChain.name}
                  </label>
                  <button
                    onClick={() => { setSelectedChain(null); setDepositAmount(''); }}
                    className="text-[9px] font-bold text-[#9ca3af] hover:text-[#1a1a1a] transition-colors"
                    style={{ fontFamily: FONT }}
                  >
                    Change
                  </button>
                </div>
                <div className="flex items-center gap-2 border border-[#e5e7eb] rounded-[8px] px-3 py-2 focus-within:border-[#1a1a1a] transition-colors">
                  <span className="text-[13px] text-[#9ca3af] font-semibold">$</span>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    min={MIN_DEPOSIT}
                    max={selectedChain.balance}
                    step="0.01"
                    className="flex-1 text-[15px] font-bold text-[#1a1a1a] bg-transparent outline-none tabular-nums"
                    style={{ fontFamily: FONT }}
                    placeholder="0.00"
                  />
                  <button
                    onClick={() => setDepositAmount(String(Math.floor(selectedChain.balance * 100) / 100))}
                    className="text-[10px] font-bold text-[#1a1a1a] bg-[#f5f5f5] px-2 py-1 rounded-[4px] hover:bg-[#eee] transition-colors"
                    style={{ fontFamily: FONT }}
                  >
                    MAX
                  </button>
                </div>

                {/* Fee info */}
                <div className="mt-2 flex items-center justify-between text-[9px] text-[#9ca3af] px-1">
                  <span style={{ fontFamily: FONT }}>{selectedChain.name} → Polygon · ~30-90s</span>
                  <span style={{ fontFamily: FONT }}>Fee ~$0.10</span>
                </div>
              </div>
            )}

            {/* Action / Progress */}
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
                      <span className="text-[13px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>Bridge Complete!</span>
                      <span className="text-[10px] text-[#9ca3af]" style={{ fontFamily: FONT }}>pUSD is now available on Polygon for trading</span>
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
                      <div className="w-8 h-8 border-[3px] border-[#e5e7eb] border-t-[#8247E5] rounded-full animate-spin" />
                      <span className="text-[12px] font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                        {stepMessage || 'Processing...'}
                      </span>
                      <span className="text-[10px] text-[#9ca3af]" style={{ fontFamily: FONT }}>
                        This may take 30-90 seconds
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
                    {flowError || 'Something went wrong'}
                  </span>
                  <button
                    onClick={() => { setFlowState('idle'); setFlowError(null); }}
                    className="w-full h-10 border border-[#e5e7eb] text-[#1a1a1a] text-[11px] font-bold rounded-[8px] hover:bg-[#f5f5f5] transition-colors mt-1"
                    style={{ fontFamily: FONT }}
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    const amt = parseFloat(depositAmount);
                    if (!amt || !selectedChain) return;
                    bridgeToPolygon(selectedChain.chainId, selectedChain.usdcAddress, amt);
                  }}
                  disabled={!selectedChain || !depositAmount || parseFloat(depositAmount) < MIN_DEPOSIT || parseFloat(depositAmount) > (selectedChain?.balance || 0)}
                  className="w-full h-11 bg-[#1a1a1a] text-white text-[13px] font-bold rounded-[10px] hover:bg-[#333] transition-colors active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ fontFamily: FONT }}
                >
                  Add ${depositAmount || '0'} to Trading Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
