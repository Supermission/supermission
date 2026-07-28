'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { WithdrawModal } from './WithdrawModal';
import { useUsdcBalances } from '@/lib/hooks/use-usdc-balances';

export function WalletBalancePanel() {
  const { address } = useAccount();
  const { paymentAddress, isReady: isWalletReady, walletType } = usePaymentWallet();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);

  // Use payment address for balance - same as navbar
  const displayAddress = paymentAddress || address;

  // Consolidated balance hook — single API call for all chains
  const { baseUsdc, polyPusd, polyBridgedUsdc, polyNativeUsdc, robinhoodUsdg, isLoading: isLoadingBalances } = useUsdcBalances(displayAddress);
  const polyUsdc = (polyPusd || 0) + polyNativeUsdc + polyBridgedUsdc;

  // If no wallet connected, show nothing
  if (!isWalletReady) {
    return null;
  }

  return (
    <>
      {/* Balance Button - Opens Modal */}
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 h-11 sm:h-10 rounded-[8px] bg-white sm:bg-gray-50 hover:bg-gradient-to-b hover:from-[#1a1a1a] hover:to-[#3b3b3b] hover:text-white sm:hover:bg-gray-100 sm:hover:text-current border border-[#e5e7eb] transition-all duration-200 group"
      >
        <div className="w-2 h-2 rounded-full bg-green-500"></div>
        <div className="flex items-center gap-1">
          <span className="font-semibold text-sm text-current sm:text-gray-900 group-hover:text-current font-mono">
            {isLoadingBalances ? (
                      <span className="inline-block w-12 h-3.5 rounded bg-current opacity-10 animate-pulse" />
                    ) : `$${(baseUsdc + polyUsdc + robinhoodUsdg).toFixed(2)}`}
          </span>
          <span className="text-[10px] text-current opacity-70 sm:text-[#6b7280] sm:opacity-100 group-hover:text-current group-hover:opacity-70">USDC</span>
        </div>
      </button>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white border border-[#e5e7eb] rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] max-w-lg w-full overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white p-4 flex items-center justify-between">
              <h2
                className="font-bold text-sm tracking-wide text-white"
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                Payment Wallet
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="hover:opacity-70 transition-opacity"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Wallet Type Badge */}
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 text-[10px] font-semibold bg-blue-50 text-blue-700 rounded-[8px]">
                  Privy Embedded Wallet
                </span>
              </div>

              {/* Wallet Address */}
              <div>
                <p
                  className="text-[11px] text-[#6b7280] mb-2 tracking-wide"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  Wallet Address
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-[#f8fafc] px-3 py-2 flex-1 truncate border border-[#e5e7eb] rounded-[8px]">
                    {displayAddress}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(displayAddress || '');
                    }}
                    className="p-2 hover:bg-[#f8fafc] transition-colors border border-[#e5e7eb] bg-white rounded-[8px]"
                    title="Copy address"
                  >
                    <svg className="w-5 h-5 text-[#48484b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Balance */}
              <div className="border border-[#e5e7eb] p-4 bg-white rounded-[16px]">
                <div className="flex items-center gap-1.5 mb-2">
                  <p
                    className="text-[11px] text-[#6b7280] tracking-wide"
                    style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                  >
                    Total USDC Balance
                  </p>
                  {/* Info icon with tooltip */}
                  <div className="relative group/tooltip inline-flex">
                    <span className="w-3 h-3 inline-flex items-center justify-center text-[8px] text-[#6b7280] border border-[#6b7280] rounded-full cursor-help leading-none">i</span>
                    {/* Tooltip */}
                    <div className="absolute left-0 bottom-full mb-2 w-64 p-3 bg-[#1a1a1a] text-white text-xs rounded-[8px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 z-10">
                      <p className="font-bold mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>How to Fund Your Wallet</p>
                      <p className="text-gray-300 mb-2">Send USDC on Base or Polygon to your wallet address above.</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold">1</span>
                          <span>Copy your wallet address</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
                          <span>Send USDC from Coinbase, Binance, or any exchange</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold">3</span>
                          <span>Select Base or Polygon network</span>
                        </div>
                      </div>
                      {/* Tooltip arrow */}
                      <div className="absolute left-3 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#1a1a1a]"></div>
                    </div>
                  </div>
                </div>
                <p className="font-bold text-3xl text-[#3a3a3a] font-mono">
                  {isLoadingBalances ? (
                      <span className="inline-block w-12 h-3.5 rounded bg-current opacity-10 animate-pulse" />
                    ) : `$${(baseUsdc + polyUsdc + robinhoodUsdg).toFixed(2)}`}
                </p>
                <div className="mt-3 space-y-1 text-xs text-[#6b7280] font-mono">
                  <div className="flex justify-between">
                    <span>Base USDC</span>
                    <span>${baseUsdc.toFixed(2)}</span>
                  </div>
                  {polyPusd > 0 && (
                    <div className="flex justify-between">
                      <span>Polymarket <span className="text-[9px] text-[#a1a1aa]">pUSD</span></span>
                      <span>${polyPusd.toFixed(2)}</span>
                    </div>
                  )}
                  {polyBridgedUsdc > 0 && (
                    <div className="flex justify-between">
                      <span>Polygon USDC.e <span className="text-[9px] text-[#a1a1aa]">(Wrappable)</span></span>
                      <span>${polyBridgedUsdc.toFixed(2)}</span>
                    </div>
                  )}
                  {polyNativeUsdc > 0 && (
                    <div className="flex justify-between">
                      <span>Polygon USDC</span>
                      <span>${polyNativeUsdc.toFixed(2)}</span>
                    </div>
                  )}
                  {robinhoodUsdg > 0 && (
                    <div className="flex justify-between">
                      <span>Robinhood Chain USDG</span>
                      <span>${robinhoodUsdg.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Bridge nudge — shown when Polygon USDC.e is low but Base has funds */}
                {baseUsdc > 5 && polyBridgedUsdc < 10 && (
                  <div className="mt-3 pt-3 border-t border-[#e5e7eb]">
                    <div className="flex items-start gap-2 text-[11px] text-[#6b7280]">
                      <span className="text-amber-500 mt-px flex-shrink-0">&#9889;</span>
                      <p>
                        Polymarket trades need pUSD on Polygon. Ask Delphi to bridge your Base USDC — it auto-converts to pUSD for trading.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setIsWithdrawModalOpen(true)}
                  className="flex-1 py-2.5 border border-[#e5e7eb] bg-white text-[#3a3a3a] text-[11px] font-semibold tracking-wide hover:bg-gradient-to-b hover:from-[#1a1a1a] hover:to-[#3b3b3b] hover:text-white transition-colors rounded-[8px]"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  Withdraw
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
      />
    </>
  );
}
