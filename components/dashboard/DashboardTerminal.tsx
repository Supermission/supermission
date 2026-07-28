'use client';

import { useUIStore } from '@/lib/store/ui';
import { usePrivy } from '@privy-io/react-auth';
import { useMultiWallet } from '@/lib/contexts/MultiWalletContext';
import { ErrorBoundary } from './shared/ErrorBoundary';
import { Wallet } from 'lucide-react';
import { Address } from 'viem';
import dynamic from 'next/dynamic';

// Lazy load tab components for better initial load performance
const CombinedOverview = dynamic(() => import('./overview/CombinedOverview').then(mod => ({ default: mod.CombinedOverview })), {
  loading: () => <ComponentSkeleton />
});
const WalletAnalysisCard = dynamic(() => import('./wallet/WalletAnalysisCard').then(mod => ({ default: mod.WalletAnalysisCard })), {
  loading: () => <ComponentSkeleton />
});
const TokenList = dynamic(() => import('./tokens/TokenList').then(mod => ({ default: mod.TokenList })), {
  loading: () => <ComponentSkeleton />
});
const PositionsPanel = dynamic(() => import('./defi/PositionsPanel').then(mod => ({ default: mod.PositionsPanel })), {
  loading: () => <ComponentSkeleton />
});
const DelphiTradeHistory = dynamic(() => import('./delphi/DelphiTradeHistory').then(mod => ({ default: mod.DelphiTradeHistory })), {
  loading: () => <ComponentSkeleton />
});
const TradingActivity = dynamic(() => import('./activity/TradingActivity').then(m => ({ default: m.TradingActivity })), {
  ssr: false,
  loading: () => <ComponentSkeleton />
});

// Loading skeleton for lazy loaded components
function ComponentSkeleton() {
  return (
    <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-gray-200 rounded w-1/4" />
        <div className="space-y-3">
          <div className="h-3 bg-gray-200 rounded w-full" />
          <div className="h-3 bg-gray-200 rounded w-5/6" />
          <div className="h-3 bg-gray-200 rounded w-4/6" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardTerminal() {
  const activeTab = useUIStore((s) => s.dashboardTab);
  // usePrivy().authenticated is the single gate — no need for wagmi's useAccount().isConnected
  // since the embedded wallet is managed entirely by Privy
  const { ready, authenticated } = usePrivy();
  const { activeWallet } = useMultiWallet();

  // Show loading state while Privy initializes
  if (!ready) {
    return (
      <div className="container mx-auto p-6">
        <div className="max-w-2xl mx-auto mt-20">
          <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-12 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-3 h-3 border-2 border-[#e5e7eb] border-t-[#6b7280] rounded-full animate-spin" />
              <span className="text-[11px] font-semibold text-[#6b7280] tracking-wider uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                Loading dashboard
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show connect prompt when not authenticated (Privy is the auth source of truth)
  if (!authenticated) {
    return (
      <div className="container mx-auto p-6">
        <div className="max-w-2xl mx-auto mt-20">
          <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
            {/* Header with gradient */}
            <div className="relative bg-gradient-to-br from-violet-50 via-blue-50 to-cyan-50 p-8 border-b border-[#e5e7eb]">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-blue-500 rounded-[12px] flex items-center justify-center shadow-lg">
                  <Wallet className="text-white" size={28} strokeWidth={2} />
                </div>
              </div>
              <h2 className="text-lg font-bold text-center text-[#3a3a3a] mb-2 tracking-tight" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                Connect Your Wallet
              </h2>
              <p className="text-[12px] text-center text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                Access Portfolio Analytics
              </p>
            </div>

            {/* Content */}
            <div className="p-8 text-center space-y-6">
              <div className="space-y-3">
                <div className="flex items-start gap-3 text-left">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 flex-shrink-0" />
                  <p className="text-sm text-[#48484b]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    Real-time token balances and portfolio tracking
                  </p>
                </div>
                <div className="flex items-start gap-3 text-left">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                  <p className="text-sm text-[#48484b]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    AI-powered DeFi strategies and insights
                  </p>
                </div>
                <div className="flex items-start gap-3 text-left">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-1.5 flex-shrink-0" />
                  <p className="text-sm text-[#48484b]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    Yield opportunities and risk analytics
                  </p>
                </div>
              </div>

              <div className="pt-4">
                <p className="text-[11px] text-[#6b7280]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                  Click "Connect Wallet" in the header to begin
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 pb-20 md:pb-6">
      {/* Tab Content */}
      {activeTab === 'overview' && (
        <ErrorBoundary feature="Overview">
          <OverviewTab address={activeWallet} />
        </ErrorBoundary>
      )}

      {activeTab === 'tokens' && (
        <ErrorBoundary feature="Tokens">
          <TokensTab address={activeWallet} />
        </ErrorBoundary>
      )}
    </div>
  );
}

// Overview Tab - Combined portfolio + wallet + analysis + DeFi positions
function OverviewTab({ address }: { address: string | undefined }) {
  return (
    <div className="space-y-6">
      <ErrorBoundary feature="Combined Overview">
        <CombinedOverview address={address as Address} />
      </ErrorBoundary>
      {/* PositionsPanel + WalletAnalysis moved to modals in CombinedOverview */}
      {/* DelphiTradeHistory replaced by TradingActivity below */}
      <ErrorBoundary feature="Trading Activity">
        <TradingActivity address={address} />
      </ErrorBoundary>
    </div>
  );
}

// Tokens Tab - FREE token search + PREMIUM due diligence
function TokensTab({ address }: { address: string | undefined }) {
  return (
    <ErrorBoundary feature="Token Search">
      <TokenList />
    </ErrorBoundary>
  );
}

