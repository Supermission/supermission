import { useState, useMemo } from 'react';
import { MissionCard, FilterType, SubFilterType } from '@/lib/utils/dashboard/types';

export function useCardFilter(cards: MissionCard[]) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('prediction_market');
  const [activeSubFilter, setActiveSubFilter] = useState<SubFilterType>(null);

  const filteredCards = useMemo(() => {
    if (activeFilter === 'prediction_market') {
      return cards.filter((c) => c.type === 'prediction_market');
    }
    
    // 'other' filter - if sub-filter is active, filter by specific type
    if (activeSubFilter) {
      return cards.filter((c) => c.type === activeSubFilter);
    }
    
    // No sub-filter, show all 'other' types
    return cards.filter((c) =>
      c.type === 'token_analysis' ||
      c.type === 'image_generation' ||
      c.type === 'audit' ||
      c.type === 'defi_yield' ||
      c.type === 'wallet_intelligence' ||
      c.type === 'other'
    );
  }, [cards, activeFilter, activeSubFilter]);

  const filterCounts = useMemo(() => {
    const counts: Record<FilterType, number> = {
      prediction_market: cards.filter((c) => c.type === 'prediction_market').length,
      other: cards.filter((c) =>
        c.type === 'token_analysis' ||
        c.type === 'image_generation' ||
        c.type === 'audit' ||
        c.type === 'defi_yield' ||
        c.type === 'wallet_intelligence' ||
        c.type === 'other'
      ).length,
    };
    return counts;
  }, [cards]);

  const subFilterCounts = useMemo(() => {
    return {
      token_analysis: cards.filter((c) => c.type === 'token_analysis').length,
      image_generation: cards.filter((c) => c.type === 'image_generation').length,
      audit: cards.filter((c) => c.type === 'audit').length,
      defi_yield: cards.filter((c) => c.type === 'defi_yield').length,
      wallet_intelligence: cards.filter((c) => c.type === 'wallet_intelligence').length,
    };
  }, [cards]);

  // Reset sub-filter when main filter changes
  const handleFilterChange = (filter: FilterType) => {
    setActiveFilter(filter);
    setActiveSubFilter(null);
  };

  return {
    activeFilter,
    setActiveFilter: handleFilterChange,
    activeSubFilter,
    setActiveSubFilter,
    filteredCards,
    filterCounts,
    subFilterCounts,
  };
}