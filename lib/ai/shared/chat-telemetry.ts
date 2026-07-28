/**
 * Structured telemetry for chat turns.
 *
 * Emits a single JSON line per turn at the end with timings, outcome, and
 * cost signals. Consumed by Vercel log drains (→ Axiom / Datadog / Better Stack)
 * and queryable as structured events. Keep this module zero-deps and
 * side-effect free except for `console.log` — it must be safe from any runtime.
 *
 * Shape is stable. Add fields; don't rename them.
 *   event:          "chat_turn" (discriminator)
 *   agent:          ORACLE | DELPHI | HYPERION | SECURO
 *   wallet_hash:    sha256:8 of lowercased wallet, or null (anonymous)
 *   session_id:     client session id
 *   status:         ok | error | timeout | rate_limited | invalid
 *   duration_ms:    total turn latency (request → done event)
 *   ttft_ms:        time to first streamed token (TTFB for streaming agents)
 *   rounds:         number of LLM rounds in the tool-calling loop
 *   model:          final model actually used (reflects fallback if primary failed)
 *   model_switched: true if we fell back from primary to fallback
 *   tool_count:     number of tool calls in the turn
 *   tool_calls:     [{name, duration_ms, ok, error?}]
 *   tokens:         {input, output, total} — null if upstream didn't report
 *   cache:          {user_context_hit, positions_hit, research_hit}
 *   stale_positions: true if positions were served from last-known-good
 *   circuit_events: list of circuit-breaker state changes observed this turn
 *   message_chars / output_chars / history_len
 *   error:          short failure reason (truncated to 240 chars)
 *   ts:             ISO timestamp of turn start
 */

import { createHash } from 'node:crypto';
import { recordChatTurnMetrics } from './chat-metrics';

export type ChatTurnStatus = 'ok' | 'error' | 'timeout' | 'rate_limited' | 'invalid';

export interface ToolCallTelemetry {
  name: string;
  duration_ms: number;
  ok: boolean;
  error?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface CacheSignals {
  user_context_hit?: boolean;
  positions_hit?: boolean;
  research_hit?: boolean;
}

export interface ChatTurnStartInput {
  agent: string;
  walletAddress: string | null | undefined;
  sessionId?: string;
  messageChars: number;
  historyLen: number;
}

export interface ChatTurnHandle {
  /** Record that a specific LLM model was invoked (most recent wins). */
  setModel(model: string): void;
  /** Record that we switched from primary → fallback model. */
  markModelSwitched(): void;
  /** Increment the round counter (one per assistant turn in the loop). */
  incrementRound(): void;
  /** Record a tool call result (timing + ok/err). */
  recordTool(call: ToolCallTelemetry): void;
  /** Record time-to-first-token once the first chunk arrives. */
  markFirstToken(): void;
  /** Record token usage from the LLM response (usage.prompt_tokens etc). */
  recordTokens(usage: Partial<TokenUsage>): void;
  /** Merge cache-hit signals (call once per source). */
  setCache(signal: CacheSignals): void;
  /** Record that positions were served from last-known-good. */
  markStalePositions(): void;
  /** Record a circuit-breaker state change observed this turn. */
  recordCircuitEvent(service: string, state: 'open' | 'half_open' | 'closed'): void;
  /** Record summary reuse/regeneration for the conversation-summarizer. */
  markSummary(action: 'reused' | 'regenerated' | 'none'): void;
  /** Emit the terminal log line. Safe to call more than once — first wins. */
  end(status: ChatTurnStatus, extra?: { error?: string; outputChars?: number }): void;
}

// Hash wallet before logging so logs don't leak addresses in plaintext.
// Short 8-char prefix is enough to correlate a user's turns without identifying them.
function hashWallet(wallet: string | null | undefined): string | null {
  if (!wallet) return null;
  return createHash('sha256').update(wallet.toLowerCase()).digest('hex').slice(0, 8);
}

export function startChatTurn(input: ChatTurnStartInput): ChatTurnHandle {
  const startedAt = Date.now();
  const walletHash = hashWallet(input.walletAddress);
  let model: string | undefined;
  let modelSwitched = false;
  let rounds = 0;
  const toolCalls: ToolCallTelemetry[] = [];
  let ttftMs: number | null = null;
  let tokens: Partial<TokenUsage> = {};
  const cache: CacheSignals = {};
  let stalePositions = false;
  const circuitEvents: Array<{ service: string; state: string }> = [];
  let summaryAction: 'reused' | 'regenerated' | 'none' = 'none';
  let ended = false;

  return {
    setModel(m) {
      model = m;
    },
    markModelSwitched() {
      modelSwitched = true;
    },
    incrementRound() {
      rounds += 1;
    },
    recordTool(call) {
      toolCalls.push(call);
    },
    markFirstToken() {
      if (ttftMs === null) ttftMs = Date.now() - startedAt;
    },
    recordTokens(usage) {
      if (usage.input != null) tokens.input = (tokens.input || 0) + usage.input;
      if (usage.output != null) tokens.output = (tokens.output || 0) + usage.output;
      if (usage.total != null) tokens.total = (tokens.total || 0) + usage.total;
    },
    setCache(signal) {
      Object.assign(cache, signal);
    },
    markStalePositions() {
      stalePositions = true;
    },
    recordCircuitEvent(service, state) {
      circuitEvents.push({ service, state });
    },
    markSummary(action) {
      summaryAction = action;
    },
    end(status, extra = {}) {
      if (ended) return;
      ended = true;
      const durationMs = Date.now() - startedAt;
      // Build compact token field — omit entirely if nothing was reported.
      const hasTokens = tokens.input != null || tokens.output != null || tokens.total != null;
      const payload = {
        event: 'chat_turn',
        agent: input.agent,
        wallet_hash: walletHash,
        session_id: input.sessionId ?? null,
        status,
        duration_ms: durationMs,
        ttft_ms: ttftMs,
        rounds,
        model: model ?? null,
        model_switched: modelSwitched,
        tool_count: toolCalls.length,
        tool_calls: toolCalls.map((t) => ({
          name: t.name,
          duration_ms: t.duration_ms,
          ok: t.ok,
          ...(t.error ? { error: t.error.slice(0, 160) } : {}),
        })),
        tokens: hasTokens
          ? {
              input: tokens.input ?? null,
              output: tokens.output ?? null,
              total: tokens.total ?? (tokens.input ?? 0) + (tokens.output ?? 0),
            }
          : null,
        cache: Object.keys(cache).length > 0 ? cache : null,
        stale_positions: stalePositions || undefined,
        circuit_events: circuitEvents.length > 0 ? circuitEvents : undefined,
        summary: summaryAction !== 'none' ? summaryAction : undefined,
        message_chars: input.messageChars,
        history_len: input.historyLen,
        output_chars: extra.outputChars,
        error: extra.error?.slice(0, 240),
        ts: new Date(startedAt).toISOString(),
      };
      console.log(JSON.stringify(payload));

      // Fire-and-forget rollup counters — don't block the turn on Redis.
      recordChatTurnMetrics({
        agent: input.agent,
        status,
        modelSwitched,
        stalePositions,
        cacheHits: {
          user_context: cache.user_context_hit,
          positions: cache.positions_hit,
          research: cache.research_hit,
        },
        toolErrors: toolCalls.filter((t) => !t.ok).map((t) => t.name),
      }).catch(() => {});
    },
  };
}
