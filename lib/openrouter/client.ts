/**
 * OpenRouter API Client
 * Provides access to 200+ AI models through a unified interface
 * Uses OpenAI SDK with OpenRouter baseURL
 */

import OpenAI from 'openai';

// Initialize OpenRouter client using OpenAI SDK
const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://supermission.fun',
    'X-Title': 'SUPERMISSION AI Agents',
  },
});

export interface ChatCompletionOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  response_format?: { type: 'json_object' };
}

/**
 * Make a chat completion request to any model on OpenRouter
 *
 * @param model - Model identifier (e.g., 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o')
 * @param systemPrompt - System instructions for the AI
 * @param userMessage - User's message/task description
 * @param options - Optional completion parameters
 * @returns AI's response text
 */
/**
 * Retry wrapper for transient errors (network failures, 5xx).
 * Single retry with exponential backoff.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isTransient =
        error instanceof Error &&
        (error.message.includes('ECONNRESET') ||
         error.message.includes('ETIMEDOUT') ||
         error.message.includes('ENOTFOUND') ||
         error.message.includes('fetch failed') ||
         // OpenAI SDK wraps HTTP errors — check for 5xx status
         ('status' in error && typeof (error as Record<string, unknown>).status === 'number' &&
          ((error as Record<string, unknown>).status as number) >= 500));

      if (!isTransient || attempt >= maxRetries) {
        throw error;
      }
      const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, ...
      console.warn(`[OpenRouter] Transient error, retrying in ${delayMs}ms (attempt ${attempt + 1}):`, error instanceof Error ? error.message : error);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

export async function chatCompletion(
  model: string,
  systemPrompt: string,
  userMessage: string,
  options: ChatCompletionOptions = {}
): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  try {
    return await withRetry(async () => {
      const response = await openrouter.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 4000,
        top_p: options.top_p,
        frequency_penalty: options.frequency_penalty,
        presence_penalty: options.presence_penalty,
        response_format: options.response_format,
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response from OpenRouter');
      }

      const content = response.choices[0].message?.content;
      if (!content) {
        throw new Error('Empty response content');
      }

      return content;
    });
  } catch (error) {
    console.error('[OpenRouter] Chat completion error:', error);
    throw error;
  }
}

/**
 * Strip markdown code blocks from a string
 * Handles ```json, ```, and other code block formats
 */
function stripMarkdownCodeBlocks(text: string): string {
  // Remove ```json or ``` at the start and ``` at the end
  let cleaned = text.trim();

  // Match opening code fence with optional language identifier
  const openingMatch = cleaned.match(/^```(?:json|JSON)?\s*\n?/);
  if (openingMatch) {
    cleaned = cleaned.slice(openingMatch[0].length);
  }

  // Match closing code fence
  const closingMatch = cleaned.match(/\n?```\s*$/);
  if (closingMatch) {
    cleaned = cleaned.slice(0, -closingMatch[0].length);
  }

  return cleaned.trim();
}

/**
 * Make a JSON-formatted chat completion request
 * Automatically parses the response as JSON
 *
 * @param model - Model identifier
 * @param systemPrompt - System instructions
 * @param userMessage - User's message
 * @param options - Optional completion parameters
 * @returns Parsed JSON response
 */
export async function chatCompletionJSON<T = unknown>(
  model: string,
  systemPrompt: string,
  userMessage: string,
  options: ChatCompletionOptions = {}
): Promise<T> {
  const response = await chatCompletion(model, systemPrompt, userMessage, {
    ...options,
    response_format: { type: 'json_object' },
  });

  try {
    // First try parsing as-is
    return JSON.parse(response) as T;
  } catch {
    // If that fails, try stripping markdown code blocks
    try {
      const cleaned = stripMarkdownCodeBlocks(response);
      return JSON.parse(cleaned) as T;
    } catch (error) {
      console.error('[OpenRouter] JSON parse error:', error);
      console.error('[OpenRouter] Response was:', response);
      throw new Error('Failed to parse JSON response');
    }
  }
}

/**
 * Supported models on OpenRouter
 * Optimized for cost and performance (v2.0.1)
 */
export const MODELS = {
  // Anthropic (Updated Jan 2025)
  CLAUDE_SONNET_4: 'anthropic/claude-sonnet-4', // Latest Claude Sonnet - best for security analysis
  CLAUDE_SONNET_35: 'anthropic/claude-3.5-sonnet', // Legacy
  CLAUDE_OPUS: 'anthropic/claude-3-opus',
  CLAUDE_HAIKU: 'anthropic/claude-3-haiku',
  CLAUDE_HAIKU_35: 'anthropic/claude-3.5-haiku', // $0.25/1M tokens - excellent for high-volume tasks

  // OpenAI
  GPT_5: 'openai/gpt-5', // Latest GPT model - advanced reasoning
  GPT_4O: 'openai/gpt-4o', // $2.50/1M tokens
  GPT_4O_MINI: 'openai/gpt-4o-mini', // $0.15/1M tokens - great for social content
  DALLE_3: 'openai/dall-e-3', // Image generation

  // DeepSeek (NEW)
  DEEPSEEK_V3: 'deepseek/deepseek-chat', // $0.055/1M tokens - exceptional for coding

  // Google
  GEMINI_PRO_25: 'google/gemini-2.5-pro-preview-05-06', // Latest Gemini Pro - great context window
  GEMINI_PRO_15: 'google/gemini-pro-1.5',
  GEMINI_FLASH_15: 'google/gemini-2.5-flash', // $0.075/1M tokens - 2025 version for data analysis

  // Perplexity (NEW)
  PERPLEXITY_SONAR: 'perplexity/sonar-pro', // Real-time web access for research

  // Meta
  LLAMA_31_70B: 'meta-llama/llama-3.1-70b-instruct',
  LLAMA_31_405B: 'meta-llama/llama-3.1-405b-instruct',

  // MiniMax
  MINIMAX_M27: 'minimax/minimax-m2.7',

  // Mistral
  MISTRAL_LARGE: 'mistralai/mistral-large',
  MISTRAL_MEDIUM: 'mistralai/mistral-medium',
} as const;

export default openrouter;
