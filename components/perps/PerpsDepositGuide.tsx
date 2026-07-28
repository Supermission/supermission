'use client';

/**
 * PerpsDepositGuide
 *
 * Shows when user connects wallet but has no Hyperliquid balance.
 * Checks Arbitrum USDC balance and HL clearinghouse state,
 * then guides the user through the deposit flow.
 */

import { useEffect, useState } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

// Arbitrum USDC contract
const ARB_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;

// ERC-20 balanceOf ABI
const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

type GuideState = 'loading' | 'ready' | 'need-deposit' | 'need-usdc';

interface PerpsDepositGuideProps {
  walletAddress: string;
  hlEquity?: number;
}

export function PerpsDepositGuide({ walletAddress, hlEquity }: PerpsDepositGuideProps) {
  const [state, setState] = useState<GuideState>('loading');
  const [arbUsdcBalance, setArbUsdcBalance] = useState<string>('0');
  const [hlBalance, setHlBalance] = useState<string>('0');

  useEffect(() => {
    if (!walletAddress) return;

    let cancelled = false;

    async function checkBalances() {
      setState('loading');

      try {
        // Check Arbitrum USDC balance
        const client = createPublicClient({
          chain: arbitrum,
          transport: http(httpRpcUrl('arbitrum')),
        });

        const usdcRaw = await client.readContract({
          address: ARB_USDC_ADDRESS,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`],
        });

        const usdcFormatted = formatUnits(usdcRaw, 6);

        if (cancelled) return;
        setArbUsdcBalance(usdcFormatted);

        // Check HL balance (passed as prop or default to 0)
        const hlBal = hlEquity ?? 0;
        setHlBalance(hlBal.toFixed(2));

        if (hlBal > 0) {
          setState('ready');
        } else if (parseFloat(usdcFormatted) > 0) {
          setState('need-deposit');
        } else {
          setState('need-usdc');
        }
      } catch (err) {
        console.error('[DepositGuide] Error checking balances:', err);
        // Default to need-usdc state if we can't check
        if (!cancelled) setState('need-usdc');
      }
    }

    checkBalances();
    return () => { cancelled = true; };
  }, [walletAddress, hlEquity]);

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#e5e7eb] border-t-[#1a1a1a] rounded-full animate-spin" />
          <span className="text-xs text-[#9ca3af]" style={{ fontFamily: FONT }}>
            Checking balances...
          </span>
        </div>
      </div>
    );
  }

  if (state === 'ready') {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="bg-white border border-[#d1fae5] rounded-2xl px-6 py-5 max-w-sm w-full text-center shadow-sm">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#d1fae5] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-[#1a1a1a] mb-1" style={{ fontFamily: FONT }}>
            Ready to trade
          </h3>
          <p className="text-sm text-[#059669] font-semibold" style={{ fontFamily: FONT }}>
            ${hlBalance} USDC on Hyperliquid
          </p>
        </div>
      </div>
    );
  }

  if (state === 'need-deposit') {
    return (
      <div className="flex items-center justify-center py-8 px-4">
        <div className="bg-white border border-[#e5e7eb] rounded-2xl px-6 py-6 max-w-sm w-full shadow-sm">
          <h3 className="text-base font-bold text-[#1a1a1a] mb-4 text-center" style={{ fontFamily: FONT }}>
            Deposit USDC to Hyperliquid
          </h3>

          <div className="space-y-4 mb-6">
            {/* Step 1 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#f5f3f0] flex items-center justify-center">
                <span className="text-xs font-bold text-[#1a1a1a]" style={{ fontFamily: FONT }}>1</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                  Arbitrum USDC detected
                </p>
                <p className="text-xs text-[#6b7280] mt-0.5">
                  ${parseFloat(arbUsdcBalance).toFixed(2)} USDC available
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#1a1a1a] flex items-center justify-center">
                <span className="text-xs font-bold text-white" style={{ fontFamily: FONT }}>2</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                  Bridge to Hyperliquid
                </p>
                <p className="text-xs text-[#6b7280] mt-0.5">
                  Deposit your USDC via the Hyperliquid app
                </p>
              </div>
            </div>
          </div>

          <a
            href="https://app.hyperliquid.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-3 px-4 bg-[#1a1a1a] text-white text-sm font-semibold rounded-xl hover:bg-[#333] transition-colors"
            style={{ fontFamily: FONT }}
          >
            Open Hyperliquid
            <svg className="inline-block ml-1.5 -mt-0.5" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>

          <p className="text-[10px] text-[#9ca3af] text-center mt-3" style={{ fontFamily: FONT }}>
            In-app bridge coming soon
          </p>
        </div>
      </div>
    );
  }

  // state === 'need-usdc'
  return (
    <div className="flex items-center justify-center py-8 px-4">
      <div className="bg-white border border-[#e5e7eb] rounded-2xl px-6 py-6 max-w-sm w-full shadow-sm">
        <h3 className="text-base font-bold text-[#1a1a1a] mb-4 text-center" style={{ fontFamily: FONT }}>
          Get USDC to start trading
        </h3>

        <div className="space-y-4 mb-6">
          {/* Step 1 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#1a1a1a] flex items-center justify-center">
              <span className="text-xs font-bold text-white" style={{ fontFamily: FONT }}>1</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1a1a1a]" style={{ fontFamily: FONT }}>
                Get USDC on Arbitrum
              </p>
              <p className="text-xs text-[#6b7280] mt-0.5">
                Purchase or bridge USDC to the Arbitrum network
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#f5f3f0] flex items-center justify-center">
              <span className="text-xs font-bold text-[#9ca3af]" style={{ fontFamily: FONT }}>2</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#9ca3af]" style={{ fontFamily: FONT }}>
                Deposit to Hyperliquid
              </p>
              <p className="text-xs text-[#9ca3af] mt-0.5">
                Bridge USDC from Arbitrum to Hyperliquid
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#f5f3f0] flex items-center justify-center">
              <span className="text-xs font-bold text-[#9ca3af]" style={{ fontFamily: FONT }}>3</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#9ca3af]" style={{ fontFamily: FONT }}>
                Start trading
              </p>
              <p className="text-xs text-[#9ca3af] mt-0.5">
                Trade 100+ perpetual futures with HYPERION
              </p>
            </div>
          </div>
        </div>

        <a
          href="https://app.hyperliquid.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center py-3 px-4 bg-[#1a1a1a] text-white text-sm font-semibold rounded-xl hover:bg-[#333] transition-colors"
          style={{ fontFamily: FONT }}
        >
          Open Hyperliquid
          <svg className="inline-block ml-1.5 -mt-0.5" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>
    </div>
  );
}
