import { ChatMessage, ConversationState } from "@/app/api/agent/chat/route";
import { AGENT_ENDPOINTS, AgentEndpoint } from "./agent-info";
import { routeOrAnswer } from "./endpoint-decider";
import { callAgentEndpoint } from "./call-agent-endpoint";
import { handleRunWithParams } from "./ai-helpers";

import { detectPlatformIntent, buildPlatformShowcaseResponse } from "./platform-knowledge";
import { llmExtractParams, askForMissingParams, assessAndRespond, type ClarificationOption } from "./param-extraction";
import { MessageAttachment } from "@/lib/store/chat";
import { detectImageIntent } from "./image-router";
import { handleTokenAnalysisIntent, handleImageModificationIntent, handleGeneralImageQuery } from "./image-intent-handler";
import { sanitizeInput } from "@/lib/agent-economy/utils/sanitize";
import { computeAllocation } from "./prediction-market-allocator";
import { persistUserPreferences } from "./user-context";
import { fetchPastSessionContext, summarizeSessionIfNeeded, backfillUnsummarizedSessions } from "./session-memory";

/** Build a JSON response string that the client will parse into a clarification action */
function buildClarificationResponse(
  message: string,
  options?: ClarificationOption[]
): string {
  return JSON.stringify({
    message,
    action: {
      type: 'agent_clarification',
      data: {
        question: message,
        options: options || [],
        allowCustom: true,
        allowSkip: true,
      },
    },
  });
}

const STRUCTURED_VISUAL_ENDPOINTS = [
  { id: 'token-due-diligence', actionType: 'token_dd_result' },
  { id: 'prediction-market', actionType: 'prediction_market_grid' },
  { id: 'contract-audit', actionType: 'contract_audit_result' },
  { id: 'super-image-gen', actionType: 'image_gen_result' },
  { id: 'defi-yield', actionType: 'defi_yield_result' },
  { id: 'defi-agent', actionType: 'defi_swap_quote' },
  { id: 'wallet-intelligence', actionType: 'wallet_intelligence_result' },
  { id: 'morpho-lend', actionType: 'morpho_vault_result' },
] as const;

function getActionType(endpointId: string): string | null {
  return STRUCTURED_VISUAL_ENDPOINTS.find(e => e.id === endpointId)?.actionType || null;
}

/** Wrap untrusted data in XML-style delimiters so the LLM treats it as data, not instructions. */
function fence(label: string, value: string): string {
  return `<${label}>${sanitize(value)}</${label}>`;
}

/** Strip control characters, HTML-entity-escape, and cap length to limit prompt-injection surface. */
function sanitize(input: string, maxLength = 2000): string {
  return sanitizeInput(
    input
      .slice(0, maxLength)
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
  );
}

/**
 * Summarize older messages into a compact block so the LLM gets context
 * from the full conversation without blowing up the token budget.
 * Messages beyond the recent window are compressed into bullet points.
 */
function summarizeOlderMessages(
  messages: Array<{ role: string; content: string }>,
  recentCount: number
): string {
  if (messages.length <= recentCount) return '';

  const older = messages.slice(0, messages.length - recentCount);

  // Extract key topics: addresses, agent results, user intents
  const topics: string[] = [];
  const seenAddresses = new Set<string>();

  for (const m of older) {
    // Collect EVM addresses mentioned
    const addresses = m.content.match(/0x[a-fA-F0-9]{40}/g);
    if (addresses) {
      for (const addr of addresses) {
        if (!seenAddresses.has(addr)) {
          seenAddresses.add(addr);
          topics.push(`Address mentioned: ${addr}`);
        }
      }
    }

    // Collect user intents (first 80 chars of user messages)
    if (m.role === 'user' && m.content.length > 0) {
      topics.push(`User: ${m.content.slice(0, 80)}${m.content.length > 80 ? '...' : ''}`);
    }

    // Detect agent result types from assistant JSON
    if (m.role === 'assistant') {
      try {
        const parsed = JSON.parse(m.content);
        if (parsed?.action?.type) {
          topics.push(`Agent result: ${parsed.action.type}`);
        }
      } catch {
        // Not JSON — summarize short assistant messages
        if (m.content.length < 200) {
          topics.push(`Assistant: ${m.content.slice(0, 80)}...`);
        }
      }
    }
  }

  if (topics.length === 0) return '';
  // Cap to 15 most recent topics
  const capped = topics.slice(-15).join('\n');
  return `Earlier in this conversation:\n${capped}`;
}

export function buildContextualPrompt(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant' | 'system', content: string }>
): string {
  if (!conversationHistory.length) return fence('user_message', message);

  const RECENT_WINDOW = 20;
  const summary = summarizeOlderMessages(conversationHistory, RECENT_WINDOW);

  const recentHistory = conversationHistory
    .slice(-RECENT_WINDOW)
    .map(m => `${m.role.toUpperCase()}: ${sanitize(m.content)}`)
    .join('\n');

  let prompt = '';
  if (summary) {
    prompt += `${fence('conversation_summary', summary)}\n\n`;
  }
  prompt += `Conversation so far:\n${fence('conversation_history', recentHistory)}`;
  prompt += `\n\nLatest user request:\n${fence('user_message', message)}`;

  return prompt;
}

/**
 * 2) Extract parameters (chainId, contractAddress) from a single text.
 * Used for both the latest message and the conversation history.
 */
interface ExtractedParams {
  chainId?: string;
  contractAddress?: string;
}

function extractParamsFromText(text: string): ExtractedParams {
  const lower = text.toLowerCase();
  const result: ExtractedParams = {};

  // Contract address (EVM-style)
  const addrMatch = text.match(/0x[a-fA-F0-9]{40}/);
  if (addrMatch) {
    result.contractAddress = addrMatch[0];
  }

  // chainId patterns like:
  // "chain id: 1", "chainId=1", "on chain 1"
  const chainIdMatch =
    lower.match(/chain\s*id\s*[:=]\s*(\d{1,6})/) ||
    lower.match(/chainid\s*[:=]\s*(\d{1,6})/) ||
    lower.match(/on\s*chain\s*(\d{1,6})/);

  if (chainIdMatch && chainIdMatch[1]) {
    result.chainId = chainIdMatch[1];
  }

  // crude special case: "ethereum mainnet" => 1, etc.
  if (!result.chainId) {
    if (lower.includes('ethereum')) result.chainId = "1";
    else if (lower.includes('polygon') || lower.includes('matic')) result.chainId = "137";
    else if (lower.includes('bsc') || lower.includes('binance')) result.chainId = "56";
  }

  return result;
}

/**
 * 3) Resolve endpoint params from:
 * - current message
 * - full conversation history (latest user messages first)
 */
interface ParamResolution {
  provided: Record<string, any>;
  missing: string[]; // param labels to ask for
}

async function resolveEndpointParams(
  endpoint: AgentEndpoint,
  currentMessage: string,
  conversationHistory: ChatMessage[],
  modelId?: string
): Promise<ParamResolution> {
  const provided: Record<string, any> = {};

  // First: current message
  const fromCurrent = extractParamsFromText(currentMessage);
  if (fromCurrent.chainId != null) provided.chainId = fromCurrent.chainId;
  if (fromCurrent.contractAddress) provided.contractAddress = fromCurrent.contractAddress;

  // Then: previous user messages, from latest to oldest
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (msg.role !== 'user') continue;

    const extracted = extractParamsFromText(msg.content);

    if (provided.chainId == null && extracted.chainId != null) {
      provided.chainId = extracted.chainId;
    }
    if (!provided.contractAddress && extracted.contractAddress) {
      provided.contractAddress = extracted.contractAddress;
    }

    if (provided.chainId != null && provided.contractAddress) break;
  }

  // Debug log
  console.log('[resolveEndpointParams] Regex found:', provided);

  // 2. LLM Extraction (always runs — regex is a rough first pass, LLM understands context)
  const llmParams = await llmExtractParams(endpoint, currentMessage, conversationHistory, modelId);
  console.log('[resolveEndpointParams] LLM extracted:', llmParams);

  // Merge LLM params (filling in gaps)
  Object.entries(llmParams).forEach(([key, value]) => {
    if (value != null && provided[key] == null) {
      provided[key] = value;
    }
  });

  // Now check required params for this endpoint
  const missing: string[] = [];

  // Special handling for contract-audit: needs either sourceCode OR (contractAddress + chainId)
  if (endpoint.id === 'contract-audit') {
    const hasSourceCode = !!provided.sourceCode;
    const hasContractAddress = !!provided.contractAddress;
    const hasChainId = provided.chainId != null;

    // Default to Base (8453) when address is provided but no chain specified
    if (hasContractAddress && !hasChainId) {
      provided.chainId = 8453;
    }

    // If no source code and no contract address at all, we need to show the input panel
    if (!hasSourceCode && !hasContractAddress) {
      missing.push('contract_details'); // Trigger param request panel
    }
    return { provided, missing };
  }

  for (const param of endpoint.bodyParams) {
    if (!param.required) continue;
    // Check if the parameter is missing or explicitly undefined/null
    if (provided[param.key] == null) {
      missing.push(param.label);
    }
  }

  return { provided, missing };
}

export async function formatAgentResponse(
  endpoint: AgentEndpoint,
  rawData: any,
): Promise<string> {
  // Check if this is a structured visual endpoint
  const actionType = getActionType(endpoint.id);
  if (actionType) {

    const resultData = rawData.data || rawData;

    // Determine display name based on endpoint
    let displayName = 'Result';
    let riskInfo = '';

    if (endpoint.id === 'token-due-diligence') {
      displayName = resultData.token?.name || resultData.identity?.name || resultData.name || 'Token';
      const riskLevel = resultData.verdict?.overall || resultData.riskSummary?.level || 'UNKNOWN';
      if (resultData.verdict) {
        riskInfo = ` - Overall Risk: **${riskLevel}** (Confidence: ${Math.round((resultData.verdict.confidence || 0) * 100)}%)`;
      } else if (resultData.riskSummary) {
        riskInfo = ` - Overall Risk: **${riskLevel}** (Score: ${resultData.riskSummary.score}/100)`;
      }
    } else if (endpoint.id === 'contract-audit') {
      displayName = resultData.metadata?.name || 'Contract';
      const riskLevel = resultData.verdict?.overall || 'UNKNOWN';
      const auditScore = resultData.verdict?.auditScore || 0;
      riskInfo = ` - Risk Level: **${riskLevel}** (Audit Score: ${auditScore}/100)`;
      if (rawData.aiReport) {
        riskInfo += ` with AI-enhanced analysis`;
      }
    } else if (endpoint.id === 'prediction-market') {
      // Early return for prediction-market with grid payload
      const deals = resultData.all_deals || [];
      const total = resultData.total_opportunities || 0;
      return JSON.stringify({
        message: total === 0
          ? (rawData.message || 'No markets found matching your filters. Try broadening your criteria.')
          : `Found ${total} markets matching your filters. Here are the top ${deals.length}, select the ones you want to trade.`,
        action: {
          type: 'prediction_market_grid',
          data: {
            markets: deals,
            total_opportunities: total,
            offer_created_at: resultData.offer_created_at,
            filters_applied: resultData.filters_applied,
          },
        },
      });
    } else if (endpoint.id === 'defi-agent') {
      // DeFi Agent returns its own message, pass through quote data
      const quote = resultData.quote;
      if (quote) {
        const isBridge = quote.type === 'bridge';
        displayName = isBridge ? 'Bridge Quote' : 'Swap Quote';
        riskInfo = `: ${quote.amountInFormatted || '?'} ${quote.fromSymbol || ''} → ${quote.amountOutFormatted || '?'} ${quote.toSymbol || ''} via ${quote.route || quote.source || 'LI.FI'}`;
      } else {
        // Non-quote responses (general, yield_scan, etc.) — use agent's message directly
        return JSON.stringify({
          message: rawData.message || resultData.message || 'Done.',
          action: resultData.suggestions ? {
            type: 'defi_swap_quote',
            data: resultData,
          } : null,
        });
      }
    } else if (endpoint.id === 'defi-yield') {
      displayName = 'BASE Yield Scan';
      const considered = resultData.poolsConsidered ?? resultData.totalPoolsFound;
      const tolerance = resultData.filtersApplied?.riskTolerance || 'medium';
      if (considered != null) {
        riskInfo = `: scanned **${considered}** pools for **${tolerance} risk** opportunities`;
      }
    } else if (endpoint.id === 'morpho-lend') {
      // Morpho agent returns its own message + structured vault data
      return JSON.stringify({
        message: rawData.message || resultData.message || 'Here are your Morpho vault results.',
        action: {
          type: 'morpho_vault_result',
          data: resultData,
        },
      });
    }

    let summaryMessage = `Here's your **${displayName}**${riskInfo}`;

    // For prediction markets with no results, show the agent's message instead
    if (endpoint.id === 'prediction-market' && resultData.total_opportunities === 0 && rawData.message) {
      summaryMessage = rawData.message;
    }

    // Add a conversational top-picks preview for defi-yield
    if (endpoint.id === 'defi-yield') {
      const picks =
        Array.isArray(resultData?.rankedOpportunities) ? resultData.rankedOpportunities :
        Array.isArray(resultData?.pools) ? resultData.pools :
        [];

      if (Array.isArray(picks) && picks.length > 0) {
        const top = picks.slice(0, 3).map((p: any) => {
          const symbol = p.symbol || p.symbols || 'POOL';
          const project = p.project || 'Unknown';
          const apy = typeof p.apy === 'number' ? p.apy : Number(p.apy || 0);
          const apyStr = apy >= 1000 ? `${Math.round(apy).toLocaleString()}%` : `${apy.toFixed(2)}%`;

          return `**${symbol}** on ${project} at **${apyStr}** APY`;
        }).join(', ');

        summaryMessage += `\n\nStandout markets: ${top}`;
        summaryMessage += `\n\nCheck the details below, expand any market to see risk breakdown and swap.`;
      }
    }

    // For contract-audit, merge aiReport if present
    const finalData = endpoint.id === 'contract-audit'
      ? { ...resultData, aiReport: rawData.aiReport || null }
      : resultData;

    const payload = {
      message: summaryMessage,
      action: {
        type: actionType,
        data: finalData,
      },
    };

    return JSON.stringify(payload);
  }

  // Fallback: return raw JSON (should not happen with current endpoints)
  return (
    `Done! Here's what **${endpoint.name}** found:\n\n` +
    '```json\n' +
    JSON.stringify(rawData, null, 2) +
    '\n```'
  );
}

/**
 * Detect if the user's message is a follow-up to a recent agent result.
 * If the last toolResult is < 5 min old and the message looks like a follow-up
 * (short, no new address, conversational), skip the routing LLM call entirely.
 */
function detectFollowUpEndpoint(
  toolResults: Record<string, any>,
  message: string
): AgentEndpoint | null {
  // Only for short, conversational messages (not new full requests)
  if (message.length > 150) return null;

  // If user provides a new address, it might be a new request
  if (/0x[a-fA-F0-9]{40}/.test(message)) return null;

  // Find the most recent tool result
  let latestId: string | null = null;
  let latestTime = 0;
  for (const [id, result] of Object.entries(toolResults)) {
    const t = result?.at || 0;
    if (t > latestTime) {
      latestTime = t;
      latestId = id;
    }
  }

  if (!latestId || !latestTime) return null;

  // Must be within 5 minutes
  if (Date.now() - latestTime > 5 * 60 * 1000) return null;

  // Follow-up patterns: questions about the result, "show more", "explain", refinements
  const followUpPatterns = /\b(show\s*more|more\s*(detail|info|markets|yields|results)|explain|what\s*about|tell\s*me\s*more|why|how\s*(come|about|does)|expand|breakdown|elaborate|which\s*one|compare|summarize|risk|safe|recommend|another|next|previous)\b/i;
  if (!followUpPatterns.test(message)) return null;

  const endpoint = AGENT_ENDPOINTS.find(e => e.id === latestId);
  if (endpoint) {
    console.log(`[detectFollowUpEndpoint] Follow-up detected for ${latestId}, skipping routing`);
  }
  return endpoint || null;
}

/** Callback for streaming pipeline status updates to the client */
export type StatusCallback = (stage: string) => void;

/** Callback for streaming LLM text chunks to the client in real-time */
export type TextCallback = (chunk: string) => void;

/**
 * Auto-retry wrapper for transient failures from agent endpoints.
 * WHY: Agent endpoints call external APIs (DeFiLlama, Polymarket, etc.) that
 * occasionally return 502/503/504 or timeout. A single automatic retry with
 * a short backoff saves the user from manually clicking "Retry" for issues
 * that resolve themselves in seconds. Only retries on transient HTTP errors
 * (5xx) and timeouts — NOT on 4xx (client errors) which won't self-resolve.
 */
async function callWithRetry(
  fn: () => Promise<any>,
  maxRetries: number = 1,
  delayMs: number = 2000,
): Promise<any> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status || 0;
      const isTransient =
        status >= 500 || // 5xx server errors
        status === 0 ||  // network error (no status)
        err?.message?.includes('timed out') ||
        err?.message?.includes('aborted') ||
        err?.name === 'AbortError';

      // Don't retry client errors (4xx) — they won't self-resolve
      if (!isTransient || attempt === maxRetries) throw lastError;

      console.log(`[callWithRetry] Attempt ${attempt + 1} failed (status=${status}), retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

export async function processAIRequest(
  message: string,
  conversationState: ConversationState,
  walletAddress?: string,
  userSelectedAgentId?: string | null,
  selectedModelId?: string,
  attachments?: MessageAttachment[],
  onStatus?: StatusCallback,
  onText?: TextCallback,
): Promise<string> {
  const emit = onStatus || (() => {});
  const text = (message || '').trim();
  if (!text && (!attachments || attachments.length === 0)) {
    return "Hmm, looks like your message didn't come through. Mind sending that again?";
  }

  const { messages, toolResults } = conversationState;
  const sessionId = conversationState.sessionId;

  // 1. Handle special commands first (no LLM needed)
  if (text.startsWith('[RUN_WITH_PARAMS]')) {
    return await handleRunWithParams(text, toolResults, walletAddress);
  }

  // 1a. Handle prediction market selection "[PM_INVEST: cid1,cid2,...]"
  const investMatch = text.match(/\[PM_INVEST:\s*([^\]]+)\]/);
  if (investMatch && toolResults['prediction-market']?.result) {
    const selectedIds = investMatch[1].split(',').map((s: string) => s.trim());
    toolResults['prediction-market'].selectedIds = selectedIds;
    return JSON.stringify({
      message: `${selectedIds.length} markets selected. How much total would you like to invest? (e.g., "$50")`,
      action: null,
    });
  }

  // 1b. Handle budget input when markets are already selected
  const pendingSelections = toolResults['prediction-market']?.selectedIds;
  if (pendingSelections?.length > 0) {
    const budgetMatch = text.match(/\$?\s*(\d+(?:\.\d+)?)/);
    if (budgetMatch) {
      const budget = parseFloat(budgetMatch[1]);
      if (budget > 0) {
        const cachedMarkets = toolResults['prediction-market'].result?.data?.all_deals || [];
        const selected = cachedMarkets.filter((m: any) => pendingSelections.includes(m.condition_id));
        if (selected.length > 0) {
          const allocation = computeAllocation(selected, budget);
          // Clear pending selections after generating allocation
          delete toolResults['prediction-market'].selectedIds;
          return JSON.stringify({
            message: `Here's the recommended allocation for $${budget} across ${selected.length} markets:`,
            action: { type: 'prediction_market_allocation', data: allocation },
          });
        }
      }
    }
  }

  // 1c. Handle "show more" for prediction markets
  if (toolResults['prediction-market']?.result) {
    const isShowMore = /show\s*more|more\s*markets|next\s*(20|markets)|load\s*more/i.test(text);
    const isNotInterested = /not\s*interested|something\s*else|different|change|reset/i.test(text);

    if (isShowMore) {
      const pmEndpoint = AGENT_ENDPOINTS.find(e => e.id === 'prediction-market');
      if (pmEndpoint) {
        const currentPage = toolResults['prediction-market'].page || 0;
        const nextPage = currentPage + 1;
        const prevParams = toolResults['prediction-market'].params || {};
        const pageSize = prevParams.limit || 3;
        const offset = nextPage * pageSize;

        emit('Fetching more markets...');
        try {
          const rawResult = await callAgentEndpoint(
            pmEndpoint,
            { ...prevParams, offset },
            undefined,
            walletAddress
          );
          toolResults['prediction-market'] = {
            ...toolResults['prediction-market'],
            result: rawResult,
            page: nextPage,
            at: Date.now(),
          };
          return await formatAgentResponse(pmEndpoint, rawResult);
        } catch (err) {
          console.error('[processAIRequest] show-more failed:', err);
        }
      }
    }

    if (isNotInterested) {
      // Clear prediction market state and let the conversational flow restart
      delete toolResults['prediction-market'].selectedIds;
      toolResults['prediction-market'].page = 0;
      return JSON.stringify({
        message: "No problem. What are you looking for? A specific category, different risk level, or something else entirely?",
        action: null,
      });
    }
  }

  // 1.5. Handle image attachments - route based on intent
  if (attachments && attachments.length > 0) {
    const imageAttachment = attachments.find(a => a.type === 'image');
    if (imageAttachment) {
      emit('Analyzing image...');
      try {
        const intent = await detectImageIntent(imageAttachment, text || 'analyze this');
        switch (intent.type) {
          case 'token_analysis':
            return handleTokenAnalysisIntent(intent);
          case 'image_modification':
            return handleImageModificationIntent(intent);
          case 'general_query':
            return handleGeneralImageQuery(intent, text);
        }
      } catch (error) {
        console.error('[processAIRequest] Image routing error:', error);
      }
    }
  }

  // 2. Check for platform questions FIRST (before LLM routing)
  const platformIntent = detectPlatformIntent(text, messages.length);
  if (platformIntent.isPlatformQuestion && platformIntent.intentType) {
    return buildPlatformShowcaseResponse(platformIntent.intentType);
  }

  // 3. Build context ONCE
  const contextualMessage = buildContextualPrompt(text, messages);

  // 3b. Fetch cross-session memory (past session summaries → user profile)
  let pastSessionContext = '';
  if (walletAddress) {
    backfillUnsummarizedSessions(walletAddress).catch(() => {});
    pastSessionContext = await fetchPastSessionContext(walletAddress, sessionId);
  }

  // 4. Route to endpoint OR answer directly
  let endpoint: AgentEndpoint | null = null;

  if (userSelectedAgentId) {
    // User explicitly selected an agent — skip routing entirely
    endpoint = AGENT_ENDPOINTS.find(e => e.id === userSelectedAgentId) || null;
  } else {
    // Check for follow-up routing shortcut: if the last tool result is recent
    // and from a known endpoint, skip the LLM routing call
    const followUpEndpoint = detectFollowUpEndpoint(toolResults, text);
    if (followUpEndpoint) {
      endpoint = followUpEndpoint;
    } else {
      emit('Routing your request...');

      // Pass executed agent IDs so the router knows what's already been run
      // and can answer from cached results instead of re-routing.
      // Also pass onText for streaming direct answers token-by-token.
      const executedAgentIds = Object.keys(toolResults);
      const result = await routeOrAnswer(
        contextualMessage, toolResults, selectedModelId, walletAddress,
        onText, executedAgentIds, pastSessionContext
      );

      if (result.type === 'answer') {
        return result.answer;
      }

      endpoint = result.endpoint;
    }
  }

  if (!endpoint) {
    return `Hmm, I'm not recognizing that agent. Could you pick another one from the list?`;
  }

  // 5. Resolve parameters
  emit('Extracting parameters...');
  const { provided, missing } = await resolveEndpointParams(endpoint, text, messages, selectedModelId);

  // 6. Ask conversationally for missing params
  if (missing.length > 0) {
    const result = await askForMissingParams(endpoint, missing, text, selectedModelId);
    return buildClarificationResponse(result.message, result.options);
  }

  // 7. Defi-yield show-more shortcut
  if (endpoint.id === 'defi-yield') {
    const isShowMore = /show\s*more|more\s*markets|next\s*markets|more\s*yields?/i.test(text);
    const hasExistingResult = messages.some((m: any) => m.metadata?.action?.type === 'defi_yield_result');
    if (isShowMore && hasExistingResult) {
      emit('Fetching more yields...');
      const rawResult = await callAgentEndpoint(endpoint, provided, undefined, walletAddress);
      toolResults[endpoint.id] = { params: provided, result: rawResult, at: Date.now() };
      return await formatAgentResponse(endpoint, rawResult);
    }
  }

  // 8. Conversational readiness check
  // WHY deterministic check first: assessAndRespond makes an LLM call (~1-2s) just to
  // decide "are we ready?" But if all required params are already present, we're always
  // ready — no need to burn an LLM call. The LLM check only adds value when params are
  // missing and we need a natural-language follow-up question. This saves 1 LLM round-trip
  // for the majority of requests where the user provides complete info upfront.
  //
  // Conversational gate: check whether the user has provided enough context before
  // calling the endpoint. Fires when: (a) user hasn't explicitly selected an agent
  // (discovery flow) and required params are missing, OR (b) specifically for
  // prediction-market on its first interaction (/markets page asks preferences first).
  // All other explicitly-selected agents skip the gate entirely.
  if (endpoint.preferConversationalInput) {
    const allRequiredPresent = endpoint.bodyParams
      .filter(p => p.required)
      .every(p => provided[p.key] != null);

    const isFirstInteraction = !toolResults[endpoint.id];
    const isPMFirstUse = isFirstInteraction && endpoint.id === 'prediction-market';

    // Only gate when: no explicit agent selection + missing params, OR PM first use
    const shouldCheckReadiness = !userSelectedAgentId
      ? !allRequiredPresent
      : isPMFirstUse;

    if (shouldCheckReadiness) {
      emit('Checking readiness...');
      const readiness = await assessAndRespond(endpoint, provided, text, messages, selectedModelId);
      if (readiness.status === 'CONTINUE_CHATTING' && readiness.message) {
        const options = readiness.options && readiness.options.length > 0
          ? readiness.options
          : [{ id: 'yes', label: 'Yes, proceed' }, { id: 'more_info', label: 'Let me provide more details' }];
        return buildClarificationResponse(readiness.message, options);
      }
    }
  }

  // 9. Call agent endpoint with auto-retry on transient failures
  // WHY auto-retry: External APIs (DeFiLlama, Polymarket, block explorers) occasionally
  // return 502/503 or timeout. One retry with 2s backoff resolves ~80% of transient issues
  // without the user needing to manually click "Retry".
  emit(`Running ${endpoint.name}...`);
  try {
    const rawResult = await callWithRetry(
      () => callAgentEndpoint(endpoint, provided, undefined, walletAddress),
      1,    // max 1 retry (2 total attempts)
      2000, // 2s backoff
    );

    toolResults[endpoint.id] = {
      params: provided,
      result: rawResult,
      at: Date.now(),
      page: 0,
    };

    // Fire-and-forget: persist user preferences for prediction-market
    if (endpoint.id === 'prediction-market' && walletAddress) {
      const prefs: Record<string, any> = {};
      if (provided.category || provided.interest) prefs.favorite_categories = [provided.category || provided.interest];
      if (provided.riskAppetite) prefs.risk_appetite = provided.riskAppetite;
      if (provided.sortBy) prefs.preferred_sort = provided.sortBy;
      if (provided.sentiment) prefs.preferred_sentiment = provided.sentiment;
      if (Object.keys(prefs).length > 0) {
        persistUserPreferences(walletAddress, prefs).catch(() => {});
      }
    }

    emit('Formatting results...');
    return await formatAgentResponse(endpoint, rawResult);
  } catch (err) {
    console.error('[processAIRequest] agent execution failed:', err);
    const errMsg = err instanceof Error ? err.message : '';

    if (errMsg.includes('EOA') || errMsg.includes('not a smart contract')) {
      return `That address appears to be an **EOA (Externally Owned Account)**, not a smart contract. Please provide a valid contract address to audit.`;
    }

    if (errMsg.includes('timed out') || errMsg.includes('aborted')) {
      return `**${endpoint.name}** is taking longer than expected, the external data source may be slow right now. Please try again in a moment.`;
    }

    if ((err as any)?.status === 422) {
      return `**${endpoint.name}** couldn't process that request. ${errMsg || 'Please check the inputs and try again.'}`;
    }

    return `**${endpoint.name}** ran into an issue. ${errMsg || 'Please try again.'}`;
  }
}
