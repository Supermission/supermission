'use client';

import { useState, useMemo } from 'react';

interface RiskPosition {
  conditionId: string;
  question: string;
  outcome: string;
  size: number;
  currentPrice: number;
  entryPrice: number;
  pnl: number;
  category: string;
  weight: number;
}

interface CorrelationPair {
  marketA: string;
  marketB: string;
  correlation: number;
}

interface CorrelationMatrixProps {
  positions: RiskPosition[];
  correlations: CorrelationPair[];
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '\u2026';
}

function getCorrelationColor(value: number): string {
  // green for negative (hedge), white for 0, red for positive (concentrated)
  const intensity = Math.min(Math.abs(value), 1);
  if (value < 0) {
    // green: from transparent to full green
    const g = Math.round(180 * intensity);
    const r = Math.round(40 * intensity);
    const b = Math.round(80 * intensity);
    return `rgba(${r}, ${g}, ${b}, ${0.2 + intensity * 0.7})`;
  } else if (value > 0) {
    // red: from transparent to full red
    const r = Math.round(220 * intensity);
    const g = Math.round(50 * intensity);
    const b = Math.round(50 * intensity);
    return `rgba(${r}, ${g}, ${b}, ${0.2 + intensity * 0.7})`;
  }
  return 'rgba(255, 255, 255, 0.05)';
}

export default function CorrelationMatrix({ positions, correlations }: CorrelationMatrixProps) {
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

  // Take top 10 positions by weight
  const topPositions = useMemo(() => {
    return [...positions]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);
  }, [positions]);

  // Build a lookup map for correlations: key = "conditionIdA:conditionIdB" -> correlation
  const correlationMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const pair of correlations) {
      map.set(`${pair.marketA}:${pair.marketB}`, pair.correlation);
      map.set(`${pair.marketB}:${pair.marketA}`, pair.correlation);
    }
    return map;
  }, [correlations]);

  function getCorrelation(i: number, j: number): number {
    if (i === j) return 1.0;
    const idA = topPositions[i].conditionId;
    const idB = topPositions[j].conditionId;
    return correlationMap.get(`${idA}:${idB}`) ?? 0;
  }

  if (!topPositions.length) {
    return (
      <div className="flex items-center justify-center h-full text-[#6b7280] text-sm">
        No positions for correlation analysis
      </div>
    );
  }

  const cellSize = topPositions.length <= 5 ? 48 : 36;

  return (
    <div className="space-y-2 overflow-x-auto">
      {positions.length > 10 && (
        <p className="text-xs text-[#6b7280]">Showing top 10 positions by weight</p>
      )}

      <div className="inline-block">
        {/* Header row with position labels */}
        <div className="flex" style={{ marginLeft: `${120}px` }}>
          {topPositions.map((pos, idx) => (
            <div
              key={pos.conditionId}
              className="text-[#6b7280] text-[10px] leading-tight overflow-hidden flex-shrink-0"
              style={{
                width: `${cellSize}px`,
                height: '60px',
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
                padding: '2px',
              }}
              title={pos.question}
            >
              {truncateText(pos.question, 20)}
            </div>
          ))}
        </div>

        {/* Matrix rows */}
        {topPositions.map((rowPos, rowIdx) => (
          <div key={rowPos.conditionId} className="flex items-center">
            {/* Row label */}
            <div
              className="text-[#6b7280] text-[10px] truncate flex-shrink-0 pr-2 text-right"
              style={{ width: '120px' }}
              title={rowPos.question}
            >
              {truncateText(rowPos.question, 18)}
            </div>

            {/* Cells */}
            {topPositions.map((colPos, colIdx) => {
              const corr = getCorrelation(rowIdx, colIdx);
              const isHovered =
                hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx;
              const isDiagonal = rowIdx === colIdx;

              return (
                <div
                  key={colPos.conditionId}
                  className="flex-shrink-0 flex items-center justify-center border border-[#e5e7eb] cursor-default relative"
                  style={{
                    width: `${cellSize}px`,
                    height: `${cellSize}px`,
                    backgroundColor: isDiagonal
                      ? 'rgba(255, 255, 255, 0.1)'
                      : getCorrelationColor(corr),
                  }}
                  onMouseEnter={() => setHoveredCell({ row: rowIdx, col: colIdx })}
                  onMouseLeave={() => setHoveredCell(null)}
                >
                  {isDiagonal && (
                    <span className="text-[#6b7280] text-[10px] font-mono">1.0</span>
                  )}
                  {isHovered && !isDiagonal && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/90 text-[#3a3a3a] text-[10px] font-mono z-10">
                      {corr.toFixed(2)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-[#6b7280] pt-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(40, 180, 80, 0.8)' }} />
          <span>Negative (hedge)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
          <span>Neutral</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(220, 50, 50, 0.8)' }} />
          <span>Positive (concentrated)</span>
        </div>
      </div>
    </div>
  );
}
