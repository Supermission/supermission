/**
 * Shared database utilities for admin panel.
 *
 * Supabase returns at most 1000 rows per query by default.
 * This helper paginates automatically so we never silently
 * truncate result sets.
 */
import { supabaseAdmin } from '@/lib/supabase/client';
import type { MarketInfo } from '@/lib/admin/pnl';

const GAMMA_API = 'https://gamma-api.polymarket.com';

const PAGE_SIZE = 1000;

/**
 * Fetch all rows from a Supabase table, paginating past the 1000-row default.
 * @param table  Table name
 * @param select Column selection string
 * @param apply  Optional callback to add filters/ordering to the query builder
 */
export async function fetchAllRows(
  table: string,
  select: string,
  apply?: (query: any) => any,
): Promise<any[]> {
  const allRows: any[] = [];
  let from = 0;

  while (true) {
    let query = supabaseAdmin.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (apply) query = apply(query);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
}

/**
 * For condition_ids present in trade_history but missing from market_catalog,
 * look them up from Polymarket's Gamma API and merge into the marketMap.
 * This ensures P&L calculations have correct prices for all traded markets.
 */
export async function backfillMissingMarkets(
  tradedConditionIds: string[],
  marketMap: Map<string, MarketInfo>,
): Promise<void> {
  const missing = tradedConditionIds.filter((id) => !marketMap.has(id));
  if (missing.length === 0) return;

  // Fetch in parallel with a concurrency limit and short timeout
  const results = await Promise.allSettled(
    missing.map(async (conditionId) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(
          `${GAMMA_API}/markets?condition_id=${conditionId}`,
          { signal: controller.signal },
        );
        if (!res.ok) return null;
        const data = await res.json();
        const market = Array.isArray(data) ? data[0] : data;
        if (!market) return null;

        const outcomes: string[] = market.outcomes
          ? (typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes)
          : [];
        // Gamma API uses camelCase "outcomePrices", catalog uses snake_case "outcome_prices"
        const rawPrices = market.outcomePrices || market.outcome_prices;
        const outcome_prices: number[] = rawPrices
          ? (typeof rawPrices === 'string' ? JSON.parse(rawPrices) : rawPrices).map(Number)
          : [];

        return {
          condition_id: conditionId,
          outcomes,
          outcome_prices,
          is_closed: market.closed === true || market.is_closed === true,
        } as MarketInfo;
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      marketMap.set(result.value.condition_id, result.value);
    }
  }
}
