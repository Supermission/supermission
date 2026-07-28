import { ConversationState } from "@/app/api/agent/chat/route";

/**
 * Lightweight conversation state helper.
 * On serverless (Vercel), in-memory state is lost on every cold start.
 * The client sends conversationState in each request as the source of truth.
 * This module provides a simple factory — no persistent cache, no timers.
 */

export function createEmptyState(): ConversationState {
  return { messages: [], toolResults: {} };
}

const ALLOWED_ROLES = new Set<string>(['user', 'assistant']);
const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 10000;
const MAX_TOOL_RESULT_KEYS = 20;

/**
 * Build conversation state from the client-provided payload,
 * falling back to an empty state if nothing was sent.
 *
 * Security: strips system-role messages, caps message count/length,
 * and limits toolResults keys — client payloads are untrusted.
 */
export function hydrateState(clientState?: {
  messages?: Array<{ role: string; content: string; metadata?: Record<string, any> }>;
  toolResults?: Record<string, any>;
}): ConversationState {
  if (!clientState?.messages || !Array.isArray(clientState.messages)) {
    return createEmptyState();
  }

  // Filter to allowed roles only, cap length, strip control chars
  const sanitizedMessages = clientState.messages
    .filter(m => m && typeof m.role === 'string' && typeof m.content === 'string' && ALLOWED_ROLES.has(m.role))
    .slice(-MAX_MESSAGES)
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
        .slice(0, MAX_CONTENT_LENGTH)
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''),
      ...(m.metadata ? { metadata: m.metadata } : {}),
    }));

  // Limit toolResults keys to prevent payload bloat
  let sanitizedToolResults: Record<string, any> = {};
  if (clientState.toolResults && typeof clientState.toolResults === 'object') {
    const keys = Object.keys(clientState.toolResults).slice(0, MAX_TOOL_RESULT_KEYS);
    for (const key of keys) {
      sanitizedToolResults[key] = clientState.toolResults[key];
    }
  }

  return {
    messages: sanitizedMessages,
    toolResults: sanitizedToolResults,
  };
}
