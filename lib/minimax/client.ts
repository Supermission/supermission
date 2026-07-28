/**
 * AI completion client for dashboard analyzers.
 *
 * Routes through OpenRouter using the cheap/fast google/gemini-2.5-flash model,
 * so only OPENROUTER_API_KEY is required (no separate MINIMAX_API_KEY).
 * Function names are kept for backwards-compat with existing importers.
 */

import { chatCompletion } from '@/lib/openrouter/client';

// Cheap, fast default routed via OpenRouter.
const DEFAULT_MODEL = 'google/gemini-2.5-flash';

interface MinimaxOptions {
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

export async function minimaxCompletion(
  systemPrompt: string,
  userMessage: string,
  options: MinimaxOptions = {}
): Promise<string> {
  return chatCompletion(DEFAULT_MODEL, systemPrompt, userMessage, {
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 4000,
    response_format: options.response_format,
  });
}

export async function minimaxCompletionJSON<T = any>(
  systemPrompt: string,
  userMessage: string,
  options: MinimaxOptions = {}
): Promise<T> {
  // Add explicit instruction to return JSON
  const enhancedSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must respond with valid JSON only. Do not include any text before or after the JSON object.`;

  const response = await minimaxCompletion(enhancedSystemPrompt, userMessage, options);

  try {
    // Try to extract JSON if wrapped in markdown code blocks
    let jsonText = response.trim();

    // Remove markdown code blocks if present
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }

    return JSON.parse(jsonText) as T;
  } catch {
    // Sanitize common LLM JSON mistakes and retry
    try {
      let sanitized = response.trim();
      const codeBlockMatch = sanitized.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) sanitized = codeBlockMatch[1].trim();

      // Fix unquoted ranges like 1-4, 5-10 used as values (should be first number)
      sanitized = sanitized.replace(/:\s*(\d+)-(\d+)\s*([,}\]])/g, ': $1$3');
      // Fix trailing commas before } or ]
      sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');

      return JSON.parse(sanitized) as T;
    } catch (retryError) {
      console.error('[Minimax] JSON parse error:', retryError);
      console.error('[Minimax] Response was:', response);
      throw new Error('Failed to parse Minimax JSON response');
    }
  }
}
