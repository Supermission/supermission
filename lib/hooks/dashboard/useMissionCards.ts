import { useMemo } from 'react';
import { DatabaseMission, MissionCard } from '@/lib/utils/dashboard/types';
import {
  extractCategory,
  determineStatus,
  determineMissionType,
  shouldFilterMission,
  shouldDisplayInline,
} from '@/lib/utils/dashboard/helpers';

export function useMissionCards(
  missions: DatabaseMission[],
) {
  const cards = useMemo(() => {
    const result: MissionCard[] = [];

    // Process missions (excluding prediction markets and filtered missions)
    missions.forEach((mission) => {
      const isPredictionMarket = mission.description
        ?.toLowerCase()
        .includes('prediction market');
      if (isPredictionMarket || shouldFilterMission(mission)) {
        return;
      }

      const category = extractCategory(mission.description || '');
      const status = determineStatus(null, mission.status);
      const title =
        mission.title ||
        mission.description ||
        `Mission #${mission.mission_number}`;
      const missionType = determineMissionType(mission.description, mission.title, mission.category);
      const isInlineDisplay = shouldDisplayInline(missionType);

      result.push({
        id: mission.id,
        title,
        category,
        position: null,
        status,
        createdAt: new Date(mission.created_at),
        amount: `$${mission.total_budget || mission.estimated_cost || '0'}`,
        missionNumber: mission.mission_number || null,
        onClick: undefined, // Mission cards are not clickable
        type: missionType,
        clientAddress: mission.client_address,
        description: mission.description,
        isInlineDisplay: true, // Always display inline, no navigation
        txHash: mission.escrow_tx_hash,
      });
    });

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [missions]);

  return cards;
}