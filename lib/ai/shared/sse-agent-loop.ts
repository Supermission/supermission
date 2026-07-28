/**
 * Shared SSE streaming + agentic tool-calling loop.
 * Used by Oracle, Delphi, Securo, and any future agents.
 *
 * Consolidates the duplicated ~200-line pattern across agent routes:
 *  - OpenRouter client creation
 *  - SSE event formatting
 *  - Streaming tool-calling loop with fallback model
 *  - Parallel tool execution with timeout
 *  - Auto-clarification safety net
 */

import { mapWithLimit } from '@/lib/utils/concurrency';
import type { ChatTurnHandle } from './chat-telemetry';
import { retryWithBackoff, isTransientHttpError } from './retry';
import { checkCircuit, recordCircuitResult } from './circuit-breaker';
import {
  createChatClient,
  type ChatClient,
  type ChatCompletionChunk,
  type ChatCompletionMessageParam,
  type ChatCompletionTool,
} from './llm-client';

// Re-export the client factory so existing `createOpenRouterClient` imports
// from this module keep working without churn in every agent route.
export { createChatClient } from './llm-client';
/** @deprecated Use createChatClient. */
export const createOpenRouterClient = createChatClient;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentLoopConfig {
  /** Agent name for logs and OpenRouter X-Title header */
  name: string;
  /** Primary model ID (OpenRouter format) */
  primaryModel: string;
  /** Fallback model if primary fails */
  fallbackModel: string;
  /** Max tool-calling rounds before stopping */
  maxToolRounds: number;
  /** Tool definitions for the LLM */
  tools: ChatCompletionTool[];
  /** Execute a tool by name — returns { result: any } */
  executeTool: (name: string, args: Record<string, unknown>, walletAddress: string | null) => Promise<any>;
  /** Human-readable status message for a tool name */
  toolStatusMessage: (toolName: string) => string;
  /** Extract action metadata from a tool result */
  extractActionMetadata: (toolName: string, result: unknown, existing: any) => any;
  /** Tool timeout in ms, or a function for dynamic timeout based on parsed calls */
  toolTimeoutMs?: number | ((parsedCalls: { toolArgs: Record<string, unknown> }[]) => number);
  /** Max concurrent tool executions (default: 3) */
  maxConcurrentTools?: number;
  /** Max tokens for LLM response (default: 4096) */
  maxTokens?: number;
  /** LLM temperature (default: 0.7). Lower for deterministic agents (trade advice). */
  temperature?: number;
  /** Enable auto-clarification when LLM asks questions as plain text */
  enableClarificationSafetyNet?: boolean;
  /** Optional: skip tools for simple messages (e.g. Securo's conversational check) */
  messageNeedsTools?: (message: string) => boolean;
  /**
   * Tool names whose execution must be deduplicated within a single agent-loop
   * run. Guards against the LLM re-issuing the same `confirmed:true` tool call
   * when the user sends "yes" twice (or "yes yes"). A call is considered a
   * duplicate when name + arg signature match a prior call in this run.
   */
  confirmedToolNames?: string[];
  /**
   * Window (ms) within which a repeat confirmed call is treated as a duplicate.
   * The map is per-run, so this only matters if a single run lasts longer than
   * the window. Default 60_000.
   */
  confirmedDedupWindowMs?: number;
}

// ---------------------------------------------------------------------------
// SSE helper
// ---------------------------------------------------------------------------

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// SSE Response helper
// ---------------------------------------------------------------------------

export function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

// ---------------------------------------------------------------------------
// Streaming agentic tool-calling loop
// ---------------------------------------------------------------------------

export async function runAgentLoop(
  config: AgentLoopConfig,
  openrouter: ChatClient,
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  walletAddress: string | null,
  emit: (event: string, data: unknown) => void,
  sessionId?: string,
  telemetry?: ChatTurnHandle,
): Promise<void> {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of history.slice(-10)) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }
  }
  messages.push({ role: 'user', content: userMessage });

  let actionMetadata: any = null;
  let currentModel = config.primaryModel;
  let textWasStreamed = false;
  let lastContentAccum = '';

  // Per-run dedup for confirmed-execution tool calls. Prevents double-execution
  // when the LLM re-issues the same prepare_swap / prepare_trade / etc. across
  // rounds (e.g. user typed "yes" twice). See AgentLoopConfig.confirmedToolNames.
  const confirmedToolSet = new Set(config.confirmedToolNames ?? []);
  const dedupWindowMs = config.confirmedDedupWindowMs ?? 60_000;
  const executedConfirmedActions = new Map<string, { ts: number; result: any }>();
  const dedupKey = (toolName: string, args: Record<string, unknown>): string => {
    const sortedKeys = Object.keys(args).sort();
    const canon: Record<string, unknown> = {};
    for (const k of sortedKeys) canon[k] = (args as any)[k];
    return `${toolName}:${JSON.stringify(canon)}`;
  };

  // Optionally skip tools for simple conversational messages
  const useTools = config.messageNeedsTools
    ? config.messageNeedsTools(userMessage)
    : true;
  const maxRounds = useTools ? config.maxToolRounds : 1;
  const toolParams = useTools
    ? { tools: config.tools as any, tool_choice: 'auto' as const }
    : {};

  for (let round = 0; round < maxRounds; round++) {
    let completion: AsyncIterable<ChatCompletionChunk>;
    telemetry?.incrementRound();
    telemetry?.setModel(currentModel);

    // Circuit breaker short-circuit: if OpenRouter has been failing, skip the
    // primary and jump straight to the fallback model. This avoids the 3-attempt
    // retry tax during an ongoing outage.
    const primaryCircuit = await checkCircuit(`openrouter:${config.primaryModel}`, {
      failureThreshold: 5,
      cooldownMs: 30_000,
    });
    if (!primaryCircuit.allowed && currentModel === config.primaryModel && !textWasStreamed) {
      console.warn(`[${config.name}] Primary circuit OPEN — going straight to fallback`);
      currentModel = config.fallbackModel;
      telemetry?.setModel(currentModel);
      telemetry?.markModelSwitched();
      telemetry?.recordCircuitEvent(`openrouter:${config.primaryModel}`, 'open');
    }

    const createCompletion = (model: string) =>
      openrouter.chat.completions.create({
        model,
        messages,
        ...toolParams,
        temperature: config.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 4096,
        stream: true,
        // Opt into per-stream usage reporting so we can emit token counts in telemetry.
        // OpenRouter forwards this to the upstream provider; ignored by providers
        // that don't support it. Cast only this field so the `stream: true`
        // overload still narrows the return type to AsyncIterable<ChatCompletionChunk>.
        stream_options: { include_usage: true } as any,
      });

    try {
      // Retry on 429/5xx BEFORE falling back to the other model. Only safe
      // before the stream starts emitting tokens — once textWasStreamed is
      // true we stop retrying (partial tokens already sent to the user).
      completion = await retryWithBackoff(() => createCompletion(currentModel), {
        maxAttempts: textWasStreamed ? 1 : 3,
        baseMs: 400,
        maxMs: 2000,
        isRetryable: isTransientHttpError,
        onRetry: ({ attempt, delayMs }) =>
          console.warn(`[${config.name}] ${currentModel} retry ${attempt} in ${delayMs}ms`),
      });
      recordCircuitResult(`openrouter:${currentModel}`, true).catch(() => {});
    } catch (primaryErr) {
      recordCircuitResult(`openrouter:${currentModel}`, false).catch(() => {});
      if (currentModel === config.primaryModel && !textWasStreamed) {
        console.warn(`[${config.name}] Primary model failed, falling back:`, (primaryErr as Error).message);
        currentModel = config.fallbackModel;
        telemetry?.setModel(currentModel);
        telemetry?.markModelSwitched();
        try {
          completion = await retryWithBackoff(() => createCompletion(currentModel), {
            maxAttempts: 2,
            baseMs: 300,
            maxMs: 1500,
            isRetryable: isTransientHttpError,
          });
          recordCircuitResult(`openrouter:${currentModel}`, true).catch(() => {});
        } catch (fallbackErr) {
          recordCircuitResult(`openrouter:${currentModel}`, false).catch(() => {});
          throw fallbackErr;
        }
      } else {
        throw primaryErr;
      }
    }

    // Accumulate streamed response
    let contentAccum = '';
    let emittedLen = 0; // how much of contentAccum has been streamed to the client
    // Markers some models leak as plain text instead of structured tool_calls.
    const TOOL_MARKERS = ['[TOOL_CALL]', '<tool_call>', '<tool▁call>', '<｜tool▁call▁begin｜>'];
    const earliestMarker = (s: string): number => {
      let best = -1;
      for (const m of TOOL_MARKERS) {
        const i = s.indexOf(m);
        if (i !== -1 && (best === -1 || i < best)) best = i;
      }
      return best;
    };
    const toolCallAccum: Record<number, { id: string; name: string; arguments: string }> = {};
    let finishReason: string | null = null;

    for await (const chunk of completion) {
      const delta = chunk.choices?.[0]?.delta;
      finishReason = chunk.choices?.[0]?.finish_reason || finishReason;

      // Capture usage when the provider emits it (OpenRouter sends it on the
      // last chunk, OpenAI only when stream_options.include_usage is set).
      const usage = (chunk as any).usage;
      if (usage) {
        telemetry?.recordTokens({
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
          total: usage.total_tokens,
        });
      }
      if (!delta) continue;

      if (delta.content) {
        if (!textWasStreamed) telemetry?.markFirstToken();
        contentAccum += delta.content;
        textWasStreamed = true;
        // Some models emit tool invocations as literal "[TOOL_CALL] (...)" text
        // instead of structured tool_calls. Hold back any text from the marker
        // onward so it never reaches the UI; it's parsed after the stream ends.
        let cut = contentAccum.length;
        const mi = earliestMarker(contentAccum);
        if (mi !== -1) {
          cut = mi;
        } else {
          // Guard against a partially-streamed marker at the tail.
          for (const m of TOOL_MARKERS) {
            for (let k = m.length - 1; k > 0; k--) {
              if (contentAccum.endsWith(m.slice(0, k))) { cut = Math.min(cut, contentAccum.length - k); break; }
            }
          }
        }
        if (cut > emittedLen) {
          emit('text', { chunk: contentAccum.slice(emittedLen, cut) });
          emittedLen = cut;
        }
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallAccum[idx]) {
            toolCallAccum[idx] = { id: tc.id || '', name: '', arguments: '' };
          }
          if (tc.id) toolCallAccum[idx].id = tc.id;
          if (tc.function?.name && !toolCallAccum[idx].name) {
            toolCallAccum[idx].name = tc.function.name;
          }
          if (tc.function?.arguments) {
            toolCallAccum[idx].arguments += tc.function.arguments;
          }
        }
      }
    }

    // Recover tool calls that the model emitted as literal text instead of
    // structured tool_calls — e.g. `[TOOL_CALL] (tool => "redirect_to_agent", args => { --agent "delphi" })`
    // or `<tool_call>{"name":"redirect_to_agent","parameters":{"agent":"delphi","reason":"..."}}</tool_call>`.
    {
      const mi = earliestMarker(contentAccum);
      if (mi !== -1) {
        const block = contentAccum.slice(mi);
        contentAccum = contentAccum.slice(0, mi).trim();
        const toolName = block.match(/(?:"name"|\bname\b|\btool\b)\s*(?:=>|[:=])\s*["']([\w-]+)["']/i)?.[1];
        if (toolName === 'redirect_to_agent' && !actionMetadata) {
          const agent = block.match(/agent["']?\s*(?:=>|[:=])?\s*["']([\w-]+)["']/i)?.[1]
            || block.match(/--agent\s+["']?([\w-]+)/i)?.[1];
          const reason = block.match(/reason["']?\s*(?:=>|[:=])?\s*["']([^"']+)["']/i)?.[1]
            || block.match(/--reason\s+["']([^"']+)["']/i)?.[1];
          if (agent) {
            actionMetadata = { type: 'agent_redirect', data: { targetAgent: agent.toLowerCase(), reason: reason || `This task is handled by ${agent.toUpperCase()}.` } };
            // Ensure the user always gets the redirect prompt even if the model
            // left no clean prose before the leaked marker.
            if (!contentAccum) contentAccum = `That's ${agent.toUpperCase()}'s area, not mine.`;
          }
        }
        // Flush any prose that survived the strip but wasn't streamed yet.
        const pending = contentAccum.slice(Math.min(emittedLen, contentAccum.length));
        if (pending) { emit('text', { chunk: pending }); emittedLen = contentAccum.length; }
      }
    }

    // Push assistant message to conversation
    const toolCallsList = Object.values(toolCallAccum);
    const assistantMsg: any = { role: 'assistant', content: contentAccum || null };
    if (toolCallsList.length > 0) {
      assistantMsg.tool_calls = toolCallsList.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    messages.push(assistantMsg);

    if (finishReason === 'length') {
      console.warn(`[${config.name}] Response truncated — finish_reason=length on round`, round);
    }

    // Execute tool calls if present
    if (toolCallsList.length > 0) {
      for (const tc of toolCallsList) {
        emit('status', { stage: config.toolStatusMessage(tc.name) });
      }

      const parsedCalls = toolCallsList.map((tc) => {
        let toolArgs: Record<string, unknown> = {};
        try { toolArgs = JSON.parse(tc.arguments || '{}'); } catch { toolArgs = {}; }
        return { ...tc, toolArgs };
      });

      const timeoutMs = typeof config.toolTimeoutMs === 'function'
        ? config.toolTimeoutMs(parsedCalls)
        : (config.toolTimeoutMs ?? 30_000);

      const results = await mapWithLimit(
        parsedCalls,
        config.maxConcurrentTools ?? 3,
        async ({ name, toolArgs }) => {
          // Confirmed-action dedup: if this is a guarded tool with the same
          // args we just executed, return the prior result instead of running
          // the side-effect again. The LLM gets a `_deduped:true` marker so it
          // can acknowledge "already executed" on its next turn.
          if (confirmedToolSet.has(name)) {
            const key = dedupKey(name, toolArgs);
            const prior = executedConfirmedActions.get(key);
            if (prior && Date.now() - prior.ts < dedupWindowMs) {
              telemetry?.recordTool({
                name,
                duration_ms: 0,
                ok: true,
              });
              const dedupedPayload = prior.result && typeof prior.result === 'object'
                ? { ...prior.result, _deduped: true }
                : { result: prior.result, _deduped: true };
              emit('status', { stage: `${name} already executed — skipping duplicate confirmation.` });
              return { name, result: dedupedPayload };
            }
          }

          const toolStarted = Date.now();
          try {
            const result = await Promise.race([
              config.executeTool(name, toolArgs, walletAddress),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Tool ${name} timed out`)), timeoutMs),
              ),
            ]);
            const hasErr = result && typeof result === 'object' && 'result' in result && (result as any).result?.error;
            telemetry?.recordTool({
              name,
              duration_ms: Date.now() - toolStarted,
              ok: !hasErr,
              error: hasErr ? String((result as any).result.error) : undefined,
            });
            if (confirmedToolSet.has(name) && !hasErr) {
              executedConfirmedActions.set(dedupKey(name, toolArgs), {
                ts: Date.now(),
                result: (result as any)?.result ?? result,
              });
            }
            return result;
          } catch (err: any) {
            const message = err?.message || 'Tool timed out';
            telemetry?.recordTool({
              name,
              duration_ms: Date.now() - toolStarted,
              ok: false,
              error: message,
            });
            // Surface timeouts as a visible status message so the user isn't
            // left in silence after a stuck on-chain action. Trading agents
            // (ORACLE/DELPHI/HYPERION) need this — silence after a timeout
            // makes it impossible to know whether the order executed, failed,
            // or is mid-flight. The tool result still goes back to the LLM,
            // but if the model swallows it, the user has already seen the
            // status bubble.
            const isTimeout = /timed out/i.test(message);
            if (isTimeout) {
              emit('status', {
                stage: `⚠ ${name} timed out — on-chain status unknown. Check your wallet/explorer before retrying.`,
              });
            }
            return { name, result: { error: message } };
          }
        },
      );

      for (let j = 0; j < parsedCalls.length; j++) {
        const tc = parsedCalls[j];
        const toolResult = results[j];
        const raw: any = toolResult.result;

        // Extract and strip telemetry-only signals. Tools may attach a
        // `_telemetry` key with instrumentation data (cache hits, etc.) that
        // shouldn't be sent to the LLM — we apply them here and scrub the key
        // before serializing the tool result for the next LLM round.
        let payload = raw;
        if (raw && typeof raw === 'object' && raw._telemetry) {
          const t = raw._telemetry;
          if (t.positions_cache_hit) telemetry?.setCache({ positions_hit: true });
          if (t.research_cache_hit) telemetry?.setCache({ research_hit: true });
          if (t.stale_positions) telemetry?.markStalePositions();
          payload = { ...raw };
          delete payload._telemetry;
        }
        // Stale positions can also be inferred from the user-facing `stale` flag.
        if (payload && typeof payload === 'object' && payload.stale === true && (tc.name === 'get_my_positions' || tc.name === 'prepare_sell')) {
          telemetry?.markStalePositions();
        }

        actionMetadata = config.extractActionMetadata(tc.name, payload, actionMetadata);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(payload),
        } as any);
      }
      continue;
    }

    // No tool calls — we're done
    lastContentAccum = contentAccum;
    break;
  }

  // Auto-clarification safety net: if the LLM asked a question as plain text
  // instead of calling request_clarification, auto-generate the action.
  // Guards: only fires on short, non-rhetorical, non-data responses.
  if (config.enableClarificationSafetyNet && !actionMetadata && lastContentAccum?.includes('?')) {
    const trimmed = lastContentAccum.trim();
    const lines = trimmed.split('\n').filter(Boolean);
    const lastLine = (lines[lines.length - 1] || '').replace(/^\*+|\*+$/g, '').trim();

    const isShortResponse = trimmed.length < 300;
    const isRhetorical = /anything else|help with|let me know|does that|make sense|sound good|got it|sorry|apolog/i.test(lastLine);
    const hasStructuredData = /^\s*\|.+\|/m.test(trimmed) || /^```/m.test(trimmed);

    if (lastLine.includes('?') && isShortResponse && !isRhetorical && !hasStructuredData) {
      actionMetadata = {
        type: 'agent_clarification',
        data: {
          question: lastLine,
          options: [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
            { id: 'more_info', label: 'Let me provide more details' },
          ],
          allowCustom: true,
          allowSkip: true,
        },
      };
    }
  }

  // Auto-redirect safety net: if the LLM mentioned a sister agent by name
  // instead of calling redirect_to_agent, auto-generate the redirect action.
  // Only fires on short responses that don't already have an action.
  if (!actionMetadata && lastContentAccum) {
    const trimmed = lastContentAccum.trim();
    if (trimmed.length < 500) {
      const redirectSignals: { pattern: RegExp; agent: string; label: string }[] = [
        { pattern: /\bDELPHI\b.*\b(handle|swap|DeFi|yield|bridge|wallet|Dashboard)\b/i, agent: 'delphi', label: 'DELPHI' },
        { pattern: /\b(handle|swap|DeFi|yield|bridge|wallet|Dashboard)\b.*\bDELPHI\b/i, agent: 'delphi', label: 'DELPHI' },
        { pattern: /\bORACLE\b.*\b(handle|prediction|market|bet|trade)\b/i, agent: 'oracle', label: 'ORACLE' },
        { pattern: /\b(handle|prediction|market|bet|trade)\b.*\bORACLE\b/i, agent: 'oracle', label: 'ORACLE' },
        { pattern: /\bHYPERION\b.*\b(handle|perp|futures|trading)\b/i, agent: 'hyperion', label: 'HYPERION' },
        { pattern: /\b(handle|perp|futures|trading)\b.*\bHYPERION\b/i, agent: 'hyperion', label: 'HYPERION' },
        { pattern: /\bSECURO\b.*\b(handle|audit|security|contract)\b/i, agent: 'securo', label: 'SECURO' },
        { pattern: /\b(handle|audit|security|contract)\b.*\bSECURO\b/i, agent: 'securo', label: 'SECURO' },
      ];

      for (const { pattern, agent, label } of redirectSignals) {
        if (pattern.test(trimmed)) {
          // Extract first sentence as reason, cap at 120 chars
          const firstSentence = trimmed.split(/[.!?\n]/)[0]?.trim() || '';
          const reason = firstSentence.length > 120
            ? firstSentence.slice(0, 117) + '...'
            : firstSentence || `This task is handled by ${label}.`;
          actionMetadata = {
            type: 'agent_redirect',
            data: { targetAgent: agent, reason },
          };
          break;
        }
      }
    }
  }

  if (actionMetadata) {
    emit('action', { action: actionMetadata });
  }
  emit('done', { sessionId });
}
