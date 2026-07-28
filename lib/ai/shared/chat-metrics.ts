/**
 * Lightweight Redis-backed rollup counters for the chat agents.
 *
 * These complement the per-turn JSON log emitted by chat-telemetry (which is
 * the authoritative event stream). Counters here are for cheap dashboards /
 * health checks where you want an at-a-glance "how's chat doing right now?"
 * without running a log-drain query.
 *
 * Structure:
 *   chat:metrics:turns:{agent}       total turns in the current hour
 *   chat:metrics:errors:{agent}      total error turns in the current hour
 *   chat:metrics:tool_errors:{tool}  total tool failures in the current hour
 *   chat:metrics:cache_hits:{source} total cache hits in the current hour
 *   chat:metrics:model_switched      total fallback-switch events
 *   chat:metrics:stale_positions     total stale-fallback serves
 *
 * All keys expire after 2 hours — this is a moving window, not an accounting
 * ledger. Failures to write are silently swallowed (Redis-down fails open).
 */

import { redis } from '@/lib/redis/client';

const TTL_SECONDS = 2 * 60 * 60; // 2h

async function incr(key: string): Promise<void> {
  try {
    const result = await redis.incr(key);
    // Only set TTL on first increment; avoids resetting window on every hit.
    if (result === 1) await redis.expire(key, TTL_SECONDS);
  } catch (err) {
    // Never break a chat turn because metrics Redis hiccups.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[chat-metrics] incr failed:', (err as Error).message);
    }
  }
}

export async function recordChatTurnMetrics(input: {
  agent: string;
  status: 'ok' | 'error' | 'timeout' | 'rate_limited' | 'invalid';
  modelSwitched?: boolean;
  stalePositions?: boolean;
  cacheHits?: { user_context?: boolean; positions?: boolean; research?: boolean };
  toolErrors?: string[];
}): Promise<void> {
  const agent = input.agent.toLowerCase();
  const jobs: Promise<unknown>[] = [];

  jobs.push(incr(`chat:metrics:turns:${agent}`));
  if (input.status !== 'ok') jobs.push(incr(`chat:metrics:errors:${agent}`));
  if (input.modelSwitched) jobs.push(incr('chat:metrics:model_switched'));
  if (input.stalePositions) jobs.push(incr('chat:metrics:stale_positions'));

  if (input.cacheHits) {
    if (input.cacheHits.user_context) jobs.push(incr('chat:metrics:cache_hits:user_context'));
    if (input.cacheHits.positions) jobs.push(incr('chat:metrics:cache_hits:positions'));
    if (input.cacheHits.research) jobs.push(incr('chat:metrics:cache_hits:research'));
  }

  for (const toolName of input.toolErrors || []) {
    jobs.push(incr(`chat:metrics:tool_errors:${toolName}`));
  }

  await Promise.allSettled(jobs);
}

export interface ChatMetricsSnapshot {
  turns: Record<string, number>;
  errors: Record<string, number>;
  tool_errors: Record<string, number>;
  cache_hits: Record<string, number>;
  model_switched: number;
  stale_positions: number;
  window: '2h';
  generated_at: string;
}

/**
 * Read current counter values. Safe to call from a health-check endpoint.
 * Returns zeroes when Redis is down.
 */
export async function readChatMetrics(): Promise<ChatMetricsSnapshot> {
  const agents = ['oracle', 'delphi', 'hyperion', 'securo'];
  const tools = [
    'search_markets', 'get_my_positions', 'get_trade_history', 'get_market_details',
    'get_watchlist', 'prepare_trade', 'prepare_batch_trade', 'prepare_sell',
    'research_topic', 'get_signals', 'save_preference',
  ];
  const cacheSources = ['user_context', 'positions', 'research'];

  const keys = [
    ...agents.map((a) => `chat:metrics:turns:${a}`),
    ...agents.map((a) => `chat:metrics:errors:${a}`),
    ...tools.map((t) => `chat:metrics:tool_errors:${t}`),
    ...cacheSources.map((c) => `chat:metrics:cache_hits:${c}`),
    'chat:metrics:model_switched',
    'chat:metrics:stale_positions',
  ];

  let values: (string | number | null)[] = [];
  try {
    values = await redis.mget(...keys);
  } catch (err) {
    console.warn('[chat-metrics] mget failed:', (err as Error).message);
    values = keys.map(() => 0);
  }

  const toN = (v: string | number | null | undefined) => {
    if (v == null) return 0;
    return typeof v === 'number' ? v : Number(v) || 0;
  };

  let idx = 0;
  const turns: Record<string, number> = {};
  for (const a of agents) turns[a] = toN(values[idx++]);
  const errors: Record<string, number> = {};
  for (const a of agents) errors[a] = toN(values[idx++]);
  const toolErrors: Record<string, number> = {};
  for (const t of tools) toolErrors[t] = toN(values[idx++]);
  const cacheHits: Record<string, number> = {};
  for (const c of cacheSources) cacheHits[c] = toN(values[idx++]);
  const modelSwitched = toN(values[idx++]);
  const stalePositions = toN(values[idx++]);

  return {
    turns,
    errors,
    tool_errors: toolErrors,
    cache_hits: cacheHits,
    model_switched: modelSwitched,
    stale_positions: stalePositions,
    window: '2h',
    generated_at: new Date().toISOString(),
  };
}
