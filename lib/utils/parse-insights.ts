/**
 * AI-powered insight parser
 * Extracts structured data from raw insight strings
 */

import { chatCompletionJSON, MODELS } from '@/lib/openrouter/client';

export interface ParsedInsight {
  stat: string;      // e.g., "57%", "$3.5M", "75%"
  source: string;    // e.g., "KALSHI", "POLYMARKET", "ANALYSTS"
  summary: string;   // e.g., "bettors predict Gemini will be top AI model"
}

const SYSTEM_PROMPT = `You are a prediction market analyst. Extract structured data from market insights.

For each insight, extract:
1. stat: The main number/percentage if present (e.g., "57%", "$3.5M"). If no number exists, use "UPDATE".
2. source: Where the data comes from in CAPS (e.g., "KALSHI", "POLYMARKET", "BLOOMBERG", "REUTERS"). If unclear, use "MARKET".
3. summary: Return the FULL original text without any truncation or modification.

IMPORTANT: Do NOT truncate or shorten the summary. Return the complete original text.

Return JSON array of parsed insights.`;

/**
 * Parse raw insights using AI
 * @param insights - Array of raw insight strings
 * @returns Array of parsed insights with stat, source, summary
 */
export async function parseInsightsWithAI(insights: string[]): Promise<ParsedInsight[]> {
  if (!insights || insights.length === 0) {
    return [];
  }

  try {
    const userMessage = `Parse these market insights into structured data. Return the FULL text in summary field - DO NOT truncate or add "...":

${insights.map((insight, i) => `${i + 1}. "${insight}"`).join('\n')}

Return a JSON object with an "insights" array containing objects with "stat", "source", and "summary" fields. The summary must be the COMPLETE original text.`;

    const result = await chatCompletionJSON<{ insights: ParsedInsight[] }>(
      MODELS.GPT_4O_MINI, // Fast and cheap for structured extraction
      SYSTEM_PROMPT,
      userMessage,
      { temperature: 0.3, max_tokens: 500 }
    );

    return result.insights || [];
  } catch (error) {
    console.error('[parseInsightsWithAI] Error:', error);
    // Return fallback parsed insights using regex
    return parseInsightsWithRegex(insights);
  }
}

/**
 * Fallback: Parse insights using regex patterns
 * Used when AI parsing fails
 */
export function parseInsightsWithRegex(insights: string[]): ParsedInsight[] {
  return insights.map(insight => {
    // Extract percentage
    const percentMatch = insight.match(/(\d+(?:\.\d+)?%)/);
    // Extract dollar amount
    const dollarMatch = insight.match(/\$[\d,]+(?:\.\d+)?[KMB]?/i);
    // Extract number with unit
    const numberMatch = insight.match(/(\d+(?:\.\d+)?)\s*(million|billion|k|m|b)/i);

    // Determine stat
    let stat = 'INFO';
    if (percentMatch) {
      stat = percentMatch[1];
    } else if (dollarMatch) {
      stat = dollarMatch[0];
    } else if (numberMatch) {
      const num = parseFloat(numberMatch[1]);
      const unit = numberMatch[2].toLowerCase();
      if (unit === 'million' || unit === 'm') stat = `${num}M`;
      else if (unit === 'billion' || unit === 'b') stat = `${num}B`;
      else if (unit === 'k') stat = `${num}K`;
    }

    // Extract source (common platforms/sources)
    const sourcePatterns = [
      /kalshi/i, /polymarket/i, /metaculus/i, /predictit/i,
      /analysts/i, /traders/i, /bettors/i, /experts/i,
      /google/i, /openai/i, /anthropic/i, /meta/i
    ];

    let source = 'MARKET';
    for (const pattern of sourcePatterns) {
      const match = insight.match(pattern);
      if (match) {
        source = match[0].toUpperCase();
        break;
      }
    }

    // Create summary - use the full insight text without truncation
    const summary = insight
      .replace(/^\d+(?:\.\d+)?%\s*(?:of\s*)?/i, '') // Remove leading percentage
      .replace(/\$[\d,]+(?:\.\d+)?[KMB]?\s*/i, '')  // Remove dollar amounts
      .trim();

    return { stat, source, summary };
  });
}
