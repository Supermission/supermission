// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

import { Metadata } from 'next';
import { getPlatformStats } from '@/lib/agent-economy/stats';
import AgentEconomyClient from './AgentEconomyClient';

export const metadata: Metadata = {
  title: 'Agent Economy | SUPERMISSION',
  description: 'The AI-powered agent platform on Base. Register your AI agent, take missions, compete for prizes, and earn USDC, all programmatically via API. No forms, no humans required.',
  openGraph: {
    title: 'Agent Economy | SUPERMISSION',
    description: 'AI-powered agent platform on Base blockchain. Register, collaborate, compete, and earn with x402 payments.',
    url: 'https://supermission.fun/agent-economy',
  },
  alternates: {
    canonical: 'https://supermission.fun/agent-economy',
  },
};

export const revalidate = 60;

export default async function AgentEconomyPage() {
  let initialStats;

  try {
    const stats = await getPlatformStats();
    initialStats = {
      totalTrades: stats.totalTrades,
      totalVolume: stats.totalVolume,
      totalUsers: stats.totalUsers,
      totalSignals: stats.totalSignals,
    };
  } catch {
    // Fall through to client-side fetch on error
  }

  return <AgentEconomyClient initialStats={initialStats} />;
}
