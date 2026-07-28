/**
 * DELPHI — Unified DeFi agent endpoint.
 *
 * POST /api/dashboard/delphi
 * Body: { message, walletAddress, connectedChainId, history, sessionId }
 * Response: SSE stream with events: status, text, action, error, done
 *
 * Shared SSE + rate limit + telemetry handled by lib/ai/agent-runtime.
 */

import { buildDelphiPrompt, DelphiContext } from '@/lib/ai/delphi/prompt';
import { DELPHI_TOOLS, executeTool } from '@/lib/ai/delphi/tools';
import {
  createOpenRouterClient,
  type AgentLoopConfig,
} from '@/lib/ai/shared/sse-agent-loop';
import { createChatRoute, type ChatRequestBody } from '@/lib/ai/agent-runtime';

export const maxDuration = 120;

const openrouter = createOpenRouterClient('DELPHI');

// ---------------------------------------------------------------------------
// Agent-specific config
// ---------------------------------------------------------------------------

const TOOL_STATUS: Record<string, string> = {
  analyze_token: 'Analyzing token...',
  get_swap_quote: 'Getting swap quote...',
  get_token_price: 'Looking up price...',
  scan_yields: 'Scanning yield opportunities...',
  analyze_wallet: 'Analyzing wallet...',
  get_portfolio: 'Fetching portfolio...',
  research_topic: 'Researching...',
  list_tokens: 'Listing tokens...',
  list_chains: 'Loading chains...',
  scan_morpho_vaults: 'Scanning Morpho vaults...',
  prepare_morpho_deposit: 'Preparing deposit...',
  prepare_swap: 'Preparing swap...',
  prepare_transfer: 'Preparing transfer...',
  get_token_balance: 'Checking balance...',
  browse_pools: 'Browsing pools...',
  prepare_defi_deposit: 'Preparing deposit...',
  generate_yield_strategy: 'Generating strategy...',
  prepare_uniswap_lp: 'Preparing LP position...',
  execute_uniswap_lp: 'Executing LP position...',
  get_lp_positions: 'Loading LP positions...',
  prepare_remove_liquidity: 'Preparing liquidity removal...',
  collect_lp_fees: 'Preparing fee collection...',
  get_trending_tokens: 'Scanning trending tokens...',
  get_smart_money_moves: 'Analyzing smart money activity...',
  nansen_token_analysis: 'Running deep token analysis...',
  search_nansen_token: 'Searching for token...',
  batch_buy_trending: 'Analyzing trending tokens...',
  execute_batch_buy: 'Preparing batch execution...',
  batch_allocate_yield: 'Preparing yield positions...',
  execute_batch_yield: 'Executing batch allocation...',
};

function extractActionMetadata(
  toolName: string,
  result: unknown,
  existing: any,
): any {
  const r = result as any;
  if (r && typeof r === 'object' && 'error' in r) return existing;

  switch (toolName) {
    case 'analyze_token':
      return { type: 'token_dd_result', data: r };
    case 'get_swap_quote':
      return { type: 'defi_swap_quote', data: r };
    case 'scan_yields':
      return { type: 'defi_yield_result', data: r };
    case 'analyze_wallet':
      return { type: 'wallet_intelligence_result', data: r };
    case 'scan_morpho_vaults':
      return { type: 'morpho_vault_result', data: r };
    case 'prepare_morpho_deposit':
      return r?.deposit ? { type: 'morpho_deposit_ready', data: r.deposit } : existing;
    case 'prepare_swap':
      return r?.swap ? { type: 'swap_ready', data: r.swap } : existing;
    case 'prepare_transfer':
      return r?.transfer ? { type: 'transfer_ready', data: r.transfer } : existing;
    case 'prepare_defi_deposit':
      return r?.deposit ? { type: 'defi_deposit_ready', data: r.deposit } : existing;
    case 'prepare_uniswap_lp':
      return r?.lp ? { type: 'uniswap_lp_ready', data: r.lp } : existing;
    case 'execute_uniswap_lp':
      return r?.lpExecution ? { type: 'uniswap_lp_execution_ready', data: r.lpExecution } : existing;
    case 'prepare_remove_liquidity':
      return r?.removal ? { type: 'uniswap_lp_remove_ready', data: r.removal } : existing;
    case 'collect_lp_fees':
      return r?.collect ? { type: 'uniswap_lp_collect_ready', data: r.collect } : existing;
    case 'get_trending_tokens':
      return r?.trending ? { type: 'nansen_trending_result', data: r } : existing;
    case 'get_smart_money_moves':
      return r?.smartMoney ? { type: 'nansen_smart_money_result', data: r } : existing;
    case 'nansen_token_analysis':
      return r?.nansenAnalysis ? { type: 'nansen_analysis_result', data: r } : existing;
    case 'batch_buy_trending':
      return r?.plan ? { type: 'batch_buy_plan_ready', data: r.plan } : existing;
    case 'execute_batch_buy':
      return r?.execution ? { type: 'batch_buy_execution_ready', data: r.execution } : existing;
    case 'batch_allocate_yield':
      return r?.yieldPlan ? { type: 'batch_yield_plan_ready', data: r.yieldPlan } : existing;
    case 'execute_batch_yield':
      return r?.yieldExecution ? { type: 'batch_yield_execution_ready', data: r.yieldExecution } : existing;
    case 'get_price_chart':
      return r?.candles ? { type: 'price_chart', data: r } : existing;
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

const DELPHI_CONFIG: AgentLoopConfig = {
  name: 'DELPHI',
  primaryModel: 'google/gemini-2.5-flash',
  fallbackModel: 'openai/gpt-4o-mini',
  maxToolRounds: 5,
  maxTokens: 2048,
  tools: DELPHI_TOOLS as any,
  executeTool,
  toolStatusMessage: (name) => TOOL_STATUS[name] || 'Working...',
  extractActionMetadata,
  // Off: the safety net fabricated a generic Yes/No/"more details" panel for ANY
  // short reply ending in "?", including open "what/which/how" questions where
  // Yes/No is nonsensical — and clickable confirm buttons violate our text-based
  // yes/no rule. Genuine clarifications still come from the request_clarification
  // tool (real, LLM-supplied options).
  enableClarificationSafetyNet: false,
  // Guard against double-bridge / double-swap when the user sends "yes" twice
  // — the LLM may re-issue the same prepare_* call across rounds. Real on-chain
  // incident: "yes yes" caused two distinct bridge tx hashes.
  confirmedToolNames: [
    'prepare_swap',
    'prepare_transfer',
    'prepare_morpho_deposit',
    'prepare_defi_deposit',
    'prepare_uniswap_lp',
    'execute_uniswap_lp',
    'prepare_remove_liquidity',
    'collect_lp_fees',
  ],
};

// ---------------------------------------------------------------------------
// Delphi-specific request body
// ---------------------------------------------------------------------------

interface DelphiRequest extends ChatRequestBody {
  connectedChainId?: number | null;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const POST = createChatRoute<DelphiRequest, DelphiContext>({
  agentLoopConfig: DELPHI_CONFIG,
  openrouter,
  maxMessageChars: 10_000,
  rateLimitEndpoint: '/api/dashboard/delphi',
  errorMessage: 'DeFi data is loading, give me a sec... Try again.',
  loadContext: async (body) => {
    const delphiContext: DelphiContext = {
      walletAddress: body.walletAddress ?? null,
      connectedChainId: body.connectedChainId ?? null,
    };
    return { context: delphiContext };
  },
  buildSystemPrompt: (_body, ctx) => buildDelphiPrompt(ctx),
});
