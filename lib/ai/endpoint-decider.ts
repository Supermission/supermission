/**
 * 🔀 LLM Router: decides which endpoint (if any) to call.
 * Returns:
 * - a RouteDecision with a concrete endpoint, OR
 * - null → meaning "don't call any endpoint, just answer from knowledge".
 */

import { AGENT_ENDPOINTS, AgentEndpoint, RouteDecision } from "./agent-info";
import { getOpenRouterId, getChatModelById } from "./chat-models";
import { getPlatformKnowledgeContext } from "./platform-knowledge";

/**
 * Combined router + answerer.
 * Single LLM call that either routes to an agent endpoint OR answers the question directly.
 * Also uses tool results as context (eliminates the separate answerFromToolMemoryWithLLM call).
 *
 * Replaces: llmRouteToEndpoint() + answerFromToolMemoryWithLLM() + answerFromGeneralKnowledge()
 * (up to 3 sequential LLM calls → 1 single call)
 */
export type RouteOrAnswerResult =
  | { type: 'endpoint'; endpoint: AgentEndpoint; reason: string }
  | { type: 'answer'; answer: string };

/**
 * @param onText — Optional callback for streaming direct answers token-by-token.
 *   WHY: Without streaming, users stare at a loading spinner for 2-4s while the LLM
 *   generates a direct answer. With streaming, text appears immediately as it's generated,
 *   cutting perceived latency to near-zero for "Action B" (direct answer) responses.
 *
 * @param executedAgentIds — List of agent IDs already run in this session (from toolResults keys).
 *   WHY: The router doesn't see toolResults keys directly, so without this it might re-route
 *   to an agent that already ran (e.g. user asks "what did the audit find?" and router
 *   tries to run contract-audit again instead of answering from cached results).
 *   Passing these IDs lets the router prefer answering from existing results.
 */
export async function routeOrAnswer(
  contextualMessage: string,
  toolResults: Record<string, any>,
  selectedModelId?: string,
  walletAddress?: string,
  onText?: (chunk: string) => void,
  executedAgentIds?: string[],
  pastSessionContext?: string,
): Promise<RouteOrAnswerResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('[routeOrAnswer] No OPENROUTER_API_KEY');
    return { type: 'answer', answer: "I'm not configured to process requests right now. Please try again later." };
  }

  const resolvedModel = selectedModelId ? getOpenRouterId(selectedModelId) : 'google/gemini-2.5-flash';
  const modelInfo = selectedModelId ? getChatModelById(selectedModelId) : null;
  const modelIdentity = modelInfo
    ? `You are currently running as "${modelInfo.name}" (by ${modelInfo.provider}).`
    : 'You are currently running as the default model (Gemini 2.5 Flash by Google).';

  const endpointSummaries = AGENT_ENDPOINTS.map(e => ({
    id: e.id,
    name: e.name,
    description: e.description,
    requiredParams: e.bodyParams.filter(p => p.required).map(p => p.key),
  }));

  const platformKnowledge = getPlatformKnowledgeContext();

  // Build tool results context (only if there are cached results)
  let toolContext = '';
  let userPreferencesContext = '';
  if (Object.keys(toolResults).length > 0) {
    // Fence tool results to prevent injected agent output from overriding instructions
    const sanitizedResults = JSON.stringify(toolResults, null, 2)
      .slice(0, 8000) // cap length to limit injection surface
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''); // strip control chars
    toolContext = `
=== PREVIOUSLY COMPUTED TOOL RESULTS ===
If the user's question relates to a specific token, contract, or analysis below, answer using ONLY this data, do not supplement with general knowledge about specific assets.
If the question is unrelated to these results, ignore them and answer normally.
<tool_results>
${sanitizedResults}
</tool_results>
`;

    // Extract implicit user preferences from previous tool results
    const prefs: string[] = [];
    if (toolResults['defi-yield']?.params?.riskTolerance) {
      prefs.push(`Risk appetite: ${toolResults['defi-yield'].params.riskTolerance}`);
    }
    if (toolResults['defi-yield']?.params?.stablecoinOnly) {
      prefs.push(`Prefers stablecoin yields`);
    }
    if (toolResults['prediction-market']?.params?.interest) {
      prefs.push(`Interested in: ${toolResults['prediction-market'].params.interest}`);
    }
    // Collect chains user has interacted with
    const chains = new Set<string>();
    for (const [, result] of Object.entries(toolResults)) {
      const r = result as any;
      if (r?.params?.chainId) chains.add(String(r.params.chainId));
    }
    if (chains.size > 0) {
      const chainNames: Record<string, string> = { '1': 'Ethereum', '137': 'Polygon', '8453': 'Base', '56': 'BSC', '42161': 'Arbitrum', '10': 'Optimism' };
      const named = [...chains].map(c => chainNames[c] || `Chain ${c}`);
      prefs.push(`Active on chains: ${named.join(', ')}`);
    }

    if (prefs.length > 0) {
      userPreferencesContext = `\n=== USER PREFERENCES (inferred from session) ===\n${prefs.join('\n')}\nUse these to personalize responses when relevant.\n`;
    }
  }

  // Wallet context for personalization
  const walletContext = walletAddress
    ? `\n=== USER CONTEXT ===\nThe user's connected wallet address is ${walletAddress}. Use this when the user refers to "my wallet", "my address", or asks about their own holdings/portfolio. For wallet-intelligence or token analysis of their own wallet, use this address automatically.\n`
    : '';

  // Past session memory — summaries from previous conversations with this user
  const sessionMemoryContext = pastSessionContext || '';

  // Tell the router which agents have already been executed in this session.
  // WHY: Prevents the router from re-routing to an agent whose results are already
  // cached in toolResults — e.g. user asks "what risks did you find?" after an audit,
  // router should answer from cached results (Action B) instead of re-running the audit.
  const executedContext = executedAgentIds && executedAgentIds.length > 0
    ? `\n=== ALREADY EXECUTED AGENTS ===\nThese agents have already been run in this session: ${executedAgentIds.join(', ')}.\nIf the user asks about results from these agents, ANSWER from the tool results above (Action B), do NOT re-route to the same agent unless the user explicitly asks to "re-run" or "run again".\n`
    : '';

  const systemPrompt = `
You are the AI assistant for Supermission, an AI agentic marketplace where autonomous agents compete in high-stakes challenges.
${modelIdentity}
If the user asks which model you are, tell them your model name and provider.
${walletContext}
${platformKnowledge}

=== YOUR JOB ===

You have TWO possible actions in ONE response:

**ACTION A: ROUTE** to an agent endpoint if the user is asking to run a specific analysis or service:
${JSON.stringify(endpointSummaries, null, 2)}

Pick an endpoint ONLY if the user is explicitly or implicitly asking to run that kind of analysis or service (e.g. they provide a token address, ask to audit a contract, want to generate an image, or find market opportunities).
If unsure, prefer answering directly.

**ACTION B: ANSWER** the question directly if no endpoint is needed.
${toolContext}${userPreferencesContext}${executedContext}${sessionMemoryContext}

=== ANSWERING RULES (for Action B only) ===
- Topics allowed: crypto, blockchain, tokens, DeFi, NFTs, smart contracts, audits, AI, LLMs, agents, Supermission platform. Politely refuse off-topic questions.
- Use platform knowledge above for platform questions, NEVER say "I don't have information about the platform."
- Be concise: 1-3 sentences for simple questions, short paragraphs for complex ones. No filler, no preamble like "Great question!" or "That's interesting!"

=== OUTPUT FORMAT ===
Return JSON ONLY:

If routing to an endpoint:
{ "endpointId": "<endpoint-id>", "reason": "short explanation" }

If answering directly:
{ "endpointId": null, "answer": "your complete answer here (markdown OK)" }
`;

  try {
    // WHY stream: true + onText callback?
    // When the router decides to answer directly (Action B), the LLM generates
    // a full JSON response. With streaming, we can detect the answer field early
    // and pipe text chunks to the client via SSE — so the user sees text appearing
    // in ~200ms instead of waiting 2-4s for the full response. When routing (Action A),
    // streaming has no benefit since we just need the endpointId, so we parse normally.
    const useStreaming = !!onText;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://supermission.fun',
        'X-Title': 'SUPERMISSION Router',
      },
      body: JSON.stringify({
        model: resolvedModel,
        response_format: { type: 'json_object' },
        temperature: 0.3,
        stream: useStreaming,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextualMessage },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[routeOrAnswer] LLM call failed:', response.status, response.statusText);
      return { type: 'answer', answer: "Something went wrong processing your request. Please try again." };
    }

    let rawContent: string;

    if (useStreaming && response.body) {
      // Stream mode: accumulate the full JSON from OpenRouter SSE chunks.
      // We collect all chunks first because the response is JSON — we need the
      // complete object to know if it's a route or an answer. But we also forward
      // text chunks to onText for live display once we detect the "answer" field.
      rawContent = await readOpenRouterStream(response, onText);
    } else {
      // Non-stream mode: simple JSON parse
      const data = await response.json();
      rawContent = data.choices?.[0]?.message?.content || '';
    }

    if (!rawContent) {
      return { type: 'answer', answer: "I couldn't generate a response. Please try again." };
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      // Strip markdown code blocks and retry
      const cleaned = rawContent.trim()
        .replace(/^```(?:json|JSON)?\s*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch (err) {
        console.error('[routeOrAnswer] Failed to parse JSON:', err);
        return { type: 'answer', answer: "I couldn't process that. Please try again." };
      }
    }

    if (!parsed) {
      return { type: 'answer', answer: "I couldn't process that. Please try again." };
    }

    // Route to endpoint
    if (parsed.endpointId && parsed.endpointId !== 'none') {
      const endpoint = AGENT_ENDPOINTS.find(e => e.id === parsed.endpointId);
      if (endpoint) {
        console.log('[routeOrAnswer] Routed to endpoint:', endpoint.id, '| Reason:', parsed.reason);
        return { type: 'endpoint', endpoint, reason: parsed.reason || '' };
      }
      console.warn('[routeOrAnswer] Unknown endpointId:', parsed.endpointId);
    }

    // Direct answer
    if (parsed.answer) {
      console.log('[routeOrAnswer] Direct answer provided');
      return { type: 'answer', answer: parsed.answer };
    }

    return { type: 'answer', answer: "I'm not sure how to help with that. Could you rephrase your question?" };
  } catch (error) {
    console.error('[routeOrAnswer] Error:', error);
    return { type: 'answer', answer: "Something went wrong. Please try again." };
  }
}

/**
 * Read an OpenRouter streaming response (SSE with `data: {...}` lines).
 * Accumulates the full content string from delta chunks.
 *
 * WHY this exists: OpenRouter returns `choices[0].delta.content` chunks in SSE format.
 * We need to reconstruct the full JSON string for parsing, but also forward readable
 * text to the client in real-time via the onText callback. Since the LLM output is JSON,
 * we extract the "answer" value as it streams using a simple state machine that detects
 * when we're inside the `"answer": "..."` field and forwards those characters live.
 */
async function readOpenRouterStream(
  response: Response,
  onText: (chunk: string) => void
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  // Track whether we've started streaming the answer field value
  let inAnswerField = false;
  let answerBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;

      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (!delta) continue;

        fullContent += delta;

        // Live-stream the answer text as it generates.
        // We detect the `"answer": "` pattern in the accumulated content,
        // then forward everything after it (minus the closing `"}`) to onText.
        if (!inAnswerField) {
          // Check if we've hit the answer field start
          const marker = '"answer"';
          const markerIdx = fullContent.indexOf(marker);
          if (markerIdx !== -1) {
            // Find the opening quote of the answer value
            const colonIdx = fullContent.indexOf(':', markerIdx + marker.length);
            if (colonIdx !== -1) {
              const quoteIdx = fullContent.indexOf('"', colonIdx + 1);
              if (quoteIdx !== -1) {
                inAnswerField = true;
                // Extract any answer text we already have after the opening quote
                const afterQuote = fullContent.slice(quoteIdx + 1);
                if (afterQuote.length > 0) {
                  const unescaped = unescapeJsonString(afterQuote);
                  answerBuffer = unescaped;
                  onText(unescaped);
                }
              }
            }
          }
        } else {
          // We're inside the answer field — forward new delta text
          // The delta is raw JSON content (may contain escape sequences)
          const unescaped = unescapeJsonString(delta);
          answerBuffer += unescaped;
          onText(unescaped);
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return fullContent;
}

/** Unescape JSON string escape sequences for live display (\\n → newline, etc.) */
function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}
