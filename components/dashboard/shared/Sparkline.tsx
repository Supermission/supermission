'use client';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
}

/**
 * Lightweight SVG sparkline chart.
 * Green if last > first, red otherwise. No axes or labels.
 */
export function Sparkline({ data, width = 80, height = 24 }: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height}>
        <line
          x1={0} y1={height / 2}
          x2={width} y2={height / 2}
          stroke="rgba(0,0,0,0.1)"
          strokeWidth={1}
          strokeDasharray="2,2"
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const padding = 2;
  const chartHeight = height - padding * 2;
  const stepX = width / (data.length - 1);

  const points = data
    .map((val, i) => {
      const x = i * stepX;
      const y = padding + chartHeight - ((val - min) / range) * chartHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const isPositive = data[data.length - 1] >= data[0];
  const color = isPositive ? '#16a34a' : '#dc2626';

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
