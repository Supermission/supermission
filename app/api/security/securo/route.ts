/**
 * SECURO — Smart contract security agent endpoint.
 *
 * POST /api/security/securo
 * Body: { message, walletAddress, history, sessionId }
 * Response: SSE stream with events: status, text, action, error, done
 *
 * Shared SSE + rate limit + telemetry handled by lib/ai/agent-runtime.
 */

import { buildSecuroPrompt, SecuroContext } from '@/lib/ai/securo/prompt';
import { SECURO_TOOLS, executeTool } from '@/lib/ai/securo/tools';
import {
  createOpenRouterClient,
  type AgentLoopConfig,
} from '@/lib/ai/shared/sse-agent-loop';
import { createChatRoute, type ChatRequestBody } from '@/lib/ai/agent-runtime';

// Deep audit's tool budget is 180s (see toolTimeoutMs below) and the prompt
// advertises ~2-3 min, so the function ceiling must exceed it or the platform
// kills the stream mid-audit (no done/error → empty reply).
export const maxDuration = 300;

const openrouter = createOpenRouterClient('SECURO');

// ---------------------------------------------------------------------------
// Tool-need heuristic — skip tools for simple conversational messages
// ---------------------------------------------------------------------------

function messageNeedsTools(message: string): boolean {
  if (message.length > 500) return true;
  if (/0x[a-fA-F0-9]{38,42}/.test(message)) return true;
  if (/pragma\s+solidity|contract\s+\w+\s*\{|function\s+\w+\s*\(|mapping\s*\(|import\s+["']@openzeppelin/i.test(message)) return true;
  if (/\b(audit|scan|analyz|check.*(contract|code|vulnerab)|vulnerabilit|exploit|reentrancy|security\s*(check|scan|audit|review))\b/i.test(message)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Agent-specific config
// ---------------------------------------------------------------------------

const TOOL_STATUS: Record<string, string> = {
  audit_contract: 'Auditing contract...',
  audit_by_address: 'Fetching & auditing contract...',
  research_topic: 'Researching...',
};

function extractActionMetadata(
  toolName: string,
  result: unknown,
  existing: any,
): any {
  const r = result as any;
  if (r && typeof r === 'object' && 'error' in r) return existing;

  switch (toolName) {
    case 'audit_contract':
    case 'audit_by_address':
      return { type: 'securo_audit_result', data: r };
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

const SECURO_CONFIG: AgentLoopConfig = {
  name: 'SECURO',
  primaryModel: 'google/gemini-2.5-flash',
  fallbackModel: 'openai/gpt-4o-mini',
  maxToolRounds: 5,
  // Audit reports run long — tables, executive summary, findings, gas notes,
  // OZ compliance, three-rule takeaway. The default 4096 was truncating
  // verdicts mid-sentence. 8192 fits a full deep audit comfortably.
  maxTokens: 8192,
  tools: SECURO_TOOLS as any,
  executeTool,
  toolStatusMessage: (name) => TOOL_STATUS[name] || 'Working...',
  extractActionMetadata,
  messageNeedsTools,
  // Dynamic timeout: deep audits need 3 minutes, normal tools 30s
  toolTimeoutMs: (parsedCalls) => {
    const hasDeepAudit = parsedCalls.some((c) => c.toolArgs?.deepAudit === true);
    return hasDeepAudit ? 180_000 : 30_000;
  },
};

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const POST = createChatRoute<ChatRequestBody, SecuroContext>({
  agentLoopConfig: SECURO_CONFIG,
  openrouter,
  // Securo accepts full contract source as input — larger than the other agents.
  maxMessageChars: 50_000,
  rateLimitEndpoint: '/api/security/securo',
  errorMessage: 'Security analysis encountered an issue. Try again.',
  loadContext: async (body) => ({
    context: { walletAddress: body.walletAddress ?? null } as SecuroContext,
  }),
  buildSystemPrompt: (_body, ctx) => buildSecuroPrompt(ctx),
});
