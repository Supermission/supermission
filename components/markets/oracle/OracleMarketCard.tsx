'use client';

interface OracleMarketCardProps {
  markets: Array<{
    condition_id?: string;
    question: string;
    yes_price?: number;
    no_price?: number;
    outcome_prices?: number[];
    volume?: number;
    categories?: string[];
  }>;
}

function formatVol(v: number | undefined | null): string {
  if (v == null || v === 0) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function OracleMarketCard({ markets }: OracleMarketCardProps) {
  if (!markets.length) return null;

  return (
    <div className="flex flex-col gap-1.5 my-2">
      {markets.map((m, i) => {
        const yes = Math.round((m.yes_price ?? m.outcome_prices?.[0] ?? 0.5) * 100);
        const no = Math.round((m.no_price ?? m.outcome_prices?.[1] ?? 0.5) * 100);

        return (
          <div
            key={m.condition_id || i}
            className="border border-[#e5e7eb] rounded-[10px] px-3 py-2.5 bg-white"
          >
            <p
              className="text-[12px] font-semibold text-[#3a3a3a] leading-snug line-clamp-2"
              style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
            >
              {markets.length > 1 && (
                <span className="font-mono text-[10px] text-[#9ca3af] mr-1.5">{i + 1}.</span>
              )}
              {m.question}
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="font-mono text-[11px] font-bold text-emerald-600">YES {yes}%</span>
              <span className="font-mono text-[11px] font-bold text-rose-500">NO {no}%</span>
              {m.volume != null && (
                <span className="font-mono text-[10px] text-[#9ca3af]">{formatVol(m.volume)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
