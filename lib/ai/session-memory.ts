/**
 * session-memory.ts — Cross-session memory for chat agents.
 *
 * Three jobs:
 *  1. Summarize sessions into 2-3 bullet points (stored in chat_sessions.summary)
 *  2. Build a compact user profile from last 20 summaries (cached in pm_agent_memory)
 *  3. Inject that profile into new session system prompts
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { minimaxCompletion } from '@/lib/minimax/client';

const db = supabaseAdmin as any;

// ── Summarize a session ──

const MIN_MESSAGES_TO_SUMMARIZE = 4;
const RESUMMARIZE_GROWTH = 6;

/**
 * Generate or update a summary for a session.
 * Re-summarizes when the conversation has grown by RESUMMARIZE_GROWTH messages.
 */
export async function summarizeSessionIfNeeded(sessionId: string): Promise<void> {
  try {
    const { data: session } = await db
      .from('chat_sessions')
      .select('summary, summary_msg_count, agent_id')
      .eq('session_id', sessionId)
      .single();

    const { count: msgCount } = await db
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    if (!msgCount || msgCount < MIN_MESSAGES_TO_SUMMARIZE) return;

    const lastSummarizedAt = session?.summary_msg_count || 0;
    if (session?.summary && msgCount - lastSummarizedAt < RESUMMARIZE_GROWTH) return;

    const { data: messages } = await db
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(60);

    if (!messages || messages.length < MIN_MESSAGES_TO_SUMMARIZE) return;

    let conversationText = '';
    for (const m of messages) {
      const line = `${m.role.toUpperCase()}: ${(m.content || '').slice(0, 300)}\n`;
      if (conversationText.length + line.length > 4000) break;
      conversationText += line;
    }

    const summary = await minimaxCompletion(
      `You summarize chat sessions into 2-3 concise bullet points.
Focus on: what the user asked about, what recommendations were made, any user preferences revealed (risk tolerance, favorite categories, chains, etc).
Output ONLY bullet points, no preamble. Keep each bullet under 50 words.`,
      `Summarize this conversation:\n\n${conversationText}`,
      { temperature: 0.2, max_tokens: 200 }
    ).catch(() => null);

    if (!summary) return;

    await db
      .from('chat_sessions')
      .update({ summary, summary_msg_count: msgCount })
      .eq('session_id', sessionId);

  } catch (err) {
    console.warn('[session-memory] Failed to summarize session:', err);
  }
}

// ── Fetch past session context (with cached user profile) ──

/**
 * Returns a compact context string for the system prompt.
 *
 * - <= 5 summaries: raw bullet points (no LLM, no cache needed)
 * - > 5 summaries: cached user profile from pm_agent_memory.preferences.user_profile
 *   Rebuilds only when new summaries exist since the last build.
 */
export async function fetchPastSessionContext(
  walletAddress: string,
  currentSessionId?: string,
): Promise<string> {
  try {
    const addr = walletAddress.toLowerCase();

    // Count total summaries for this user
    let countQuery = db
      .from('chat_sessions')
      .select('session_id', { count: 'exact', head: true })
      .eq('user_address', addr)
      .not('summary', 'is', null);

    if (currentSessionId) {
      countQuery = countQuery.neq('session_id', currentSessionId);
    }

    const { count: summaryCount } = await countQuery;
    if (!summaryCount || summaryCount === 0) return '';

    // Few summaries — return raw, no caching needed
    if (summaryCount <= 5) {
      return await fetchRawSummaries(addr, currentSessionId, 5);
    }

    // Many summaries — use cached profile
    return await getCachedUserProfile(addr, summaryCount, currentSessionId);
  } catch (err) {
    console.warn('[session-memory] Failed to fetch past context:', err);
    return '';
  }
}

/**
 * Fetch raw session summaries as bullet points.
 */
async function fetchRawSummaries(
  addr: string,
  currentSessionId: string | undefined,
  limit: number,
): Promise<string> {
  let query = db
    .from('chat_sessions')
    .select('summary, agent_id, updated_at')
    .eq('user_address', addr)
    .not('summary', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (currentSessionId) {
    query = query.neq('session_id', currentSessionId);
  }

  const { data: sessions } = await query;
  if (!sessions || sessions.length === 0) return '';

  const lines = sessions.map((s: any) => {
    const date = formatDate(s.updated_at);
    return `- ${date} (${s.agent_id}): ${s.summary}`;
  });

  return `=== PREVIOUS INTERACTIONS WITH THIS USER ===\n${lines.join('\n')}\nUse this to personalize responses naturally.\n`;
}

/**
 * Get or rebuild the cached user profile from pm_agent_memory.
 * Only rebuilds when the summary count has changed since last build.
 */
async function getCachedUserProfile(
  addr: string,
  currentSummaryCount: number,
  currentSessionId?: string,
): Promise<string> {
  // Check cache
  const { data: memory } = await db
    .from('pm_agent_memory')
    .select('preferences')
    .eq('user_address', addr)
    .single();

  const cached = memory?.preferences?.user_profile;
  const cachedCount = memory?.preferences?.user_profile_summary_count || 0;

  // Cache hit — summary count hasn't changed
  if (cached && cachedCount === currentSummaryCount) {
    return `=== USER PROFILE (from past conversations) ===\n${cached}\nUse this to personalize responses naturally.\n`;
  }

  // Cache miss or stale — rebuild from last 20 summaries
  let query = db
    .from('chat_sessions')
    .select('summary, agent_id, updated_at')
    .eq('user_address', addr)
    .not('summary', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (currentSessionId) {
    query = query.neq('session_id', currentSessionId);
  }

  const { data: sessions } = await query;
  if (!sessions || sessions.length === 0) return '';

  const rawSummaries = sessions.map((s: any) => {
    const date = formatDate(s.updated_at);
    return `${date} (${s.agent_id}): ${s.summary}`;
  }).join('\n');

  const profile = await buildUserProfile(rawSummaries);

  if (!profile) {
    // LLM failed — fallback to raw latest 5
    const lines = sessions.slice(0, 5).map((s: any) => {
      const date = formatDate(s.updated_at);
      return `- ${date} (${s.agent_id}): ${s.summary}`;
    });
    return `=== PREVIOUS INTERACTIONS WITH THIS USER ===\n${lines.join('\n')}\nUse this to personalize responses naturally.\n`;
  }

  // Cache the profile
  const existingPrefs = memory?.preferences || {};
  await db
    .from('pm_agent_memory')
    .upsert({
      user_address: addr,
      preferences: {
        ...existingPrefs,
        user_profile: profile,
        user_profile_summary_count: currentSummaryCount,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_address' });

  return `=== USER PROFILE (from past conversations) ===\n${profile}\nUse this to personalize responses naturally.\n`;
}

/**
 * Compress multiple session summaries into a compact user profile (~100 tokens).
 */
async function buildUserProfile(rawSummaries: string): Promise<string | null> {
  try {
    return await minimaxCompletion(
      `You distill a user's chat history into a compact profile (4-6 bullet points).
Extract: topics they care about, risk preferences, chains/tokens they use, agents they prefer, any patterns in behavior.
Output ONLY bullet points. Be specific, not generic. Max 30 words per bullet.`,
      `Build a user profile from these session summaries:\n\n${rawSummaries.slice(0, 3000)}`,
      { temperature: 0.2, max_tokens: 150 }
    );
  } catch {
    return null;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Backfill ──

/**
 * Summarize any unsummarized sessions for a user (backfill).
 * Processes at most 3 sessions to avoid blocking.
 * Debounced: skips if called again within 5 minutes for the same wallet.
 */
const lastBackfillTime = new Map<string, number>();
const BACKFILL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export async function backfillUnsummarizedSessions(walletAddress: string): Promise<void> {
  const addr = walletAddress.toLowerCase();
  const lastRun = lastBackfillTime.get(addr) || 0;
  if (Date.now() - lastRun < BACKFILL_COOLDOWN_MS) return;
  lastBackfillTime.set(addr, Date.now());

  try {
    const { data: sessions } = await db
      .from('chat_sessions')
      .select('session_id')
      .eq('user_address', addr)
      .is('summary', null)
      .order('updated_at', { ascending: false })
      .limit(3);

    if (!sessions || sessions.length === 0) return;

    await Promise.allSettled(
      sessions.map((s: any) => summarizeSessionIfNeeded(s.session_id))
    );
  } catch (err) {
    console.warn('[session-memory] Backfill failed:', err);
  }
}
