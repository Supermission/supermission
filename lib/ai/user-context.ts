/**
 * Server-side user context fetcher for prediction market personalization.
 * Parallel-fetches watchlist, trade history, and saved preferences from Supabase.
 */

import { supabase } from '@/lib/supabase/client';
import { cachedFetchWithHit, invalidateCache } from '@/lib/redis/cache';

// Cast to bypass strict Supabase type checking for tables not yet in generated types
const db = supabase as any;

export interface UserPreferences {
  favorite_categories?: string[];
  risk_appetite?: string;
  typical_budget?: number;
}

export interface UserContext {
  watchlist_condition_ids: string[];
  watchlist_markets: Array<{
    condition_id: string;
    question: string;
    yes_price: number | null;
    categories: string[] | null;
    end_date: string | null;
  }>;
  recent_trades: Array<{
    condition_id: string;
    question?: string;
    side: string;
    outcome: string;
    amount: number;
  }>;
  preferences: UserPreferences;
  has_context: boolean;
}

export async function fetchUserContext(userAddress: string | null): Promise<UserContext> {
  const empty: UserContext = {
    watchlist_condition_ids: [],
    watchlist_markets: [],
    recent_trades: [],
    preferences: {},
    has_context: false,
  };

  if (!userAddress) return empty;

  const normalizedAddress = userAddress.toLowerCase();

  try {
    const [watchlistRes, tradesRes, prefsRes] = await Promise.all([
      // Fetch watchlist condition IDs
      db
        .from('user_watchlists')
        .select('condition_id')
        .eq('user_address', normalizedAddress)
        .limit(50),

      // Fetch recent trades
      db
        .from('trade_history')
        .select('condition_id, side, outcome, amount')
        .eq('user_address', normalizedAddress)
        .order('created_at', { ascending: false })
        .limit(20),

      // Fetch saved preferences
      db
        .from('pm_agent_memory')
        .select('preferences')
        .eq('user_address', normalizedAddress)
        .single(),
    ]);

    const watchlist_condition_ids = (watchlistRes.data || []).map((w: any) => w.condition_id).filter(Boolean);
    const rawTrades = (tradesRes.data || []) as any[];
    const preferences = (prefsRes.data?.preferences as UserPreferences) || {};

    // Enrich trades and watchlist with market_catalog data
    const allConditionIds = [
      ...new Set([
        ...watchlist_condition_ids,
        ...rawTrades.map((t: any) => t.condition_id).filter(Boolean),
      ]),
    ];

    let marketMap: Record<string, any> = {};
    if (allConditionIds.length > 0) {
      const { data: markets } = await db
        .from('market_catalog')
        .select('condition_id, question, outcome_prices, categories, end_date')
        .in('condition_id', allConditionIds);
      if (markets) {
        marketMap = Object.fromEntries((markets as any[]).map((m: any) => [m.condition_id, m]));
      }
    }

    const recent_trades = rawTrades.map((t: any) => ({
      condition_id: t.condition_id,
      question: marketMap[t.condition_id]?.question,
      side: t.side,
      outcome: t.outcome,
      amount: t.amount,
    }));

    const watchlist_markets = watchlist_condition_ids
      .map((cid: string) => {
        const m = marketMap[cid];
        if (!m) return null;
        return {
          condition_id: cid,
          question: m.question,
          yes_price: m.outcome_prices?.[0] ?? null,
          categories: m.categories,
          end_date: m.end_date,
        };
      })
      .filter(Boolean) as UserContext['watchlist_markets'];

    return {
      watchlist_condition_ids,
      watchlist_markets,
      recent_trades,
      preferences,
      has_context: watchlist_condition_ids.length > 0 || recent_trades.length > 0 || Object.keys(preferences).length > 0,
    };
  } catch (err) {
    console.warn('[UserContext] Failed to fetch user context (non-fatal):', err);
    return empty;
  }
}

/**
 * Persist user preferences to pm_agent_memory table (fire-and-forget).
 */
export async function persistUserPreferences(
  userAddress: string,
  updates: Partial<UserPreferences>,
): Promise<void> {
  if (!userAddress || Object.keys(updates).length === 0) return;

  const normalizedAddress = userAddress.toLowerCase();

  try {
    // Fetch existing preferences first to merge
    const { data: existing } = await db
      .from('pm_agent_memory')
      .select('preferences')
      .eq('user_address', normalizedAddress)
      .single();

    const merged = {
      ...(existing?.preferences || {}),
      ...updates,
    };

    await db
      .from('pm_agent_memory')
      .upsert(
        {
          user_address: normalizedAddress,
          preferences: merged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_address' },
      );
    // Preferences changed — flush the chat-context cache so the agent sees them.
    await invalidateUserContext(normalizedAddress);
  } catch (err) {
    console.warn('[UserContext] Failed to persist preferences (non-fatal):', err);
  }
}

// ---------------------------------------------------------------------------
// Cached variant — used by chat agents
// ---------------------------------------------------------------------------

/**
 * 30s TTL. User context (watchlist, trades, prefs) barely changes inside a
 * single chat session, and multi-turn conversations would otherwise re-run
 * the 4 Supabase queries on every message. Staleness is bounded — new trades
 * call invalidateUserContext() to refresh immediately.
 */
const USER_CONTEXT_TTL_SECONDS = 30;

function userContextCacheKey(wallet: string): string {
  return `chat:user-context:${wallet.toLowerCase()}`;
}

/**
 * Cached version of fetchUserContext with cache-hit signal.
 * Returns { context, cacheHit } — hit=true when served from Redis, false when
 * the fetcher ran. Anonymous callers (no wallet) bypass the cache and return hit=false.
 */
export async function fetchUserContextCached(
  userAddress: string | null,
): Promise<{ context: UserContext; cacheHit: boolean }> {
  if (!userAddress) {
    const context = await fetchUserContext(userAddress);
    return { context, cacheHit: false };
  }
  const key = userContextCacheKey(userAddress);
  const { value, hit } = await cachedFetchWithHit(key, USER_CONTEXT_TTL_SECONDS, () =>
    fetchUserContext(userAddress),
  );
  return { context: value, cacheHit: hit };
}

/**
 * Invalidate the cached user context for a wallet. Call after any write
 * (trade, watchlist change, preference update) so the agent sees fresh state
 * on the next turn.
 */
export async function invalidateUserContext(userAddress: string | null | undefined): Promise<void> {
  if (!userAddress) return;
  await invalidateCache(userContextCacheKey(userAddress));
}
