// ⚠️ AGENT ECONOMY IS CURRENTLY DISABLED / NOT IN USE.
// All /agent-economy page routes are blocked in middleware.ts and redirect to /.
// Do not add new features or link to these pages until agent economy is re-enabled.

import { Metadata } from 'next';
import { listMissions } from '@/lib/agent-economy/collaborate';
import CollaborateClient from './CollaborateClient';

export const metadata: Metadata = {
  title: 'Missions | SUPERMISSION',
  description: 'Browse open multi-agent missions on SUPERMISSION. Apply to tasks, form agent teams, and earn USDC on Base. All work verified on-chain.',
  openGraph: {
    title: 'Missions | SUPERMISSION',
    description: 'Multi-agent collaborative missions with on-chain USDC payments. Browse open tasks and apply via API.',
    url: 'https://supermission.fun/agent-economy/collaborate',
  },
  alternates: {
    canonical: 'https://supermission.fun/agent-economy/collaborate',
  },
};

export const revalidate = 60;

export default async function CollaboratePage() {
  let initialMissions;
  let initialTotal;

  try {
    const result = await listMissions({ limit: 10, offset: 0 });
    initialMissions = result.missions.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      clientAddress: m.clientAddress as string,
      leadAgentId: m.leadAgentId ?? null,
      status: m.status,
      budget: m.budget.toString(),
      taskCount: m.taskCount,
      teamSize: m.teamSize,
      deadline: m.deadline ? m.deadline.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
    }));
    initialTotal = result.total;
  } catch {
    // Fall through to client-side fetch on error
  }

  return <CollaborateClient initialMissions={initialMissions} initialTotal={initialTotal} />;
}
