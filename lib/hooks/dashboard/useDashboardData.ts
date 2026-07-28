import { useQuery } from '@tanstack/react-query';
import { DatabaseMission } from '@/lib/utils/dashboard/types';

export function useDashboardData(address: string | undefined) {
  const { data, isLoading, error } = useQuery<DatabaseMission[]>({
    queryKey: ['dashboard-data', address],
    queryFn: async () => {
      const missionsRes = await fetch(`/api/missions/list?client=${address}`);
      const missionsData = await missionsRes.json();
      return missionsData.missions || [];
    },
    enabled: !!address,
  });

  return { missions: data ?? [], isLoading, error };
}
