import { NextRequest, NextResponse } from 'next/server';
import { CATEGORY_GROUPS } from '@/lib/config/categories';

/**
 * POST /api/signals/chat-filter
 *
 * Takes conversation history from the prediction-market chat and uses
 * AI to extract structured filters based on user intent.
 */

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ filters: {} });
    }

    const { messages } = await request.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ filters: {} });
    }

    // Build conversation string
    const recent = messages.slice(-10);
    const conversation = recent
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => `${m.role.toUpperCase()}: ${(m.content || '').slice(0, 300)}`)
      .join('\n');

    const systemPrompt = `You extract structured filters for a prediction market query.

CATEGORIES:
- Politics: US elections, Trump, government, Congress, world politics
- Crypto: Bitcoin, Ethereum, crypto prices, blockchain
- Sports: NFL, NBA, Soccer, UFC, Olympics
- Finance: Stocks, Fed, interest rates, economy
- Tech: AI, Big Tech, Apple, Google, Microsoft
- World: Middle East, China, Europe, Geopolitics

USER INTENT PATTERNS:
- "low risk", "safe", "conservative", "sure bet" → minConfidence: 85-95
- "high risk", "risky", "speculative", "high reward" → minConfidence: 40-60
- "medium risk", "balanced" → minConfidence: 65-75
- "profitable", "big money", "huge profit", "earn huge" → sortBy: "volume", look for low prices
- "trending", "hot", "popular" → trending: true
- "ending soon", "this week" → sortBy: "ending_soon"
- "bullish", "going up", "buy yes" → sentiment: "bullish"
- "bearish", "going down", "buy no" → sentiment: "bearish"

Return JSON with:
{
  "tags": ["Category name from list above"] or null,
  "minConfidence": number (0-100) or null,
  "sentiment": "bullish" | "bearish" or null,
  "trending": true | null,
  "sortBy": "volume" | "confidence" | "ending_soon" | null
}

Examples:
- "show me safe crypto bets" → {"tags": ["Crypto"], "minConfidence": 90, "sortBy": "confidence"}
- "risky sports plays" → {"tags": ["Sports"], "minConfidence": 50}
- "trending politics markets" → {"tags": ["Politics"], "trending": true, "sortBy": "volume"}
- "high profit potential" → {"minConfidence": 60, "sortBy": "volume"}

Return ONLY valid JSON, no explanation.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Conversation:\n${conversation}\n\nExtract filters:` },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('[chat-filter] OpenRouter error:', response.status);
      return NextResponse.json({ filters: {} });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ filters: {} });
    }

    const parsed = JSON.parse(content);
    console.log('[chat-filter] Extracted filters:', parsed);

    // Validate and sanitize
    const filters: Record<string, any> = {};

    // Validate tags against known categories
    const allCategories = ['Politics', 'Crypto', 'Sports', 'Finance', 'Tech', 'World'];
    if (Array.isArray(parsed.tags) && parsed.tags.length > 0) {
      const validTags = parsed.tags
        .map((t: string) => allCategories.find(c => c.toLowerCase() === t.toLowerCase()))
        .filter(Boolean);
      if (validTags.length > 0) {
        filters.tags = validTags;
      }
    }

    if (typeof parsed.minConfidence === 'number' && parsed.minConfidence > 0 && parsed.minConfidence <= 100) {
      filters.minConfidence = parsed.minConfidence;
    }
    if (parsed.sentiment && ['bullish', 'bearish'].includes(parsed.sentiment)) {
      filters.sentiment = parsed.sentiment;
    }
    if (parsed.trending === true) {
      filters.trending = true;
    }
    if (parsed.sortBy && ['volume', 'confidence', 'ending_soon'].includes(parsed.sortBy)) {
      filters.sortBy = parsed.sortBy;
    }

    return NextResponse.json({ filters });
  } catch (err) {
    console.error('[chat-filter] Error:', err);
    return NextResponse.json({ filters: {} });
  }
}
