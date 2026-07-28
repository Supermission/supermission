/**
 * createChatRoute — shared SSE chat route builder.
 *
 * Consolidates the ~65-line boilerplate each agent route used to ship on its
 * own: JSON body parsing, message validation, SSE stream setup, wallet rate
 * limiting, chat-turn telemetry, error handling. Each agent now provides only
 * its own differences (system prompt, optional context loader, request shape).
 *
 * Gives every agent — not just Oracle — the Phase 1–5 improvements:
 *   - per-wallet rate limit (checkWalletRateLimit)
 *   - structured chat-turn telemetry (TTFB, tokens, cache hits, stale flags)
 *   - rollup metrics (chat-metrics counters)
 *   - consistent error emit + SSE frame handling
 *
 * Tight contract: callers provide a body validator, a prompt builder, and an
 * AgentLoopConfig. Everything else is handled here.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  sseEvent,
  sseResponse,
  runAgentLoop,
  type AgentLoopConfig,
} from '@/lib/ai/shared/sse-agent-loop';
import type { ChatClient } from '@/lib/ai/shared/llm-client';
import { startChatTurn, type CacheSignals } from '@/lib/ai/shared/chat-telemetry';
import { checkWalletRateLimit } from '@/lib/rate-limit';
import {
  getOrCreateSessionSummary,
  appendSummaryToSystemPrompt,
  HISTORY_WINDOW,
} from '@/lib/ai/shared/session-summary';

/** Minimum shape every chat request body must satisfy. */
export interface ChatRequestBody {
  message: string;
  walletAddress?: string | null;
  history?: Array<{ role: string; content: string }>;
  sessionId?: string;
}

export interface ChatRouteConfig<TBody extends ChatRequestBody, TContext = unknown> {
  /** Agent loop config — models, tools, action metadata extractor, etc. */
  agentLoopConfig: AgentLoopConfig;

  /** Shared chat client — created once per agent module with createChatClient(). */
  openrouter: ChatClient;

  /**
   * Max chars allowed in the user message. Defaults to 30_000. Securo runs
   * full contract source through — it uses 50_000.
   */
  maxMessageChars?: number;

  /**
   * Path to register with the per-wallet rate limiter. Pass the route path
   * (e.g. '/api/markets/oracle'). Omit to skip wallet rate-limiting — IP-tier
   * middleware still applies.
   */
  rateLimitEndpoint?: string;

  /**
   * Bind the request owner to the caller's FIRST verified wallet instead of the
   * client-sent walletAddress. RORO needs this: its Robinhood token is stored by
   * the connect/status/order routes keyed on `x-verified-wallet.split(',')[0]`,
   * but the chat client sends the embedded wallet — when those differ, connected
   * users read as NOT_CONNECTED. Leave off for agents whose data is keyed on the
   * embedded wallet the client sends.
   */
  ownerFromFirstVerifiedWallet?: boolean;

  /**
   * Parse and validate the raw body. Return either the typed body or a
   * { error } response payload. Default: passthrough cast — every agent
   * should override this with its own type guard.
   */
  parseBody?: (raw: any) => TBody | { error: string; status?: number };

  /**
   * Load agent-specific context (user positions, connected chain, etc.).
   * Optional — agents with no server-side context can omit this.
   *
   * Return value:
   *   - context: arbitrary shape passed into buildSystemPrompt
   *   - cacheHits: optional cache-hit signals recorded to telemetry
   */
  loadContext?: (body: TBody) => Promise<{ context: TContext; cacheHits?: CacheSignals }>;

  /**
   * Build the system prompt. Receives the parsed body and any context loaded
   * by loadContext. Return a string.
   */
  buildSystemPrompt: (body: TBody, context: TContext) => string | Promise<string>;

  /**
   * User-facing error message when the turn fails unexpectedly. Different
   * agents phrase this differently (Oracle: "Markets are noisy...", Delphi:
   * "DeFi data is loading..."). Default: generic retry message.
   */
  errorMessage?: string;

  /**
   * Resolve the session ID to use for this turn. Runs after body validation
   * and rate limiting, before telemetry/context/summarizer start.
   *
   * Return a string to override body.sessionId (e.g. Hyperion mints a new
   * `hy_<ts>_<rand>` when the client doesn't supply one), or return undefined
   * to keep body.sessionId as-is.
   */
  resolveSessionId?: (body: TBody) => Promise<string | undefined>;

  /**
   * Fire-and-forget hook called after a successful turn completes. Receives
   * the final response text and resolved session ID. Errors are logged, never
   * block the response.
   *
   * Typical use: persist the turn to an agent-specific table. Hyperion writes
   * to hyperion_messages / hyperion_sessions; Oracle/Delphi/Securo use the
   * client-side chat store and don't need this.
   */
  onTurnComplete?: (
    body: TBody,
    result: {
      responseText: string;
      sessionId: string | undefined;
      walletAddress: string | null;
    },
  ) => Promise<void>;
}

export function createChatRoute<TBody extends ChatRequestBody, TContext = unknown>(
  config: ChatRouteConfig<TBody, TContext>,
) {
  const maxMessageChars = config.maxMessageChars ?? 30_000;
  const errorMessage = config.errorMessage ?? 'Something went wrong. Try again.';
  const agentName = config.agentLoopConfig.name;

  return async function POST(req: NextRequest): Promise<Response> {
    // 1. Parse JSON
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // 2. Validate body — either via the provided parser or the minimum-shape check.
    let body: TBody;
    if (config.parseBody) {
      const parsed = config.parseBody(raw);
      if (parsed && typeof parsed === 'object' && 'error' in parsed) {
        return NextResponse.json(
          { error: (parsed as any).error },
          { status: (parsed as any).status ?? 400 },
        );
      }
      body = parsed as TBody;
    } else {
      body = raw as TBody;
    }

    const message = body.message;
    if (!message || typeof message !== 'string' || message.length > maxMessageChars) {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
    }

    // 2b. Bind identity to the JWT, not the client body (IDOR guard).
    // Middleware sets `x-verified-wallet` to the caller's verified Privy wallet
    // addresses (embedded + external, lowercased). The client sends its own
    // `walletAddress`; without this check a caller could pass someone else's
    // address and read their portfolio/positions/history. If the claimed address
    // isn't one of the caller's verified wallets, force it to their first verified
    // wallet. A normal user's embedded wallet IS verified, so this is a no-op for
    // legitimate requests. `verifiedWallets[0]` also matches how the Robinhood
    // connect/status/order routes key their tokens.
    const verifiedWallets = (req.headers.get('x-verified-wallet') || '')
      .split(',')
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    if (verifiedWallets.length > 0) {
      const claimed = (body.walletAddress || '').toLowerCase();
      if (config.ownerFromFirstVerifiedWallet) {
        // RORO: match the wallet its Robinhood token was stored under.
        body.walletAddress = verifiedWallets[0];
      } else if (!claimed || !verifiedWallets.includes(claimed)) {
        body.walletAddress = verifiedWallets[0];
      }
    }

    // 3. Per-wallet rate limit (in addition to middleware IP tier).
    if (config.rateLimitEndpoint) {
      const rateLimited = await checkWalletRateLimit(
        body.walletAddress ?? null,
        config.rateLimitEndpoint,
      );
      if (rateLimited) return rateLimited;
    }

    // 4. Resolve the session ID — agent may mint one server-side.
    let resolvedSessionId: string | undefined = body.sessionId;
    if (config.resolveSessionId) {
      try {
        const maybe = await config.resolveSessionId(body);
        if (maybe) resolvedSessionId = maybe;
      } catch (err) {
        console.warn(`[${agentName}] resolveSessionId failed, using body.sessionId:`, err);
      }
    }

    // 5. Telemetry handle — ends in the stream's try/catch.
    const history = body.history ?? [];
    const telemetry = startChatTurn({
      agent: agentName,
      walletAddress: body.walletAddress ?? null,
      sessionId: resolvedSessionId,
      messageChars: message.length,
      historyLen: history.length,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let outputChars = 0;
        let responseText = '';
        const emit = (event: string, data: unknown) => {
          if (event === 'text' && data && typeof data === 'object' && 'chunk' in (data as any)) {
            const chunk = String((data as any).chunk);
            outputChars += chunk.length;
            // Accumulate full response for onTurnComplete hooks (persistence, etc.).
            // Only agents that provide onTurnComplete pay the string-concat cost;
            // the runtime keeps a single string rather than an array, memory stays O(N).
            if (config.onTurnComplete) responseText += chunk;
          }
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        };

        try {
          // 6. Load context and kick off session-summary generation in parallel.
          //    The summary call only runs if history is long enough to need one
          //    (HISTORY_WINDOW turns) AND we have a sessionId to cache against.
          const contextPromise: Promise<{ context: TContext; cacheHits?: CacheSignals }> = config.loadContext
            ? config.loadContext(body)
            : Promise.resolve({ context: undefined as unknown as TContext });
          const summaryPromise =
            history.length > HISTORY_WINDOW && resolvedSessionId
              ? getOrCreateSessionSummary({
                  sessionId: resolvedSessionId,
                  history,
                  client: config.openrouter,
                  model: config.agentLoopConfig.primaryModel,
                })
              : Promise.resolve(null);

          const [loaded, summaryResult] = await Promise.all([contextPromise, summaryPromise]);
          const context = loaded.context;
          if (loaded.cacheHits) telemetry.setCache(loaded.cacheHits);
          telemetry.markSummary(
            summaryResult?.regenerated ? 'regenerated' : summaryResult ? 'reused' : 'none',
          );

          // 6. Build system prompt, append summary if we have one, run the loop.
          const baseSystemPrompt = await config.buildSystemPrompt(body, context);
          const systemPrompt = appendSummaryToSystemPrompt(
            baseSystemPrompt,
            summaryResult?.summary ?? null,
          );
          await runAgentLoop(
            config.agentLoopConfig,
            config.openrouter,
            systemPrompt,
            history,
            message,
            body.walletAddress ?? null,
            emit,
            resolvedSessionId,
            telemetry,
          );
          telemetry.end('ok', { outputChars });

          // Fire-and-forget post-turn persistence (Hyperion uses this to write
          // to hyperion_messages). Never blocks the response to the client.
          if (config.onTurnComplete) {
            config
              .onTurnComplete(body, {
                responseText,
                sessionId: resolvedSessionId,
                walletAddress: body.walletAddress ?? null,
              })
              .catch((err) => {
                console.warn(`[${agentName}] onTurnComplete failed (non-fatal):`, err);
              });
          }
        } catch (err: any) {
          // Log the real cause (status distinguishes 401 auth / 429 rate-limit /
          // 5xx provider outage) so "temporarily unavailable" is diagnosable.
          console.error(`[${agentName}] Error:`, {
            message: err?.message,
            status: err?.status ?? err?.response?.status,
            code: err?.code,
          });
          emit('error', { error: errorMessage });
          emit('done', { sessionId: resolvedSessionId });
          telemetry.end('error', { error: err?.message || 'unknown', outputChars });
        } finally {
          controller.close();
        }
      },
    });

    return sseResponse(stream);
  };
}
