/**
 * HYPERION — Hyperliquid perps trading agent endpoint.
 *
 * POST /api/hyperion/chat
 * Body: { message, sessionId?, walletAddress?, marketContext?, history? }
 * Response: SSE stream with events: status, text, action, error, done
 *
 * Migrated onto the shared lib/ai/agent-runtime. Gains per-wallet rate
 * limiting, chat-turn telemetry, circuit breaker + retry on the LLM, session
 * summarizer, and cache-hit tracking — all of which Hyperion was missing.
 *
 * Hyperion's unique bits survive via the runtime's lifecycle hooks:
 *   - resolveSessionId: mint an `hy_<ts>_<rand>` id when the client didn't
 *     send one, and provision a hyperion_sessions row.
 *   - onTurnComplete: persist the user+assistant turn to hyperion_messages.
 */

import { z } from 'zod';
import { HYPERION_SYSTEM_PROMPT, buildMarketContext } from '@/lib/ai/hyperion/prompt';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  createChatClient,
  type AgentLoopConfig,
} from '@/lib/ai/shared/sse-agent-loop';
import { createChatRoute, type ChatRequestBody } from '@/lib/ai/agent-runtime';

export const maxDuration = 120;

const openrouter = createChatClient('HYPERION');

// ---------------------------------------------------------------------------
// Market context type — injected by the client each turn with positions/funding/OI.
// ---------------------------------------------------------------------------

const marketContextSchema = z
  .object({
    topMarkets: z.array(
      z.object({
        coin: z.string(),
        price: z.string(),
        change24h: z.string(),
        volume: z.string(),
        funding: z.string(),
        oi: z.string(),
      }),
    ),
    userPositions: z.array(
      z.object({
        coin: z.string(),
        side: z.string(),
        size: z.string(),
        entry: z.string(),
        mark: z.string(),
        upnl: z.string(),
        liq: z.string(),
      }),
    ),
    accountSummary: z.object({
      equity: z.string(),
      availableMargin: z.string(),
      marginUsed: z.string(),
      totalUpnl: z.string(),
    }),
    activeCoin: z.string().optional(),
  })
  .optional();

type HyperionMarketContext = z.infer<typeof marketContextSchema>;

interface HyperionRequest extends ChatRequestBody {
  marketContext?: HyperionMarketContext;
}

// ---------------------------------------------------------------------------
// Agent config — no tools, different models than the others.
// Primary minimax (cheaper for high-volume perps trading chat), fallback Claude.
// ---------------------------------------------------------------------------

const HYPERION_CONFIG: AgentLoopConfig = {
  name: 'HYPERION',
  primaryModel: 'google/gemini-2.5-flash',
  fallbackModel: 'openai/gpt-4o-mini',
  maxToolRounds: 1,
  // No tools — Hyperion is pure conversational. The loop short-circuits the
  // tool path entirely when messageNeedsTools returns false.
  tools: [],
  executeTool: async () => ({ error: 'Hyperion has no tools' }),
  toolStatusMessage: () => 'Analyzing markets...',
  extractActionMetadata: (_name, _result, existing) => existing,
  messageNeedsTools: () => false,
};

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const POST = createChatRoute<HyperionRequest, HyperionMarketContext | undefined>({
  agentLoopConfig: HYPERION_CONFIG,
  openrouter,
  maxMessageChars: 10_000,
  rateLimitEndpoint: '/api/hyperion/chat',
  errorMessage: 'HYPERION encountered an issue. Try again in a moment.',

  parseBody: (raw) => {
    // marketContext has a rigid schema; everything else follows the standard
    // ChatRequestBody shape. We validate what's unique and let the runtime
    // handle the message/walletAddress/history/sessionId basics.
    const marketParse = marketContextSchema.safeParse((raw as any)?.marketContext);
    if (!marketParse.success) {
      return { error: 'Invalid marketContext', status: 400 };
    }
    return {
      ...(raw as any),
      marketContext: marketParse.data,
    } as HyperionRequest;
  },

  resolveSessionId: async (body) => {
    // Mint a server-side session id if none provided, and provision the
    // hyperion_sessions row. Idempotent: if body.sessionId exists we keep it
    // (so follow-up turns reuse the same row).
    if (body.sessionId) return body.sessionId;
    const sessionId = `hy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    if (body.walletAddress) {
      try {
        await supabaseAdmin.from('hyperion_sessions').insert({
          id: sessionId,
          user_id: body.walletAddress,
          wallet_address: body.walletAddress,
        });
      } catch (err) {
        console.warn('[HYPERION] session insert failed (non-critical):', err);
      }
    }
    return sessionId;
  },

  loadContext: async (body) => ({ context: body.marketContext }),

  buildSystemPrompt: (_body, marketContext) => {
    let prompt = HYPERION_SYSTEM_PROMPT;
    if (marketContext) prompt += buildMarketContext(marketContext);
    return prompt;
  },

  onTurnComplete: async (body, { responseText, sessionId }) => {
    // Persist the turn to hyperion_messages and bump the session's updated_at.
    // Runs fire-and-forget in the runtime; errors logged, never block the user.
    if (!body.walletAddress || !sessionId) return;
    await supabaseAdmin.from('hyperion_messages').insert([
      { session_id: sessionId, role: 'user', content: body.message },
      { session_id: sessionId, role: 'assistant', content: responseText },
    ]);
    await supabaseAdmin
      .from('hyperion_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);
  },
});
