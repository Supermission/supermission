import { AnalyticsData } from '@/lib/utils/dashboard/types';
import { StatBlock } from './StatBlock';

interface AnalyticsSidebarProps {
  analytics: AnalyticsData;
  walletBalance: string;
  isLoading: boolean;
}

export function AnalyticsSidebar({
  analytics,
  walletBalance,
  isLoading,
}: AnalyticsSidebarProps) {
  const profitValue = analytics.totalProfit;
  const isProfit = profitValue > 0;
  const isLoss = profitValue < 0;

  return (
    <div className="border border-black bg-[#f5f5f5] h-fit sticky top-24">
      {/* Header */}
      <div className="border-b border-black p-3 bg-black text-white">
        <h2 className="font-black text-xs uppercase tracking-wide">ANALYTICS</h2>
      </div>

      {/* Stats */}
      <StatBlock
        label="Total Invested"
        value={isLoading ? '---' : `$${analytics.totalInvested.toFixed(2)}`}
        subValue={`${analytics.executingCount + analytics.completedCount} markets`}
      />

      <StatBlock
        label="Profit / Loss"
        value={isLoading ? '---' : `${isProfit ? '+' : ''}$${profitValue.toFixed(2)}`}
        isPositive={isProfit}
        isNegative={isLoss}
      />

      <StatBlock
        label="Wallet Balance"
        value={isLoading ? '---' : walletBalance}
        subValue="USDC"
      />

      <StatBlock
        label="Win Rate"
        value={isLoading ? '---' : `${analytics.winRate.toFixed(0)}%`}
        subValue={`${analytics.completedCount} completed`}
      />

      {/* Mini Status Breakdown */}
      <div className="p-3 border-t border-black bg-neutral-50">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] uppercase text-neutral-500">Markets</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-400 border border-black"></div>
              <span className="font-mono text-[10px] uppercase">Executing</span>
            </div>
            <span className="font-mono text-xs font-bold">
              {analytics.executingCount}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 border border-black"></div>
              <span className="font-mono text-[10px] uppercase">Completed</span>
            </div>
            <span className="font-mono text-xs font-bold">
              {analytics.completedCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
