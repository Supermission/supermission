/**
 * Lightweight LLM client for Vercel Functions.
 *
 * Intentionally simpler than worker/src/llmClient.ts because each Vercel
 * invocation is a fresh instance — no cross-call circuit breaker needed.
 * We just try MiniMax first, fall back to OpenRouter DeepSeek on overload.
 */

const MINIMAX_API_URL = 'https://api.minimax.io/anthropic/v1/messages';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_MODEL = 'MiniMax-M2.7';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_FALLBACK_MODEL = 'google/gemini-2.5-flash';

// Upstream-overloaded shapes — don't bother retrying MiniMax, swap provider.
function isOverloadStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function callMinimax(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  if (!MINIMAX_API_KEY) throw new Error('MINIMAX_API_KEY not set');
  const res = await fetch(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`MiniMax (${res.status}): ${txt.slice(0, 200)}`);
    (err as any).status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('MiniMax returned unexpected shape');
  return text;
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');
  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${model} (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('OpenRouter returned unexpected shape');
  return text;
}

/**
 * Single LLM call with automatic fallback. Returns the text response.
 * Caller is responsible for parsing (e.g. JSON extraction).
 */
export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const temperature = opts.temperature ?? 0.3;
  const maxTokens = opts.maxTokens ?? 4000;

  if (MINIMAX_API_KEY) {
    try {
      return await callMinimax(systemPrompt, userPrompt, temperature, maxTokens);
    } catch (err: any) {
      const status = err?.status ?? 0;
      if (!isOverloadStatus(status) && status !== 0) throw err;
      console.warn(`[LLM] MiniMax failed (${err?.message || err}) — falling back to OpenRouter`);
    }
  }

  return callOpenRouter(OPENROUTER_FALLBACK_MODEL, systemPrompt, userPrompt, temperature, Math.min(maxTokens, 8000));
}
