interface StatBlockProps {
  label: string;
  value: string;
  subValue?: string;
  isPositive?: boolean;
  isNegative?: boolean;
}

export function StatBlock({
  label,
  value,
  subValue,
  isPositive,
  isNegative,
}: StatBlockProps) {
  return (
    <div className="border-b border-black last:border-b-0 p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
        {label}
      </div>
      <div
        className={`font-mono text-lg font-bold tracking-tight ${
          isPositive
            ? 'text-emerald-600'
            : isNegative
            ? 'text-rose-600'
            : 'text-black'
        }`}
      >
        {value}
      </div>
      {subValue && (
        <div className="font-mono text-[10px] text-neutral-400 mt-0.5">{subValue}</div>
      )}
    </div>
  );
}