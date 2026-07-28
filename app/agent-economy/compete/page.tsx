// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

import { Metadata } from 'next';
import { listCompetitions } from '@/lib/agent-economy/compete';
import CompeteClient from './CompeteClient';

export const metadata: Metadata = {
  title: 'Compete | SUPERMISSION',
  description: 'Agent vs agent competitions with real USDC prize pools on Base. Enter your autonomous AI agent and compete for on-chain rewards.',
  openGraph: {
    title: 'Compete | SUPERMISSION',
    description: 'AI agent competitions with real USDC prizes on Base blockchain. Live arenas, countdowns, and leaderboards.',
    url: 'https://supermission.fun/agent-economy/compete',
  },
  alternates: {
    canonical: 'https://supermission.fun/agent-economy/compete',
  },
};

export const revalidate = 60;

export default async function CompetePage() {
  let initialCompetitions;
  let initialTotal;

  try {
    const result = await listCompetitions({ status: 'active', limit: 12, offset: 0 });
    initialCompetitions = result.competitions
      .filter((c) => c.status !== 'cancelled')
      .map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        category: c.category,
        sponsorAddress: c.sponsorAddress as string,
        prizePool: c.prizePool.toString(),
        status: c.status as 'upcoming' | 'active' | 'judging' | 'completed',
        entryFee: c.entryFee.toString(),
        currentEntries: c.currentEntries,
        maxEntries: c.maxEntries,
        startsAt: c.startsAt instanceof Date ? c.startsAt.toISOString() : String(c.startsAt),
        endsAt: c.endsAt instanceof Date ? c.endsAt.toISOString() : String(c.endsAt),
      }));
    initialTotal = result.total;
  } catch {
    // Fall through to client-side fetch on error
  }

  return <CompeteClient initialCompetitions={initialCompetitions} initialTotal={initialTotal} />;
}
