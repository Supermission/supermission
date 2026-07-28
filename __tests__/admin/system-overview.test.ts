/**
 * Tests for system health overview aggregation logic.
 * Tests the logic from app/api/admin/system/overview/route.ts
 */
import { describe, it, expect } from 'vitest';

// --- Webhook delivery stats ---

function aggregateWebhooks(deliveries: any[]) {
  const byStatus: Record<string, number> = { pending: 0, delivered: 0, failed: 0, retrying: 0 };
  let totalAttempts = 0;
  const failures: any[] = [];

  for (const w of deliveries) {
    const status = w.status || 'unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
    totalAttempts += Number(w.attempts) || 0;
    if (status === 'failed') failures.push(w);
  }

  const deliveredCount = byStatus['delivered'] || 0;
  const deliveryRate = deliveries.length > 0
    ? Math.round((deliveredCount / deliveries.length) * 10000) / 100
    : 0;
  const avgAttempts = deliveries.length > 0
    ? Math.round((totalAttempts / deliveries.length) * 100) / 100
    : 0;
  const dlqSize = failures.filter((w) => !w.next_retry_at).length;

  return { total: deliveries.length, byStatus, deliveryRate, avgAttempts, dlqSize };
}

describe('webhook delivery aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateWebhooks([]);
    expect(result.total).toBe(0);
    expect(result.deliveryRate).toBe(0);
    expect(result.avgAttempts).toBe(0);
    expect(result.dlqSize).toBe(0);
  });

  it('counts statuses and computes delivery rate', () => {
    const deliveries = [
      { status: 'delivered', attempts: 1, next_retry_at: null },
      { status: 'delivered', attempts: 2, next_retry_at: null },
      { status: 'failed', attempts: 5, next_retry_at: null },
      { status: 'retrying', attempts: 3, next_retry_at: '2026-01-02T00:00:00Z' },
    ];
    const result = aggregateWebhooks(deliveries);
    expect(result.total).toBe(4);
    expect(result.byStatus.delivered).toBe(2);
    expect(result.byStatus.failed).toBe(1);
    expect(result.byStatus.retrying).toBe(1);
    expect(result.deliveryRate).toBe(50); // 2/4
  });

  it('DLQ = failed with no next_retry_at', () => {
    const deliveries = [
      { status: 'failed', attempts: 5, next_retry_at: null },
      { status: 'failed', attempts: 3, next_retry_at: '2026-01-02T00:00:00Z' }, // still retrying
      { status: 'failed', attempts: 5, next_retry_at: null },
    ];
    const result = aggregateWebhooks(deliveries);
    expect(result.dlqSize).toBe(2); // only the ones with no retry
  });

  it('computes average attempts', () => {
    const deliveries = [
      { status: 'delivered', attempts: 1, next_retry_at: null },
      { status: 'delivered', attempts: 3, next_retry_at: null },
    ];
    const result = aggregateWebhooks(deliveries);
    expect(result.avgAttempts).toBe(2);
  });

  it('unknown status gets its own key in byStatus', () => {
    const deliveries = [
      { status: 'processing', attempts: 1, next_retry_at: null },
    ];
    const result = aggregateWebhooks(deliveries);
    expect(result.byStatus['processing']).toBe(1);
    expect(result.deliveryRate).toBe(0);
  });
});

// --- x402 Pipeline stats ---

function aggregateX402(payments: any[], now: number) {
  const byStatus: Record<string, number> = { pending: 0, signing: 0, completed: 0, failed: 0, expired: 0 };
  let totalVolume = 0;
  let volume24h = 0;
  const oneDayAgo = now - 86_400_000;
  const failed: any[] = [];

  for (const p of payments) {
    const status = p.status || 'unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
    const amount = Number(p.amount) || 0;
    totalVolume += amount;
    if (new Date(p.created_at).getTime() >= oneDayAgo) volume24h += amount;
    if (status === 'failed' || status === 'expired') failed.push(p);
  }

  const completedCount = byStatus['completed'] || 0;
  const successRate = payments.length > 0
    ? Math.round((completedCount / payments.length) * 10000) / 100
    : 0;

  return {
    total: payments.length,
    byStatus,
    successRate,
    totalVolume: Math.round(totalVolume * 100) / 100,
    volume24h: Math.round(volume24h * 100) / 100,
    failedCount: failed.length,
  };
}

describe('x402 pipeline aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateX402([], Date.now());
    expect(result.total).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.totalVolume).toBe(0);
    expect(result.volume24h).toBe(0);
  });

  it('counts statuses and computes success rate', () => {
    const now = Date.now();
    const payments = [
      { status: 'completed', amount: 10, created_at: new Date(now).toISOString() },
      { status: 'completed', amount: 20, created_at: new Date(now).toISOString() },
      { status: 'failed', amount: 5, created_at: new Date(now).toISOString() },
      { status: 'expired', amount: 3, created_at: new Date(now - 2 * 86_400_000).toISOString() },
    ];
    const result = aggregateX402(payments, now);
    expect(result.total).toBe(4);
    expect(result.successRate).toBe(50); // 2/4
    expect(result.totalVolume).toBe(38);
    expect(result.volume24h).toBe(35); // 10 + 20 + 5 (excluding the 2-day-old expired one)
    expect(result.failedCount).toBe(2); // failed + expired
  });

  it('handles string amounts', () => {
    const now = Date.now();
    const payments = [
      { status: 'completed', amount: '100.50', created_at: new Date(now).toISOString() },
    ];
    const result = aggregateX402(payments, now);
    expect(result.totalVolume).toBe(100.5);
  });
});

// --- Chat stats ---

function aggregateChat(sessions: any[], messages: any[], now: number) {
  const oneDayAgo = now - 86_400_000;
  let sessions24h = 0;
  const uniqueUsers = new Set<string>();
  const agentCounts = new Map<string, number>();

  for (const s of sessions) {
    if (new Date(s.created_at).getTime() >= oneDayAgo) sessions24h++;
    if (s.user_address) uniqueUsers.add(s.user_address);
    const agentId = s.agent_id || 'unknown';
    agentCounts.set(agentId, (agentCounts.get(agentId) || 0) + 1);
  }

  const avgMessagesPerSession = sessions.length > 0
    ? Math.round((messages.length / sessions.length) * 100) / 100
    : 0;

  const byAgent = Array.from(agentCounts.entries())
    .map(([agentId, count]) => ({ agentId, sessions: count }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    totalSessions: sessions.length,
    totalMessages: messages.length,
    sessions24h,
    uniqueUsers: uniqueUsers.size,
    avgMessagesPerSession,
    byAgent,
  };
}

describe('chat stats aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateChat([], [], Date.now());
    expect(result.totalSessions).toBe(0);
    expect(result.totalMessages).toBe(0);
    expect(result.uniqueUsers).toBe(0);
    expect(result.avgMessagesPerSession).toBe(0);
  });

  it('counts sessions and messages', () => {
    const now = Date.now();
    const sessions = [
      { session_id: 's1', user_address: '0xA', agent_id: 'delphi', created_at: new Date(now).toISOString() },
      { session_id: 's2', user_address: '0xA', agent_id: 'delphi', created_at: new Date(now - 2 * 86_400_000).toISOString() },
      { session_id: 's3', user_address: '0xB', agent_id: 'quickgig', created_at: new Date(now).toISOString() },
    ];
    const messages = [
      { session_id: 's1', role: 'user' },
      { session_id: 's1', role: 'assistant' },
      { session_id: 's2', role: 'user' },
      { session_id: 's3', role: 'user' },
      { session_id: 's3', role: 'assistant' },
      { session_id: 's3', role: 'user' },
    ];
    const result = aggregateChat(sessions, messages, now);
    expect(result.totalSessions).toBe(3);
    expect(result.totalMessages).toBe(6);
    expect(result.sessions24h).toBe(2); // s1 and s3
    expect(result.uniqueUsers).toBe(2); // 0xA and 0xB
    expect(result.avgMessagesPerSession).toBe(2); // 6/3
  });

  it('groups by agent', () => {
    const now = Date.now();
    const sessions = [
      { session_id: 's1', user_address: '0xA', agent_id: 'delphi', created_at: new Date(now).toISOString() },
      { session_id: 's2', user_address: '0xA', agent_id: 'delphi', created_at: new Date(now).toISOString() },
      { session_id: 's3', user_address: '0xB', agent_id: 'quickgig', created_at: new Date(now).toISOString() },
    ];
    const result = aggregateChat(sessions, [], now);
    expect(result.byAgent[0]).toEqual({ agentId: 'delphi', sessions: 2 });
    expect(result.byAgent[1]).toEqual({ agentId: 'quickgig', sessions: 1 });
  });

  it('null user_address is not counted in unique users', () => {
    const now = Date.now();
    const sessions = [
      { session_id: 's1', user_address: null, agent_id: 'delphi', created_at: new Date(now).toISOString() },
    ];
    const result = aggregateChat(sessions, [], now);
    expect(result.uniqueUsers).toBe(0);
  });
});

// --- Endpoint health stats ---

function aggregateEndpointHealth(checks: any[], now: number) {
  const oneDayAgo = now - 86_400_000;
  let checksLast24h = 0;
  let successCount = 0;
  let totalResponseTime = 0;
  let responseTimeCount = 0;

  const endpointStats = new Map<string, { agentId: string; url: string; totalTime: number; count: number; failures: number; lastFailure: string | null }>();

  for (const c of checks) {
    const ts = new Date(c.created_at).getTime();
    if (ts >= oneDayAgo) checksLast24h++;
    if (c.is_success) successCount++;
    if (c.response_time_ms != null) {
      totalResponseTime += Number(c.response_time_ms);
      responseTimeCount++;
    }

    const key = `${c.agent_id}::${c.endpoint_url}`;
    const existing = endpointStats.get(key);
    if (existing) {
      if (c.response_time_ms != null) {
        existing.totalTime += Number(c.response_time_ms);
        existing.count++;
      }
      if (!c.is_success) {
        existing.failures++;
        if (!existing.lastFailure || c.created_at > existing.lastFailure) {
          existing.lastFailure = c.created_at;
        }
      }
    } else {
      endpointStats.set(key, {
        agentId: c.agent_id,
        url: c.endpoint_url,
        totalTime: Number(c.response_time_ms) || 0,
        count: c.response_time_ms != null ? 1 : 0,
        failures: c.is_success ? 0 : 1,
        lastFailure: c.is_success ? null : c.created_at,
      });
    }
  }

  const successRate = checks.length > 0
    ? Math.round((successCount / checks.length) * 10000) / 100
    : 0;
  const avgResponseTime = responseTimeCount > 0
    ? Math.round((totalResponseTime / responseTimeCount) * 100) / 100
    : 0;

  const endpointList = Array.from(endpointStats.values());

  const slowest = endpointList
    .filter(e => e.count > 0)
    .map(e => ({ agentId: e.agentId, url: e.url, avgResponseTime: Math.round((e.totalTime / e.count) * 100) / 100 }))
    .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
    .slice(0, 10);

  const failing = endpointList
    .filter(e => e.failures > 0)
    .map(e => ({ agentId: e.agentId, url: e.url, failureCount: e.failures, lastFailure: e.lastFailure }))
    .sort((a, b) => b.failureCount - a.failureCount)
    .slice(0, 10);

  return { checksLast24h, successRate, avgResponseTime, slowest, failing };
}

describe('endpoint health aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateEndpointHealth([], Date.now());
    expect(result.checksLast24h).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.avgResponseTime).toBe(0);
    expect(result.slowest).toEqual([]);
    expect(result.failing).toEqual([]);
  });

  it('computes success rate and average response time', () => {
    const now = Date.now();
    const checks = [
      { agent_id: 'a1', endpoint_url: 'http://a1.com', is_success: true, response_time_ms: 100, created_at: new Date(now).toISOString() },
      { agent_id: 'a1', endpoint_url: 'http://a1.com', is_success: true, response_time_ms: 200, created_at: new Date(now).toISOString() },
      { agent_id: 'a2', endpoint_url: 'http://a2.com', is_success: false, response_time_ms: 500, created_at: new Date(now).toISOString() },
    ];
    const result = aggregateEndpointHealth(checks, now);
    expect(result.checksLast24h).toBe(3);
    expect(result.successRate).toBe(66.67);
    expect(result.avgResponseTime).toBeCloseTo(266.67, 1);
  });

  it('identifies slowest and failing endpoints', () => {
    const now = Date.now();
    const checks = [
      { agent_id: 'a1', endpoint_url: 'http://fast.com', is_success: true, response_time_ms: 50, created_at: new Date(now).toISOString() },
      { agent_id: 'a2', endpoint_url: 'http://slow.com', is_success: true, response_time_ms: 5000, created_at: new Date(now).toISOString() },
      { agent_id: 'a3', endpoint_url: 'http://broken.com', is_success: false, response_time_ms: 100, created_at: new Date(now).toISOString() },
      { agent_id: 'a3', endpoint_url: 'http://broken.com', is_success: false, response_time_ms: 200, created_at: new Date(now - 1000).toISOString() },
    ];
    const result = aggregateEndpointHealth(checks, now);
    expect(result.slowest[0].url).toBe('http://slow.com');
    expect(result.slowest[0].avgResponseTime).toBe(5000);
    expect(result.failing[0].url).toBe('http://broken.com');
    expect(result.failing[0].failureCount).toBe(2);
  });

  it('limits slowest and failing to 10 each', () => {
    const now = Date.now();
    const checks = Array.from({ length: 15 }, (_, i) => ({
      agent_id: `a${i}`, endpoint_url: `http://e${i}.com`, is_success: false,
      response_time_ms: (i + 1) * 100, created_at: new Date(now).toISOString(),
    }));
    const result = aggregateEndpointHealth(checks, now);
    expect(result.slowest).toHaveLength(10);
    expect(result.failing).toHaveLength(10);
  });
});

// --- DeFi stats ---

function aggregateDefi(activities: any[], now: number) {
  const oneDayAgo = now - 86_400_000;
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let totalVolumeUsd = 0;
  let activities24h = 0;

  for (const d of activities) {
    const type = d.activity_type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
    const status = d.status || 'unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
    totalVolumeUsd += Number(d.amount_usd) || 0;
    if (new Date(d.created_at).getTime() >= oneDayAgo) activities24h++;
  }

  return {
    total: activities.length,
    activities24h,
    totalVolumeUsd: Math.round(totalVolumeUsd * 100) / 100,
    byType,
    byStatus,
  };
}

describe('defi activity aggregation', () => {
  it('returns zeroes for empty data', () => {
    const result = aggregateDefi([], Date.now());
    expect(result.total).toBe(0);
    expect(result.activities24h).toBe(0);
    expect(result.totalVolumeUsd).toBe(0);
  });

  it('counts by type and status', () => {
    const now = Date.now();
    const activities = [
      { activity_type: 'swap', status: 'completed', amount_usd: 100, created_at: new Date(now).toISOString() },
      { activity_type: 'swap', status: 'completed', amount_usd: 200, created_at: new Date(now).toISOString() },
      { activity_type: 'bridge', status: 'failed', amount_usd: 50, created_at: new Date(now - 2 * 86_400_000).toISOString() },
    ];
    const result = aggregateDefi(activities, now);
    expect(result.total).toBe(3);
    expect(result.activities24h).toBe(2);
    expect(result.totalVolumeUsd).toBe(350);
    expect(result.byType).toEqual({ swap: 2, bridge: 1 });
    expect(result.byStatus).toEqual({ completed: 2, failed: 1 });
  });

  it('handles null amount_usd', () => {
    const now = Date.now();
    const activities = [
      { activity_type: 'swap', status: 'completed', amount_usd: null, created_at: new Date(now).toISOString() },
    ];
    const result = aggregateDefi(activities, now);
    expect(result.totalVolumeUsd).toBe(0);
  });
});

// --- Daily activity bucketing ---

describe('daily activity bucketing', () => {
  it('groups events by date', () => {
    const events = [
      { created_at: '2026-04-01T10:00:00Z' },
      { created_at: '2026-04-01T15:00:00Z' },
      { created_at: '2026-04-02T08:00:00Z' },
    ];

    const dailyMap = new Map<string, number>();
    for (const e of events) {
      const day = new Date(e.created_at).toISOString().slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    }

    expect(dailyMap.get('2026-04-01')).toBe(2);
    expect(dailyMap.get('2026-04-02')).toBe(1);
  });

  it('sorts by date ascending and limits to last 30 days', () => {
    const entries = Array.from({ length: 40 }, (_, i) => {
      const d = new Date('2026-01-01');
      d.setDate(d.getDate() + i);
      return { date: d.toISOString().slice(0, 10), count: i };
    });

    const sorted = entries.sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
    expect(sorted).toHaveLength(30);
    expect(sorted[0].date).toBe('2026-01-11');
    expect(sorted[29].date).toBe('2026-02-09');
  });
});
