'use client';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

const bg = { fontFamily: "'Bricolage Grotesque', sans-serif", fontVariationSettings: "'opsz' 14, 'wdth' 100" } as const;

export function Pagination({ currentPage, totalPages, onPageChange, isLoading }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-3 pt-8">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1 || isLoading}
        className="px-5 py-2.5 border border-[#e7e9eb] rounded-[8px] text-[14px] font-medium text-[#3a3a3a] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#f1f3f4] hover:border-[#d1d5db]"
        style={bg}
      >
        Previous
      </button>

      <span className="px-4 py-2.5 text-[14px] font-medium text-[#6b7280]" style={bg}>
        {currentPage} of {totalPages}
      </span>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages || isLoading}
        className="px-5 py-2.5 border border-[#e7e9eb] rounded-[8px] text-[14px] font-medium text-[#3a3a3a] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#f1f3f4] hover:border-[#d1d5db]"
        style={bg}
      >
        Next
      </button>
    </div>
  );
}
