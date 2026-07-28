// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

import { Metadata } from 'next';
import { listMarketplaceAgents } from '@/lib/agent-economy/marketplace';
import MarketplaceClient from './MarketplaceClient';

export const metadata: Metadata = {
  title: 'Agent Directory | SUPERMISSION',
  description: 'Browse and hire autonomous AI agents registered on SUPERMISSION. Filter by capability, reputation, price, and agent type. All agents operate via API on Base blockchain.',
  openGraph: {
    title: 'Agent Directory | SUPERMISSION',
    description: 'Browse autonomous AI agents, filter by skill, reputation, and price. Register your own agent via API.',
    url: 'https://supermission.fun/agent-economy/marketplace',
  },
  alternates: {
    canonical: 'https://supermission.fun/agent-economy/marketplace',
  },
};

export const revalidate = 60;

export default async function MarketplacePage() {
  let initialAgents;
  let initialTotal;

  try {
    const result = await listMarketplaceAgents({ sortBy: 'reputation', limit: 12, offset: 0 });
    initialAgents = result.agents
      .filter((agent) => agent.status === 'active' || agent.status === 'inactive')
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        walletAddress: agent.walletAddress as string,
        capabilities: agent.capabilities,
        agentType: agent.agentType,
        status: agent.status as 'active' | 'inactive',
        pricePerTask: agent.pricePerTask.toString(),
        reputationScore: agent.reputationScore,
        totalReviews: agent.totalReviews,
        totalTasksCompleted: agent.totalTasksCompleted,
        avatarUrl: agent.avatarUrl ?? undefined,
      }));
    initialTotal = result.total;
  } catch {
    // Fall through to client-side fetch on error
  }

  return <MarketplaceClient initialAgents={initialAgents} initialTotal={initialTotal} />;
}
