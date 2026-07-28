/**
 * Session summarizer — sliding-window conversation memory.
 *
 * Chat sessions that run beyond ~10 turns were losing context (runAgentLoop
 * slices history to the last 10 messages, so anything older was dropped
 * entirely). This module keeps the verbatim window small and preserves the
 * rest as a compact paragraph summary the LLM sees in its system prompt.
 *
 * Flow on each chat turn:
 *   1. Route handler calls getOrCreateSessionSummary() after loading context.
 *   2. If history.length <= HISTORY_WINDOW, return null — nothing to summarize.
 *   3. Otherwise check Redis for an existing summary:
 *        - If cached.turnsSummarized covers the current "older" set, reuse it.
 *        - If another SUMMARY_STRIDE turns have accumulated, regenerate with
 *          a small, fast LLM call.
 *   4. Return the summary string. Caller appends it to the system prompt.
 *
 * Fails open: if summarization errors, returns null. runAgentLoop still
 * slice(-10)s so the user gets a response — they just lose the earlier context,
 * same as pre-Phase-6 behaviour.
 *
 * Cost: one extra LLM call once per SUMMARY_STRIDE turns per session. At
 * default ($0.15/1M input, $0.60/1M output for gemini-2.5-flash) a summary
 * costs ~$0.0002. Trivially cheap vs the user experience win.
 */

import { redis } from '@/lib/redis/client';
import type { ChatClient } from './llm-client';

/** Turns of history we keep verbatim. */
export const HISTORY_WINDOW = 10;
/** Regenerate the summary once this many new turns accumulate beyond the last summary. */
export const SUMMARY_STRIDE = 10;
/** Max chars of per-turn content we pass to the summarizer. Guards against prompt explosions. */
const MAX_TURN_CHARS = 2000;
/** Redis TTL for a cached summary. */
const SUMMARY_TTL_SECONDS = 24 * 60 * 60;

export interface ChatHistoryMessage {
  role: string;
  content: string;
}

interface CachedSummary {
  summary: string;
  turnsSummarized: number;
  generatedAt: number;
}

function cacheKey(sessionId: string): string {
  return `chat:session-summary:${sessionId}`;
}

function formatTurnsForSummarizer(turns: ChatHistoryMessage[]): string {
  return turns
    .filter((t) => t.role === 'user' || t.role === 'assistant')
    .map((t) => {
      const content = (t.content || '').slice(0, MAX_TURN_CHARS);
      return `[${t.role.toUpperCase()}]\n${content}`;
    })
    .join('\n\n');
}

const SUMMARIZER_SYSTEM_PROMPT = `You are a conversation summarizer. You will receive a transcript of earlier chat turns between a user and an AI trading/DeFi/prediction-market assistant.

Produce ONE compact paragraph (3–5 sentences, max ~120 words) that the assistant can use as background context when the user continues the conversation. The summary MUST preserve:
- User's stated goals, risk preferences, budget, favourite categories.
- Markets, tokens, or positions the user asked about — with any prices/amounts/sides mentioned.
- Tool results that informed open decisions (e.g. "AI flagged X as 92% confident").
- Any pending confirmation the user left hanging ("user was about to confirm the $50 BTC YES trade").

Do NOT:
- Quote large blocks of text.
- Speculate beyond what was said.
- Add a preamble like "Here is a summary" — output only the paragraph.`;

async function callSummarizer(
  client: ChatClient,
  model: string,
  turns: ChatHistoryMessage[],
): Promise<string | null> {
  try {
    const transcript = formatTurnsForSummarizer(turns);
    if (!transcript) return null;

    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SUMMARIZER_SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
      temperature: 0.2,
      max_tokens: 400,
    });

    const text = res.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.warn('[session-summary] generation failed:', (err as Error).message);
    return null;
  }
}

async function readCached(sessionId: string): Promise<CachedSummary | null> {
  try {
    const raw = await redis.get<CachedSummary | string>(cacheKey(sessionId));
    if (!raw) return null;
    return typeof raw === 'string' ? (JSON.parse(raw) as CachedSummary) : raw;
  } catch {
    return null;
  }
}

async function writeCached(sessionId: string, value: CachedSummary): Promise<void> {
  try {
    await redis.set(cacheKey(sessionId), JSON.stringify(value), { ex: SUMMARY_TTL_SECONDS });
  } catch {
    // non-fatal
  }
}

export interface SummaryResult {
  summary: string;
  /** True when we regenerated (billed an LLM call), false when we served cache. */
  regenerated: boolean;
}

/**
 * Returns a conversation summary for the turns older than the last
 * HISTORY_WINDOW messages. Returns null when:
 *   - history is short enough to fit in the verbatim window
 *   - no sessionId (can't cache, not worth summarizing every request)
 *   - summarization fails
 */
export async function getOrCreateSessionSummary(input: {
  sessionId: string | null | undefined;
  history: ChatHistoryMessage[];
  client: ChatClient;
  model: string;
}): Promise<SummaryResult | null> {
  const { sessionId, history, client, model } = input;
  if (!sessionId) return null;
  if (history.length <= HISTORY_WINDOW) return null;

  const olderTurns = history.slice(0, history.length - HISTORY_WINDOW);
  const olderCount = olderTurns.length;

  const cached = await readCached(sessionId);

  // Reuse cache if it already covers the current older set (within one stride).
  // We regenerate only when the user has pushed SUMMARY_STRIDE more turns past
  // the boundary — not on every single new turn.
  if (cached && cached.turnsSummarized >= olderCount - SUMMARY_STRIDE) {
    return { summary: cached.summary, regenerated: false };
  }

  const summary = await callSummarizer(client, model, olderTurns);
  if (!summary) {
    // Use stale cache if we have one — still better than nothing.
    if (cached) return { summary: cached.summary, regenerated: false };
    return null;
  }

  await writeCached(sessionId, {
    summary,
    turnsSummarized: olderCount,
    generatedAt: Date.now(),
  });
  return { summary, regenerated: true };
}

/**
 * Compose the summary into a system-prompt suffix the LLM will see as
 * background context. Kept as a separate function so route handlers can
 * pick their own wrapper format if needed.
 */
export function appendSummaryToSystemPrompt(systemPrompt: string, summary: string | null): string {
  if (!summary) return systemPrompt;
  return `${systemPrompt}\n\n<EARLIER_CONVERSATION_SUMMARY>\n${summary}\n</EARLIER_CONVERSATION_SUMMARY>`;
}
