import { useMemo } from 'react';
import { DatabaseMission, MissionCard, AnalyticsData } from '@/lib/utils/dashboard/types';

export function useAnalytics(
  missions: DatabaseMission[],
  cards: MissionCard[]
): AnalyticsData {
  return useMemo(() => {
    const totalInvested = missions.reduce((sum, m) => {
      const budget = parseFloat(String(m.total_budget || m.estimated_cost || '0')) || 0;
      return sum + budget;
    }, 0);

    const completedMissions = cards.filter((c) => c.status === 'completed');
    const executingMissions = cards.filter(
      (c) => c.status === 'executing' || c.status === 'pending'
    );

    // Note: Real P&L should be calculated from actual position data
    // This hook provides mission-based analytics only
    const totalProfit = 0;

    const winRate = cards.length > 0 ? (completedMissions.length / cards.length) * 100 : 0;

    return {
      totalInvested,
      totalProfit,
      winRate,
      executingCount: executingMissions.length,
      completedCount: completedMissions.length,
    };
  }, [missions, cards]);
}
