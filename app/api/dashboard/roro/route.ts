/**
 * RORO — Stocks & options agent (Robinhood Agentic Trading).
 *
 * POST /api/dashboard/roro
 * Body: { message, walletAddress, history, sessionId }
 * Response: SSE stream — status, text, action, error, done.
 */

import { buildRoroPrompt, type RoroContext } from '@/lib/ai/roro/prompt';
import { RORO_TOOLS, executeTool } from '@/lib/ai/roro/tools';
import { createOpenRouterClient, type AgentLoopConfig } from '@/lib/ai/shared/sse-agent-loop';
import { createChatRoute, type ChatRequestBody } from '@/lib/ai/agent-runtime';
import { isConnected } from '@/lib/robinhood/store';

export const maxDuration = 120;

const openrouter = createOpenRouterClient('RORO');

const TOOL_STATUS: Record<string, string> = {
  get_portfolio: 'Pulling your portfolio...',
  get_accounts: 'Loading accounts...',
  get_realized_pnl: 'Calculating realized P&L...',
  get_equity_positions: 'Loading positions...',
  get_option_positions: 'Loading options positions...',
  search: 'Finding the ticker...',
  get_equity_quotes: 'Getting quotes...',
  get_equity_historicals: 'Loading price history...',
  get_equity_fundamentals: 'Loading fundamentals...',
  get_equity_technical_indicators: 'Computing indicators...',
  get_earnings_results: 'Loading earnings...',
  get_watchlists: 'Loading watchlists...',
  get_watchlist_items: 'Loading watchlist...',
  prepare_equity_order: 'Reviewing your order...',
};

function extractActionMetadata(toolName: string, result: unknown, existing: any) {
  const r = result as any;
  switch (toolName) {
    case 'prepare_equity_order':
      return r?.order && !r.order.reviewError
        ? { type: 'roro_order_ready', data: r.order }
        : existing;
    case 'request_clarification':
      return r?.clarification
        ? { type: 'agent_clarification', data: { question: r.clarification.question, options: r.clarification.options, allowCustom: true, allowSkip: false } }
        : existing;
    default:
      return existing;
  }
}

const RORO_CONFIG: AgentLoopConfig = {
  name: 'RORO',
  primaryModel: 'google/gemini-2.5-flash',
  fallbackModel: 'openai/gpt-4o-mini',
  maxToolRounds: 5,
  maxTokens: 2048,
  tools: RORO_TOOLS as any,
  executeTool,
  toolStatusMessage: (name) => TOOL_STATUS[name] || 'Working...',
  extractActionMetadata,
  // Off — see delphi route: the net fabricated generic Yes/No panels for open
  // questions. Real clarifications come from the request_clarification tool.
  enableClarificationSafetyNet: false,
  // Prevent a double-review turning into a double-place if the user sends "yes" twice.
  confirmedToolNames: ['prepare_equity_order'],
};

export const POST = createChatRoute<ChatRequestBody, RoroContext>({
  agentLoopConfig: RORO_CONFIG,
  openrouter,
  maxMessageChars: 10_000,
  rateLimitEndpoint: '/api/dashboard/roro',
  // RORO's Robinhood token is keyed on the first verified wallet (see connect
  // route), not the embedded wallet the client sends — bind the owner to it so
  // connected users don't read as NOT_CONNECTED.
  ownerFromFirstVerifiedWallet: true,
  errorMessage: 'Robinhood data is loading, give me a sec... Try again.',
  loadContext: async (body) => {
    const owner = (body.walletAddress || '').toLowerCase();
    let connected = false;
    if (owner) {
      try { connected = await isConnected(owner); } catch { /* default false */ }
    }
    return {
      context: {
        connected,
        walletAddress: body.walletAddress ?? undefined,
        today: new Date().toISOString().slice(0, 10),
      } as RoroContext,
    };
  },
  buildSystemPrompt: (_body, ctx) => buildRoroPrompt(ctx),
});
