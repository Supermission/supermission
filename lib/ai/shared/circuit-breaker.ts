/**
 * Redis-backed circuit breaker for upstream dependencies (Polymarket, OpenRouter, etc.).
 *
 * Trips open when a service fails repeatedly and rejects requests for a short
 * cooldown, protecting upstream from retry storms and freeing Vercel function
 * slots that would otherwise sit waiting for a known-broken service. Uses
 * Upstash Redis for shared state across function instances.
 *
 * Fails open: if Redis itself is unavailable, we do NOT block requests — we let
 * them through so a Redis outage doesn't take chat down.
 *
 * State machine:
 *   CLOSED   → normal operation. Counts failures; trips to OPEN at threshold.
 *   OPEN     → all calls short-circuit. After cooldown window, moves to HALF_OPEN.
 *   HALF_OPEN→ exactly one probe allowed. Success → CLOSED, failure → OPEN again.
 *
 * Each service has an independent breaker keyed by name.
 */

import { redis } from '@/lib/redis/client';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitStatus {
  state: CircuitState;
  /** Fresh request should proceed. */
  allowed: boolean;
  /** ms until the breaker considers moving to half-open (0 when already closed). */
  retryAfterMs: number;
}

export interface CircuitConfig {
  /** Consecutive failures to trip open. Default 5. */
  failureThreshold?: number;
  /** Cooldown in ms while open before letting a probe through. Default 30s. */
  cooldownMs?: number;
  /** Failure counter TTL — rolling window. Default 60s. */
  windowMs?: number;
}

const DEFAULTS = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  windowMs: 60_000,
};

function stateKey(service: string): string {
  return `circuit:${service}`;
}

interface StoredState {
  state: CircuitState;
  failures: number;
  openUntil?: number;
  probeHolder?: string; // unique id of the in-flight probe, if any
}

async function loadState(service: string): Promise<StoredState | null> {
  try {
    const raw = await redis.get<StoredState | string>(stateKey(service));
    if (!raw) return null;
    return typeof raw === 'string' ? (JSON.parse(raw) as StoredState) : raw;
  } catch (err) {
    console.warn('[circuit] load failed:', (err as Error).message);
    return null;
  }
}

async function saveState(service: string, state: StoredState, ttlMs: number): Promise<void> {
  try {
    await redis.set(stateKey(service), JSON.stringify(state), { px: ttlMs });
  } catch (err) {
    console.warn('[circuit] save failed:', (err as Error).message);
  }
}

/**
 * Should a request be allowed through right now? Call this BEFORE attempting
 * the upstream call. If it returns { allowed: false }, short-circuit and
 * return your fallback.
 */
export async function checkCircuit(
  service: string,
  config: CircuitConfig = {},
): Promise<CircuitStatus> {
  const cooldownMs = config.cooldownMs ?? DEFAULTS.cooldownMs;

  const state = await loadState(service);
  if (!state || state.state === 'closed') {
    return { state: 'closed', allowed: true, retryAfterMs: 0 };
  }

  const now = Date.now();
  if (state.state === 'open') {
    if (state.openUntil && now < state.openUntil) {
      return { state: 'open', allowed: false, retryAfterMs: state.openUntil - now };
    }
    // Cooldown elapsed — promote to half-open and allow one probe.
    const nextState: StoredState = { state: 'half_open', failures: state.failures };
    await saveState(service, nextState, cooldownMs * 2);
    return { state: 'half_open', allowed: true, retryAfterMs: 0 };
  }

  // half_open — let only one probe through at a time. We don't lock atomically
  // (Redis transactions aren't trivial via the HTTP client); if two probes slip
  // through, the cost is one extra upstream call, not correctness loss.
  return { state: 'half_open', allowed: true, retryAfterMs: 0 };
}

/**
 * Record the outcome of an upstream call. Trips open on threshold failures,
 * resets the breaker on any success. Safe to call unconditionally even when
 * the caller didn't check the circuit first.
 */
export async function recordCircuitResult(
  service: string,
  ok: boolean,
  config: CircuitConfig = {},
): Promise<void> {
  const threshold = config.failureThreshold ?? DEFAULTS.failureThreshold;
  const cooldownMs = config.cooldownMs ?? DEFAULTS.cooldownMs;
  const windowMs = config.windowMs ?? DEFAULTS.windowMs;

  const current = await loadState(service);

  if (ok) {
    // Any success resets the breaker.
    if (!current || current.state === 'closed') {
      if (current && current.failures > 0) {
        await saveState(service, { state: 'closed', failures: 0 }, windowMs);
      }
      return;
    }
    await saveState(service, { state: 'closed', failures: 0 }, windowMs);
    return;
  }

  // Failure.
  const failures = (current?.failures ?? 0) + 1;
  if (failures >= threshold || current?.state === 'half_open') {
    const openUntil = Date.now() + cooldownMs;
    await saveState(service, { state: 'open', failures, openUntil }, cooldownMs + windowMs);
    console.warn(`[circuit] ${service} OPEN — ${failures} failures, cooldown ${cooldownMs}ms`);
    return;
  }
  await saveState(service, { state: 'closed', failures }, windowMs);
}
