/**
 * ORACLE — Dedicated prediction market agent endpoint.
 *
 * POST /api/markets/oracle
 * Body: { message, walletAddress, history, sessionId }
 * Response: SSE stream with events: status, text, action, error, done
 *
 * All SSE plumbing, rate limiting, telemetry, and error handling lives in
 * `lib/ai/agent-runtime`. This file only declares what's unique to Oracle.
 */

import { buildOraclePrompt, OracleContext } from '@/lib/ai/oracle/prompt';
import { ORACLE_TOOLS, executeTool } from '@/lib/ai/oracle/tools';
import { fetchUserContextCached } from '@/lib/ai/user-context';
import {
  createOpenRouterClient,
  type AgentLoopConfig,
} from '@/lib/ai/shared/sse-agent-loop';
import { createChatRoute, type ChatRequestBody } from '@/lib/ai/agent-runtime';

export const maxDuration = 120;

const openrouter = createOpenRouterClient('ORACLE');

// ---------------------------------------------------------------------------
// Agent-specific config
// ---------------------------------------------------------------------------

const TOOL_STATUS: Record<string, string> = {
  search_markets: 'Searching markets...',
  get_my_positions: 'Fetching your positions...',
  get_trade_history: 'Loading trade history...',
  get_market_details: 'Getting market details...',
  get_watchlist: 'Loading watchlist...',
  prepare_trade: 'Preparing trade...',
  prepare_sell: 'Preparing sell order...',
  research_topic: 'Researching latest news...',
  get_signals: 'Scanning AI signals...',
  save_preference: 'Saving preference...',
};

function extractActionMetadata(
  toolName: string,
  result: unknown,
  existing: any,
): any {
  const r = result as any;
  if (r && typeof r === 'object' && 'error' in r) return existing;

  switch (toolName) {
    case 'get_my_positions':
      return { type: 'oracle_positions', data: r };
    case 'prepare_trade':
      return { type: 'oracle_trade_confirm', data: r };
    case 'prepare_batch_trade':
      return r.trades
        ? { type: 'oracle_trade_confirm_batch', data: r }
        : existing;
    case 'prepare_sell':
      return r.sells
        ? { type: 'oracle_sell_confirm_batch', data: r }
        : { type: 'oracle_sell_confirm', data: r };
    case 'request_clarification':
      return r?.clarification ? {
        type: 'agent_clarification',
        data: {
          question: r.clarification.question,
          options: r.clarification.options || [],
          allowCustom: true,
          allowSkip: true,
        },
      } : existing;
    case 'redirect_to_agent':
      return r?.redirect ? {
        type: 'agent_redirect',
        data: {
          targetAgent: r.redirect.agent,
          reason: r.redirect.reason,
        },
      } : existing;
    default:
      return existing;
  }
}

const ORACLE_CONFIG: AgentLoopConfig = {
  name: 'ORACLE',
  primaryModel: 'google/gemini-2.5-flash',
  fallbackModel: 'openai/gpt-4o-mini',
  maxToolRounds: 5,
  // Lower temperature for trade advice — the agent needs to be deterministic
  // about prices, sides, and numbers. Higher values (0.7+) let the model
  // paraphrase numeric results inconsistently across retries.
  temperature: 0.3,
  tools: ORACLE_TOOLS as any,
  executeTool,
  toolStatusMessage: (name) => TOOL_STATUS[name] || 'Working...',
  extractActionMetadata,
  // Off — see delphi route: the net fabricated generic Yes/No panels for open
  // questions. Real clarifications come from the request_clarification tool.
  enableClarificationSafetyNet: false,
  // Guard against double-execution when the user sends "yes" twice — the LLM
  // may re-issue the same prepare_* call across rounds with identical args.
  confirmedToolNames: ['prepare_trade', 'prepare_batch_trade', 'prepare_sell'],
};

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const POST = createChatRoute<ChatRequestBody, OracleContext>({
  agentLoopConfig: ORACLE_CONFIG,
  openrouter,
  maxMessageChars: 30_000,
  rateLimitEndpoint: '/api/markets/oracle',
  errorMessage: 'Markets are noisy right now, give me a sec... Try again.',
  loadContext: async (body) => {
    // Load watchlist, trades, preferences — cached 30s per wallet.
    const { context: userContext, cacheHit } = await fetchUserContextCached(
      body.walletAddress ?? null,
    );
    const oracleContext: OracleContext = {
      walletAddress: body.walletAddress ?? null,
      watchlistCount: userContext.watchlist_condition_ids.length,
      watchlistMarkets: userContext.watchlist_markets,
      preferences: userContext.preferences,
      recentTrades: userContext.recent_trades,
    };
    return { context: oracleContext, cacheHits: { user_context_hit: cacheHit } };
  },
  buildSystemPrompt: (_body, ctx) => buildOraclePrompt(ctx),
});
