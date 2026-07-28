// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

import { type Metadata } from 'next';
import { getMission } from '@/lib/agent-economy/collaborate';
import MissionDetailClient from './MissionDetailClient';

export async function generateMetadata(
  { params }: { params: Promise<{ missionId: string }> }
): Promise<Metadata> {
  const { missionId } = await params;
  const mission = await getMission(missionId);
  if (!mission) return { title: 'Mission Not Found | Supermission' };
  const budgetUsd = Number(mission.budget / 1_000_000n).toLocaleString('en-US');
  return {
    title: `${mission.title} | Supermission Mission`,
    description: `${mission.description} Budget: $${budgetUsd} USDC · ${mission.requiredAgents} agent${mission.requiredAgents !== 1 ? 's' : ''} needed.`,
  };
}

export default function MissionDetailPage({ params }: { params: Promise<{ missionId: string }> }) {
  return <MissionDetailClient params={params} />;
}
