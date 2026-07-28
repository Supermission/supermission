/**
 * Tests for agent economy overview aggregation logic.
 * Tests the logic from app/api/admin/agents/overview/route.ts
 */
import { describe, it, expect } from 'vitest';

// --- Agent aggregation ---

function aggregateAgents(agents: any[]) {
  const byType: Record<string, number> = { ai: 0, human: 0, hybrid: 0 };
  const byStatus: Record<string, number> = { active: 0, inactive: 0, suspended: 0, pending: 0 };
  let platformAgents = 0;
  let availableAgents = 0;
  let ratingSum = 0;
  let ratingCount = 0;

  for (const a of agents) {
    const t = (a.agent_type || '').toLowerCase();
    if (t in byType) byType[t]++;
    const s = (a.agent_status || '').toLowerCase();
    if (s in byStatus) byStatus[s]++;
    if (a.is_platform_agent) platformAgents++;
    if (a.is_available) availableAgents++;
    const r = Number(a.rating);
    if (r > 0) {
      ratingSum += r;
      ratingCount++;
    }
  }

  const avgRating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : 0;

  const topEarners = [...agents]
    .sort((a: any, b: any) => (Number(b.total_earnings) || 0) - (Number(a.total_earnings) || 0))
    .slice(0, 10)
    .map((a: any) => ({
      id: a.id,
      name: a.agent_name,
      earnings: Number(a.total_earnings) || 0,
      jobs: Number(a.jobs_completed) || 0,
      rating: Number(a.rating) || 0,
    }));

  return { total: agents.length, byType, byStatus, platformAgents, availableAgents, avgRating, topEarners };
}

describe('agent aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateAgents([]);
    expect(result.total).toBe(0);
    expect(result.byType).toEqual({ ai: 0, human: 0, hybrid: 0 });
    expect(result.byStatus).toEqual({ active: 0, inactive: 0, suspended: 0, pending: 0 });
    expect(result.platformAgents).toBe(0);
    expect(result.availableAgents).toBe(0);
    expect(result.avgRating).toBe(0);
    expect(result.topEarners).toEqual([]);
  });

  it('counts agents by type correctly', () => {
    const agents = [
      { agent_type: 'ai', agent_status: 'active', rating: 4, total_earnings: 100, is_platform_agent: false, is_available: true, jobs_completed: 5, id: '1', agent_name: 'A' },
      { agent_type: 'AI', agent_status: 'active', rating: 3, total_earnings: 50, is_platform_agent: false, is_available: false, jobs_completed: 2, id: '2', agent_name: 'B' },
      { agent_type: 'human', agent_status: 'inactive', rating: 5, total_earnings: 200, is_platform_agent: true, is_available: true, jobs_completed: 10, id: '3', agent_name: 'C' },
    ];
    const result = aggregateAgents(agents);
    expect(result.byType.ai).toBe(2);
    expect(result.byType.human).toBe(1);
    expect(result.byType.hybrid).toBe(0);
  });

  it('counts agents by status correctly', () => {
    const agents = [
      { agent_type: 'ai', agent_status: 'active', rating: 0, total_earnings: 0, is_platform_agent: false, is_available: false, jobs_completed: 0, id: '1', agent_name: 'A' },
      { agent_type: 'ai', agent_status: 'suspended', rating: 0, total_earnings: 0, is_platform_agent: false, is_available: false, jobs_completed: 0, id: '2', agent_name: 'B' },
      { agent_type: 'ai', agent_status: 'PENDING', rating: 0, total_earnings: 0, is_platform_agent: false, is_available: false, jobs_completed: 0, id: '3', agent_name: 'C' },
    ];
    const result = aggregateAgents(agents);
    expect(result.byStatus.active).toBe(1);
    expect(result.byStatus.suspended).toBe(1);
    expect(result.byStatus.pending).toBe(1);
  });

  it('unknown type/status is not counted (silently ignored)', () => {
    const agents = [
      { agent_type: 'bot', agent_status: 'unknown', rating: 0, total_earnings: 0, is_platform_agent: false, is_available: false, jobs_completed: 0, id: '1', agent_name: 'A' },
    ];
    const result = aggregateAgents(agents);
    expect(result.total).toBe(1);
    expect(result.byType.ai).toBe(0);
    expect(result.byType.human).toBe(0);
    expect(result.byType.hybrid).toBe(0);
    expect(result.byStatus.active).toBe(0);
  });

  it('computes average rating (only positive ratings)', () => {
    const agents = [
      { agent_type: 'ai', agent_status: 'active', rating: 4, total_earnings: 0, is_platform_agent: false, is_available: false, jobs_completed: 0, id: '1', agent_name: 'A' },
      { agent_type: 'ai', agent_status: 'active', rating: 0, total_earnings: 0, is_platform_agent: false, is_available: false, jobs_completed: 0, id: '2', agent_name: 'B' },
      { agent_type: 'ai', agent_status: 'active', rating: 5, total_earnings: 0, is_platform_agent: false, is_available: false, jobs_completed: 0, id: '3', agent_name: 'C' },
    ];
    const result = aggregateAgents(agents);
    expect(result.avgRating).toBe(4.5); // (4 + 5) / 2, rating=0 is excluded
  });

  it('top earners sorted by earnings desc, limited to 10', () => {
    const agents = Array.from({ length: 15 }, (_, i) => ({
      id: `${i}`, agent_name: `Agent ${i}`, agent_type: 'ai', agent_status: 'active',
      rating: 3, total_earnings: i * 10, is_platform_agent: false, is_available: true, jobs_completed: i,
    }));
    const result = aggregateAgents(agents);
    expect(result.topEarners).toHaveLength(10);
    expect(result.topEarners[0].earnings).toBe(140);
    expect(result.topEarners[9].earnings).toBe(50);
  });

  it('counts platform and available agents', () => {
    const agents = [
      { agent_type: 'ai', agent_status: 'active', rating: 0, total_earnings: 0, is_platform_agent: true, is_available: true, jobs_completed: 0, id: '1', agent_name: 'A' },
      { agent_type: 'ai', agent_status: 'active', rating: 0, total_earnings: 0, is_platform_agent: true, is_available: false, jobs_completed: 0, id: '2', agent_name: 'B' },
      { agent_type: 'ai', agent_status: 'active', rating: 0, total_earnings: 0, is_platform_agent: false, is_available: true, jobs_completed: 0, id: '3', agent_name: 'C' },
    ];
    const result = aggregateAgents(agents);
    expect(result.platformAgents).toBe(2);
    expect(result.availableAgents).toBe(2);
  });
});

// --- Mission aggregation ---

function aggregateMissions(missions: any[]) {
  const byStatus: Record<string, number> = { active: 0, in_progress: 0, completed: 0, cancelled: 0 };
  let totalBudget = 0;

  for (const m of missions) {
    const s = (m.status || '').toLowerCase();
    if (s in byStatus) byStatus[s]++;
    totalBudget += Number(m.budget) || 0;
  }

  return {
    total: missions.length,
    byStatus,
    totalBudget: Math.round(totalBudget * 100) / 100,
    avgBudget: missions.length > 0 ? Math.round((totalBudget / missions.length) * 100) / 100 : 0,
  };
}

describe('mission aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateMissions([]);
    expect(result.total).toBe(0);
    expect(result.totalBudget).toBe(0);
    expect(result.avgBudget).toBe(0);
  });

  it('counts statuses and budgets', () => {
    const missions = [
      { status: 'active', budget: 100 },
      { status: 'active', budget: 200 },
      { status: 'completed', budget: 150 },
      { status: 'cancelled', budget: 50 },
    ];
    const result = aggregateMissions(missions);
    expect(result.total).toBe(4);
    expect(result.byStatus.active).toBe(2);
    expect(result.byStatus.completed).toBe(1);
    expect(result.byStatus.cancelled).toBe(1);
    expect(result.totalBudget).toBe(500);
    expect(result.avgBudget).toBe(125);
  });

  it('handles string budgets', () => {
    const missions = [
      { status: 'active', budget: '99.99' },
    ];
    const result = aggregateMissions(missions);
    expect(result.totalBudget).toBe(99.99);
  });
});

// --- Task aggregation ---

function aggregateTasks(tasks: any[]) {
  const byStatus: Record<string, number> = { pending: 0, assigned: 0, in_progress: 0, submitted: 0, approved: 0, rejected: 0 };
  let totalRewards = 0;

  for (const t of tasks) {
    const s = (t.status || '').toLowerCase();
    if (s in byStatus) byStatus[s]++;
    totalRewards += Number(t.reward) || 0;
  }

  const completionRate = tasks.length > 0
    ? Math.round((byStatus.approved / tasks.length) * 10000) / 100
    : 0;

  return { total: tasks.length, byStatus, completionRate, totalRewards: Math.round(totalRewards * 100) / 100 };
}

describe('task aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateTasks([]);
    expect(result.total).toBe(0);
    expect(result.completionRate).toBe(0);
    expect(result.totalRewards).toBe(0);
  });

  it('computes completion rate as approved / total', () => {
    const tasks = [
      { status: 'approved', reward: 10 },
      { status: 'approved', reward: 20 },
      { status: 'rejected', reward: 5 },
      { status: 'pending', reward: 15 },
    ];
    const result = aggregateTasks(tasks);
    expect(result.completionRate).toBe(50); // 2/4 = 50%
    expect(result.totalRewards).toBe(50);
  });

  it('handles all statuses', () => {
    const tasks = [
      { status: 'pending', reward: 0 },
      { status: 'assigned', reward: 0 },
      { status: 'in_progress', reward: 0 },
      { status: 'submitted', reward: 0 },
      { status: 'approved', reward: 0 },
      { status: 'rejected', reward: 0 },
    ];
    const result = aggregateTasks(tasks);
    expect(result.byStatus).toEqual({ pending: 1, assigned: 1, in_progress: 1, submitted: 1, approved: 1, rejected: 1 });
  });
});

// --- Dispute aggregation ---

function aggregateDisputes(disputes: any[]) {
  const byType: Record<string, number> = { task_rejection: 0, payment: 0, quality: 0, communication: 0, deadline: 0, other: 0 };
  const byStatus: Record<string, number> = { open: 0, under_review: 0, resolved: 0, dismissed: 0, escalated: 0 };

  for (const d of disputes) {
    const dt = (d.dispute_type || '').toLowerCase();
    if (dt in byType) byType[dt]++;
    const ds = (d.status || '').toLowerCase();
    if (ds in byStatus) byStatus[ds]++;
  }

  return { total: disputes.length, open: byStatus.open, byType, byStatus };
}

describe('dispute aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateDisputes([]);
    expect(result.total).toBe(0);
    expect(result.open).toBe(0);
  });

  it('counts by type and status', () => {
    const disputes = [
      { dispute_type: 'payment', status: 'open' },
      { dispute_type: 'quality', status: 'open' },
      { dispute_type: 'payment', status: 'resolved' },
      { dispute_type: 'deadline', status: 'escalated' },
    ];
    const result = aggregateDisputes(disputes);
    expect(result.total).toBe(4);
    expect(result.open).toBe(2);
    expect(result.byType.payment).toBe(2);
    expect(result.byType.quality).toBe(1);
    expect(result.byType.deadline).toBe(1);
    expect(result.byStatus.resolved).toBe(1);
    expect(result.byStatus.escalated).toBe(1);
  });

  it('unknown dispute type is silently ignored', () => {
    const disputes = [
      { dispute_type: 'unknown_type', status: 'open' },
    ];
    const result = aggregateDisputes(disputes);
    expect(result.total).toBe(1);
    expect(result.byType.other).toBe(0);
    expect(result.open).toBe(1);
  });
});

// --- Competition aggregation ---

function aggregateCompetitions(competitions: any[]) {
  const byStatus: Record<string, number> = { upcoming: 0, active: 0, judging: 0, completed: 0, cancelled: 0 };
  let totalPrizePool = 0;

  for (const c of competitions) {
    const s = (c.status || '').toLowerCase();
    if (s in byStatus) byStatus[s]++;
    totalPrizePool += Number(c.prize_pool) || 0;
  }

  return { total: competitions.length, byStatus, totalPrizePool: Math.round(totalPrizePool * 100) / 100 };
}

describe('competition aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateCompetitions([]);
    expect(result.total).toBe(0);
    expect(result.totalPrizePool).toBe(0);
  });

  it('counts statuses and sums prize pools', () => {
    const competitions = [
      { status: 'active', prize_pool: 1000 },
      { status: 'completed', prize_pool: 500 },
      { status: 'upcoming', prize_pool: 2000 },
    ];
    const result = aggregateCompetitions(competitions);
    expect(result.total).toBe(3);
    expect(result.byStatus.active).toBe(1);
    expect(result.byStatus.completed).toBe(1);
    expect(result.byStatus.upcoming).toBe(1);
    expect(result.totalPrizePool).toBe(3500);
  });
});

// --- Health aggregation ---

function aggregateHealth(healthChecks: any[]) {
  const agentHealthMap = new Map<string, boolean>();
  const responseTimes: number[] = [];
  const recentFailures: any[] = [];

  const sorted = [...healthChecks].sort(
    (a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''),
  );

  for (const h of sorted) {
    if (!agentHealthMap.has(h.agent_id)) {
      agentHealthMap.set(h.agent_id, !!h.is_success);
    }
    const rt = Number(h.response_time_ms);
    if (rt > 0) responseTimes.push(rt);
    if (!h.is_success && recentFailures.length < 20) {
      recentFailures.push({
        agent_id: h.agent_id,
        status_code: h.status_code,
        response_time_ms: Number(h.response_time_ms) || 0,
        created_at: h.created_at,
      });
    }
  }

  let healthyAgents = 0;
  let unhealthyAgents = 0;
  for (const [, isHealthy] of agentHealthMap) {
    if (isHealthy) healthyAgents++;
    else unhealthyAgents++;
  }

  const avgResponseTime = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length)
    : 0;

  return { agentsChecked: agentHealthMap.size, healthyAgents, unhealthyAgents, avgResponseTime, recentFailures };
}

describe('health aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateHealth([]);
    expect(result.agentsChecked).toBe(0);
    expect(result.healthyAgents).toBe(0);
    expect(result.unhealthyAgents).toBe(0);
    expect(result.avgResponseTime).toBe(0);
    expect(result.recentFailures).toEqual([]);
  });

  it('determines agent health from latest check (sorted by created_at desc)', () => {
    const checks = [
      { agent_id: 'a1', is_success: true, response_time_ms: 100, created_at: '2026-01-02T00:00:00Z' },
      { agent_id: 'a1', is_success: false, response_time_ms: 500, created_at: '2026-01-01T00:00:00Z' }, // older, ignored for status
      { agent_id: 'a2', is_success: false, response_time_ms: 0, status_code: 500, created_at: '2026-01-02T00:00:00Z' },
    ];
    const result = aggregateHealth(checks);
    expect(result.agentsChecked).toBe(2);
    expect(result.healthyAgents).toBe(1); // a1 latest is success
    expect(result.unhealthyAgents).toBe(1); // a2
  });

  it('computes average response time from all checks', () => {
    const checks = [
      { agent_id: 'a1', is_success: true, response_time_ms: 100, created_at: '2026-01-01T00:00:00Z' },
      { agent_id: 'a1', is_success: true, response_time_ms: 200, created_at: '2026-01-02T00:00:00Z' },
    ];
    const result = aggregateHealth(checks);
    expect(result.avgResponseTime).toBe(150);
  });

  it('recent failures limited to 20', () => {
    const checks = Array.from({ length: 30 }, (_, i) => ({
      agent_id: `a${i}`, is_success: false, response_time_ms: 100, status_code: 500,
      created_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }));
    const result = aggregateHealth(checks);
    expect(result.recentFailures).toHaveLength(20);
  });

  it('excludes zero response times from average', () => {
    const checks = [
      { agent_id: 'a1', is_success: true, response_time_ms: 0, created_at: '2026-01-01T00:00:00Z' },
      { agent_id: 'a2', is_success: true, response_time_ms: 100, created_at: '2026-01-01T00:00:00Z' },
    ];
    const result = aggregateHealth(checks);
    expect(result.avgResponseTime).toBe(100); // only the non-zero one
  });
});

// --- Application aggregation ---

function aggregateApplications(applications: any[]) {
  const byStatus: Record<string, number> = { pending: 0, accepted: 0, rejected: 0, expired: 0, withdrawn: 0 };

  for (const a of applications) {
    const s = (a.status || '').toLowerCase();
    if (s in byStatus) byStatus[s]++;
  }

  const decided = (byStatus.accepted || 0) + (byStatus.rejected || 0);
  const acceptanceRate = decided > 0
    ? Math.round((byStatus.accepted / decided) * 10000) / 100
    : 0;

  return { total: applications.length, byStatus, acceptanceRate };
}

describe('application aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateApplications([]);
    expect(result.total).toBe(0);
    expect(result.acceptanceRate).toBe(0);
  });

  it('computes acceptance rate from accepted / (accepted + rejected)', () => {
    const apps = [
      { status: 'accepted' },
      { status: 'accepted' },
      { status: 'rejected' },
      { status: 'pending' }, // not counted in rate
      { status: 'expired' }, // not counted in rate
    ];
    const result = aggregateApplications(apps);
    expect(result.total).toBe(5);
    expect(result.acceptanceRate).toBe(66.67); // 2/3 = 66.67%
    expect(result.byStatus.pending).toBe(1);
    expect(result.byStatus.expired).toBe(1);
  });

  it('acceptance rate is 0 when no decisions made', () => {
    const apps = [
      { status: 'pending' },
      { status: 'withdrawn' },
    ];
    const result = aggregateApplications(apps);
    expect(result.acceptanceRate).toBe(0);
  });

  it('acceptance rate is 100% when all accepted', () => {
    const apps = [
      { status: 'accepted' },
      { status: 'accepted' },
    ];
    const result = aggregateApplications(apps);
    expect(result.acceptanceRate).toBe(100);
  });
});
