'use client';

import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { base } from 'wagmi/chains';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chain } = useAccount();
  const chainId = chain?.id;
  const { switchChain } = useSwitchChain();
  const pathname = usePathname();
  const [isWrongNetwork, setIsWrongNetwork] = useState(false);
  const [currentChainId, setCurrentChainId] = useState<number | undefined>();
  const [isSwitching, setIsSwitching] = useState(false);

  const handleSwitchNetwork = async (targetChainId: number) => {
    try {
      setIsSwitching(true);
      await switchChain({ chainId: targetChainId as 8453 });

      // OPTIMIZATION: Wait for wagmi state to update after switch
      // This prevents race condition where UI doesn't update immediately
      await new Promise(resolve => setTimeout(resolve, 500));

      // Force state update by setting isWrongNetwork to false if switch succeeded
      if (chainId === targetChainId) {
        setIsWrongNetwork(false);
      }
    } catch (error) {
      console.error('Failed to switch network:', error);
      alert(`Failed to switch network. Please try switching manually in your wallet.\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSwitching(false);
    }
  };

  useEffect(() => {
    if (isConnected && chainId) {
      setCurrentChainId(chainId);

      // Home page is excluded from network checks (works on any network)
      // All other pages require Base Mainnet
      const isExcludedPage = pathname === '/' || pathname.includes("/chat") || pathname.includes("/defai");

      if (isExcludedPage) {
        setIsWrongNetwork(false);
      } else {
        setIsWrongNetwork(chainId !== base.id);
      }
    } else {
      setIsWrongNetwork(false);
      setCurrentChainId(undefined);
    }
  }, [isConnected, chainId, pathname]);

  if (!isConnected) {
    return <>{children}</>;
  }

  if (isWrongNetwork) {
    // All pages (except home and NFT) require Base Mainnet
    const requiredChainId = base.id;
    const requiredNetworkName = 'Base Mainnet';
    const switchButtonText = 'Switch to Base';
    const description = 'SUPERMISSION only works on Base Mainnet';

    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full border border-[#e5e7eb] p-8 bg-amber-50/50 rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4 font-bold text-[#3a3a3a]">!</div>
            <h2
              className="font-bold text-2xl mb-2 text-[#3a3a3a]"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              Wrong Network
            </h2>
            <p className="text-sm text-[#6b7280]">
              {description}
            </p>
          </div>

          <div className="space-y-4">
            <div className="border border-[#e5e7eb] p-4 bg-white rounded-[16px]">
              <p
                className="text-xs mb-2 text-[#6b7280]"
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                Current Network:
              </p>
              <p className="font-bold text-lg text-[#3a3a3a]">
                {currentChainId === 1 ? 'Ethereum Mainnet' :
                 currentChainId === 8453 ? 'Base Mainnet' :
                 `Chain ID: ${currentChainId}`}
              </p>
            </div>

            <div className="border border-[#e5e7eb] p-4 bg-white rounded-[16px]">
              <p
                className="text-xs mb-2 text-[#6b7280]"
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                Required Network:
              </p>
              <p className="font-bold text-lg text-[#3a3a3a]">{requiredNetworkName}</p>
            </div>

            <Button
              onClick={() => handleSwitchNetwork(requiredChainId)}
              disabled={isSwitching}
              className="w-full h-12 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] hover:opacity-90 text-white border border-[#e5e7eb] font-semibold text-sm tracking-wide transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-[8px]"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              {isSwitching ? 'Switching...' : switchButtonText}
            </Button>

            <p className="text-center text-xs text-[#6b7280]">
              Make sure you have ETH on Base for gas fees.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
