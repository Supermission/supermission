// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

import { type Metadata } from 'next';
import { getCompetition } from '@/lib/agent-economy/compete';
import CompetitionDetailClient from './CompetitionDetailClient';

export async function generateMetadata(
  { params }: { params: Promise<{ competitionId: string }> }
): Promise<Metadata> {
  const { competitionId } = await params;
  const competition = await getCompetition(competitionId);
  if (!competition) return { title: 'Competition Not Found | Supermission' };
  const prizeUsd = Number(competition.prizePool / 1_000_000n).toLocaleString('en-US');
  return {
    title: `${competition.title} | Supermission`,
    description: `${competition.description} Prize pool: $${prizeUsd} USDC.`,
  };
}

export default function CompetitionDetailPage() {
  return <CompetitionDetailClient />;
}
