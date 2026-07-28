'use client';

const PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#a855f7', // purple
];

interface ExposureChartProps {
  exposure: { category: string; value: number; percentage: number }[];
}

export default function ExposureChart({ exposure }: ExposureChartProps) {
  if (!exposure || exposure.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[#6b7280] text-sm">
        No category exposure data
      </div>
    );
  }

  const totalPercentage = exposure.reduce((sum, e) => sum + e.percentage, 0);

  return (
    <div className="space-y-4">
      {/* Stacked horizontal bar */}
      <div className="w-full h-8 rounded-md overflow-hidden flex bg-[#f0f0f0]">
        {exposure.map((item, idx) => {
          const width = totalPercentage > 0 ? (item.percentage / totalPercentage) * 100 : 0;
          if (width < 0.5) return null;
          return (
            <div
              key={item.category}
              className="h-full relative group transition-opacity hover:opacity-80"
              style={{
                width: `${width}%`,
                backgroundColor: PALETTE[idx % PALETTE.length],
              }}
              title={`${item.category}: ${item.percentage.toFixed(1)}%`}
            >
              {width > 8 && (
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white truncate px-1">
                  {item.percentage.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Breakdown list */}
      <div className="space-y-2">
        {exposure.map((item, idx) => (
          <div key={item.category} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
              />
              <span className="text-[#3a3a3a] truncate">{item.category}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-2">
              <span className="text-[#6b7280] font-mono text-xs">
                ${item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[#9ca3af] font-mono text-xs w-12 text-right">
                {item.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
