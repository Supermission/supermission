import { useQuery } from '@tanstack/react-query';
import { fetchTopHolders } from '@/lib/polymarket/api';
import type { Holder } from '@/lib/polymarket/api';

export interface EnrichedHolder extends Holder {
  totalVolume?: number;
}

interface UseTopHoldersResult {
  holders: EnrichedHolder[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTopHolders(conditionId: string): UseTopHoldersResult {
  const { data, isLoading, error, refetch } = useQuery<EnrichedHolder[], Error>({
    queryKey: ['top-holders', conditionId],
    queryFn: async () => {
      const raw = await fetchTopHolders(conditionId);
      return raw as EnrichedHolder[];
    },
    enabled: !!conditionId,
  });

  return {
    holders: data ?? [],
    loading: isLoading,
    error: error ? error.message : null,
    refresh: () => { refetch(); },
  };
}
