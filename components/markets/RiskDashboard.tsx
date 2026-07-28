'use client';

import { usePortfolioRisk } from '@/lib/hooks/use-portfolio-risk';
import ExposureChart from './ExposureChart';
import CorrelationMatrix from './CorrelationMatrix';

interface RiskDashboardProps {
  userAddress: string;
}

function SummaryCard({
  label,
  value,
  subtitle,
  valueColor,
}: {
  label: string;
  value: string;
  subtitle?: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-4">
      <div className="text-[#6b7280] text-xs mb-1">{label}</div>
      <div className={`text-xl font-mono font-bold ${valueColor || 'text-[#3a3a3a]'}`}>{value}</div>
      {subtitle && <div className="text-[#6b7280] text-xs mt-1">{subtitle}</div>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-4 animate-pulse">
      <div className="h-3 w-20 bg-[#f0f0f0] rounded mb-2" />
      <div className="h-6 w-28 bg-[#f0f0f0] rounded" />
    </div>
  );
}

function SkeletonBlock({ height }: { height: string }) {
  return (
    <div
      className="bg-white border border-[#e5e7eb] rounded-[12px] animate-pulse"
      style={{ height }}
    />
  );
}

export default function RiskDashboard({ userAddress }: RiskDashboardProps) {
  const { riskData, loading, error, refresh } = usePortfolioRisk(userAddress);

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#3a3a3a]">Portfolio Risk</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonBlock height="240px" />
          <SkeletonBlock height="240px" />
        </div>
        <SkeletonBlock height="200px" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-[12px] p-6 text-center">
        <div className="text-red-400 text-sm mb-2">Failed to load portfolio risk data</div>
        <div className="text-[#6b7280] text-xs mb-4">{error}</div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 text-xs bg-[#f8fafc] hover:bg-[#f0f0f0] text-[#6b7280] rounded-[8px] border border-[#e5e7eb] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (!riskData || riskData.positionCount === 0) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-8 text-center">
        <div className="text-[#6b7280] text-sm mb-1">No positions found</div>
        <div className="text-[#9ca3af] text-xs">
          Open positions on Polymarket to see your risk dashboard.
        </div>
      </div>
    );
  }

  const hhiLabel =
    riskData.concentrationIndex > 0.5
      ? 'High'
      : riskData.concentrationIndex > 0.25
        ? 'Medium'
        : 'Low';

  const hhiColor =
    riskData.concentrationIndex > 0.5
      ? 'text-red-400'
      : riskData.concentrationIndex > 0.25
        ? 'text-amber-400'
        : 'text-emerald-400';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#3a3a3a]">Portfolio Risk</h2>
        <button
          onClick={refresh}
          className="px-3 py-1.5 text-xs bg-[#f8fafc] hover:bg-[#f0f0f0] text-[#6b7280] rounded-[8px] border border-[#e5e7eb] transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Top row: Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Total Value"
          value={`$${riskData.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <SummaryCard
          label="Positions"
          value={String(riskData.positionCount)}
        />
        <SummaryCard
          label="Max Drawdown"
          value={`-$${riskData.maxDrawdown.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle="If all positions go to 0"
          valueColor="text-red-400"
        />
        <SummaryCard
          label="Concentration (HHI)"
          value={riskData.concentrationIndex.toFixed(3)}
          subtitle={hhiLabel}
          valueColor={hhiColor}
        />
      </div>

      {/* Middle row: Exposure chart + Correlation matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-4">
          <h3 className="text-sm font-medium text-[#3a3a3a] mb-3">Category Exposure</h3>
          <ExposureChart exposure={riskData.categoryExposure} />
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-4">
          <h3 className="text-sm font-medium text-[#3a3a3a] mb-3">Correlation Matrix</h3>
          <CorrelationMatrix
            positions={riskData.positions}
            correlations={riskData.correlationMatrix}
          />
        </div>
      </div>

      {/* Bottom: Position table */}
      <div className="bg-white border border-[#e5e7eb] rounded-[12px] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e5e7eb]">
          <h3 className="text-sm font-medium text-[#3a3a3a]">Positions by Weight</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#6b7280] text-xs border-b border-[#e5e7eb]">
                <th className="text-left px-4 py-2 font-medium">Market</th>
                <th className="text-left px-4 py-2 font-medium">Outcome</th>
                <th className="text-right px-4 py-2 font-medium">Size</th>
                <th className="text-right px-4 py-2 font-medium">Entry</th>
                <th className="text-right px-4 py-2 font-medium">Current</th>
                <th className="text-right px-4 py-2 font-medium">PnL</th>
                <th className="text-left px-4 py-2 font-medium">Category</th>
                <th className="text-right px-4 py-2 font-medium">Weight</th>
              </tr>
            </thead>
            <tbody>
              {riskData.positions.map((pos) => {
                const pnlColor = pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400';
                const pnlAmount = `${pos.pnl >= 0 ? '+' : '-'}$${Math.abs(pos.pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                return (
                  <tr
                    key={`${pos.conditionId}-${pos.outcome}`}
                    className="border-b border-[#e5e7eb] hover:bg-[#f7f7f7] transition-colors"
                  >
                    <td className="px-4 py-2.5 text-[#3a3a3a] max-w-[200px] truncate" title={pos.question}>
                      {pos.question}
                    </td>
                    <td className="px-4 py-2.5 text-[#6b7280]">{pos.outcome}</td>
                    <td className="px-4 py-2.5 text-right text-[#3a3a3a] font-mono">
                      {pos.size.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#6b7280] font-mono">
                      ${pos.entryPrice.toFixed(3)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#3a3a3a] font-mono">
                      ${pos.currentPrice.toFixed(3)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono ${pnlColor}`}>
                      {pnlAmount}
                    </td>
                    <td className="px-4 py-2.5 text-[#6b7280] text-xs">{pos.category}</td>
                    <td className="px-4 py-2.5 text-right text-[#6b7280] font-mono">
                      {(pos.weight * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
