/**
 * Unified LLM client factory for chat agents.
 *
 * Abstracts over two providers:
 *   1. Vercel AI Gateway (ai-gateway.vercel.sh) — OpenAI-compatible, gives us
 *      provider failover, per-turn cost attribution, OIDC auth in prod.
 *   2. OpenRouter (openrouter.ai) — the incumbent, kept as the default so
 *      nothing breaks if AI Gateway credentials aren't configured.
 *
 * Selection via env:
 *   AI_GATEWAY_PROVIDER=vercel    → Vercel AI Gateway
 *   (anything else, incl. unset)  → OpenRouter
 *
 * This is the ONE module that imports the `openai` SDK directly. The rest of
 * the agent runtime sees an OpenAI-compatible instance and doesn't know or
 * care which wire it talks to. Migrating to `ai` SDK's `streamText` in the
 * future means rewriting runAgentLoop, not the agent routes.
 *
 * Model naming:
 *   Both providers accept `<provider>/<model>` style identifiers
 *   (e.g. `google/gemini-2.5-flash`). Model availability may differ — check
 *   the provider's model list before switching. When flipping
 *   AI_GATEWAY_PROVIDER=vercel, verify primary/fallback models are both
 *   available on Vercel AI Gateway.
 */

import OpenAI from 'openai';

/**
 * Re-export the handful of OpenAI types the agent runtime needs so callers
 * import from here instead of reaching into `openai` directly. Keeps the
 * direct-SDK dependency localised to this one file.
 */
export type ChatClient = OpenAI;
export type ChatCompletionChunk = OpenAI.Chat.Completions.ChatCompletionChunk;
export type ChatCompletionMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool;

export type ChatProvider = 'openrouter' | 'vercel-gateway';

export function getChatProvider(): ChatProvider {
  const raw = (process.env.AI_GATEWAY_PROVIDER || '').toLowerCase();
  if (raw === 'vercel' || raw === 'vercel-gateway' || raw === 'gateway') {
    return 'vercel-gateway';
  }
  return 'openrouter';
}

/**
 * Build an OpenAI-compatible client for a chat agent. Uses the provider
 * selected via AI_GATEWAY_PROVIDER env. Safe to call at module load.
 */
export function createChatClient(agentName: string): OpenAI {
  const provider = getChatProvider();

  if (provider === 'vercel-gateway') {
    // Vercel AI Gateway. Uses OIDC token in Vercel deployments; locally, set
    // AI_GATEWAY_API_KEY from the Vercel dashboard → AI Gateway → Keys.
    const apiKey =
      process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN ||
      '';
    if (apiKey) {
      return new OpenAI({
        baseURL: 'https://ai-gateway.vercel.sh/v1',
        apiKey,
        defaultHeaders: {
          'X-Title': `SUPERMISSION ${agentName}`,
        },
      });
    }
    // Gateway selected but NOT configured. Rather than build a client with an
    // empty key (→ every request 401s → "temporarily unavailable"), fall back to
    // OpenRouter when its key is present. This is the common prod misconfig:
    // AI_GATEWAY_PROVIDER=vercel left set while only OPENROUTER_API_KEY exists.
    if (process.env.OPENROUTER_API_KEY) {
      console.warn(
        `[llm-client] ${agentName}: AI_GATEWAY_PROVIDER=vercel but no gateway ` +
          `credentials — falling back to OpenRouter (OPENROUTER_API_KEY is set).`,
      );
    } else if (process.env.NODE_ENV !== 'test') {
      console.error(
        `[llm-client] ${agentName}: no AI Gateway credentials AND no ` +
          `OPENROUTER_API_KEY — the chat request will fail with an auth error.`,
      );
    }
    // fall through to the OpenRouter client below.
  }

  // Default: OpenRouter (existing behaviour, no env changes required).
  if (!process.env.OPENROUTER_API_KEY && process.env.NODE_ENV !== 'test') {
    console.error(
      `[llm-client] ${agentName}: OPENROUTER_API_KEY is missing — chat will 401.`,
    );
  }
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || '',
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://supermission.fun',
      'X-Title': `SUPERMISSION ${agentName}`,
    },
  });
}

/**
 * Deprecated alias. Existing imports keep working; new code should use
 * createChatClient. Will be removed after all agents migrate (grep shows
 * only one remaining consumer, sse-agent-loop's internal re-export).
 *
 * @deprecated Use createChatClient instead.
 */
export const createOpenRouterClient = createChatClient;
