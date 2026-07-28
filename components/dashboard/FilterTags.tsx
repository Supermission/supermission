import { FILTER_OPTIONS } from "@/lib/utils/dashboard/constants";
import { FilterType, SubFilterType } from "@/lib/utils/dashboard/types";

const OTHER_SUB_TAGS: { label: string; value: Exclude<SubFilterType, null> }[] = [
  { label: 'TOKEN DD', value: 'token_analysis' },
  { label: 'IMAGE GEN', value: 'image_generation' },
  { label: 'CONTRACT AUDIT', value: 'audit' },
  { label: 'DEFI YIELD', value: 'defi_yield' },
  { label: 'WALLET INTEL', value: 'wallet_intelligence' },
];

interface FilterTagsProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  counts: Record<FilterType, number>;
  activeSubFilter?: SubFilterType;
  onSubFilterChange?: (subFilter: SubFilterType) => void;
  subFilterCounts?: Record<string, number>;
}

export function FilterTags({
  activeFilter,
  onFilterChange,
  counts,
  activeSubFilter,
  onSubFilterChange,
  subFilterCounts,
}: FilterTagsProps) {
  return (
    <div className="border border-black bg-[#f5f5f5]">
      <div className="p-3 flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => {
          const isActive = activeFilter === option.value;
          const count = counts[option.value] || 0;

          return (
            <button
              key={option.value}
              onClick={() => onFilterChange(option.value)}
              className={`
                px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide
                border transition-all duration-150
                flex items-center gap-2
                ${
                  isActive
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-neutral-600 border-neutral-300 hover:border-black hover:text-black'
                }
              `}
            >
              {option.label}
              <span
                className={`
                font-mono text-[10px] px-1.5 py-0.5 rounded-sm
                ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-neutral-100 text-neutral-500'
                }
              `}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sub-tags for Others */}
      {activeFilter === 'other' && (
        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
          {OTHER_SUB_TAGS.map((tag) => {
            const isActive = activeSubFilter === tag.value;
            const count = subFilterCounts?.[tag.value] ?? 0;

            return (
              <button
                key={tag.value}
                onClick={() => onSubFilterChange?.(isActive ? null : tag.value)}
                className={`
                  px-2 py-1 text-[9px] font-mono font-medium uppercase tracking-widest
                  border transition-all duration-150 flex items-center gap-1.5
                  ${
                    isActive
                      ? 'bg-black text-white border-black'
                      : 'bg-neutral-200 text-neutral-600 border-neutral-300 hover:border-black hover:text-black hover:bg-neutral-100'
                  }
                `}
              >
                {tag.label}
                <span
                  className={`
                    text-[8px] px-1 py-0.5 rounded-sm
                    ${isActive ? 'bg-white/20 text-white' : 'bg-neutral-300 text-neutral-500'}
                  `}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}