/**
 * Chat Title Generation
 * Generates a concise AI title for a chat session based on the user's first message.
 * Updates the Supabase session row and returns the title.
 */

import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getSession, updateSession } from '@/lib/supabase/chat';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || '',
    'X-Title': process.env.NEXT_PUBLIC_SITE_NAME || 'Supermission',
  },
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, userMessage, assistantMessage } = body ?? {};

    if (!sessionId || typeof userMessage !== 'string' || !userMessage.trim()) {
      return NextResponse.json({ error: 'sessionId and userMessage required' }, { status: 400 });
    }

    const walletAddresses = (request.headers.get('x-verified-wallet') || '')
      .split(',')
      .filter(Boolean);
    const existing = await getSession(sessionId);
    if (!existing || !walletAddresses.includes(existing.user_address?.toLowerCase() ?? '')) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const userSnippet = userMessage.slice(0, 500);
    const assistantSnippet =
      typeof assistantMessage === 'string' ? assistantMessage.slice(0, 500) : '';

    const prompt = `Generate a concise 3-6 word title summarizing this chat. Use plain text only — no quotes, no punctuation at the end, no prefix like "Title:".

User: ${userSnippet}${assistantSnippet ? `\nAssistant: ${assistantSnippet}` : ''}

Title:`;

    const completion = await openai.chat.completions.create({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 30,
      temperature: 0.3,
    });

    let title = completion.choices[0]?.message?.content?.trim() ?? '';
    title = title.replace(/^["'`]+|["'`.!?]+$/g, '').trim().slice(0, 80);

    if (!title) {
      return NextResponse.json({ error: 'Failed to generate title' }, { status: 500 });
    }

    await updateSession(sessionId, { title });
    return NextResponse.json({ title });
  } catch (error) {
    console.error('Title generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
