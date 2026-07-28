/**
 * Market-discovery executors: keyword/league/time-filtered search and
 * single-market detail lookup against market_catalog.
 */

import { db } from './shared';

// ---------------------------------------------------------------------------
// Live price overlay — fetches current CLOB prices for search results
// ---------------------------------------------------------------------------

const CLOB_HOST = 'https://clob.polymarket.com';

async function fetchLivePrices(markets: any[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  const entries: { conditionId: string; tokenId: string }[] = [];
  for (const m of markets) {
    const tokenIds = typeof m.clob_token_ids === 'string'
      ? JSON.parse(m.clob_token_ids)
      : m.clob_token_ids;
    if (tokenIds?.[0]) {
      entries.push({ conditionId: m.condition_id, tokenId: tokenIds[0] });
    }
  }
  if (entries.length === 0) return priceMap;

  const results = await Promise.allSettled(
    entries.map(async ({ conditionId, tokenId }) => {
      const res = await fetch(
        `${CLOB_HOST}/midpoint?token_id=${tokenId}`,
        { signal: AbortSignal.timeout(3_000), headers: { 'User-Agent': 'Supermission/1.0' } },
      );
      if (!res.ok) return;
      const data = await res.json();
      const mid = parseFloat(data.mid ?? data.price ?? '0');
      if (mid > 0) priceMap.set(conditionId, mid);
    }),
  );
  return priceMap;
}

// ---------------------------------------------------------------------------
// Helpers — league slug mapping and time-phrase extraction
// ---------------------------------------------------------------------------

// Map league keywords → event_slug prefixes so abbreviations find the right markets
// even when the question text doesn't contain the acronym (e.g. "CSK vs MI" for IPL).
const LEAGUE_SLUG_PREFIXES: Record<string, string[]> = {
  nba: ['nba-'],
  nfl: ['nfl-'],
  mlb: ['mlb-'],
  nhl: ['nhl-'],
  f1: ['f1-', 'formula-1'],
  'formula 1': ['f1-', 'formula-1'],
  epl: ['epl-'],
  laliga: ['laliga-'],
  bundesliga: ['bundesliga-'],
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Phrases that should become time-window filters instead of literal keyword matches.
// Order matters — longer phrases first so "this week" wins over "this".
const TIME_PHRASE_DAYS: Array<[RegExp, number]> = [
  [/\bthis\s+week\b/i, 7],
  [/\bnext\s+week\b/i, 14],
  [/\bthis\s+month\b/i, 30],
  [/\btoday\b/i, 1],
  [/\btonight\b/i, 1],
  [/\btomorrow\b/i, 2],
  [/\bupcoming\b/i, 14],
  [/\bsoon\b/i, 7],
];

// Sub-day windows: "(closing/ending/resolving/in the) next N minutes/hours".
// These need millisecond precision — day-granularity isn't enough to answer
// "what's closing in the next 5 minutes".
const TIME_PHRASE_SUBDAY = /\b(?:closing|ending|resolv\w*|settl\w*|expir\w*|within|in)?\s*(?:the\s+)?next\s+(\d+)\s*(min(?:ute)?s?|hours?|hrs?|h)\b/i;

function extractTimePhrase(keyword: string): { days: number | null; windowMs: number | null; stripped: string } {
  let stripped = keyword;
  let days: number | null = null;
  let windowMs: number | null = null;

  const sub = stripped.match(TIME_PHRASE_SUBDAY);
  if (sub) {
    const n = parseInt(sub[1], 10);
    const unit = sub[2].toLowerCase();
    if (Number.isFinite(n) && n > 0) {
      windowMs = unit.startsWith('h') ? n * 60 * 60 * 1000 : n * 60 * 1000;
      stripped = stripped.replace(TIME_PHRASE_SUBDAY, ' ').trim();
    }
  }

  for (const [re, d] of TIME_PHRASE_DAYS) {
    if (re.test(stripped)) {
      stripped = stripped.replace(re, ' ').trim();
      if (days === null || d < days) days = d;
    }
  }
  return { days, windowMs, stripped };
}

// ---------------------------------------------------------------------------
// search_markets
// ---------------------------------------------------------------------------

export async function searchMarkets(args: Record<string, unknown>) {
  let keyword = args.keyword as string | undefined;
  const category = args.category as string | undefined;
  const trending = args.trending as boolean | undefined;
  const minVolume = args.min_volume as number | undefined;
  let endingWithinDays = args.ending_within_days as number | undefined;
  // Optional millisecond-precision window for sub-day queries ("next 5 minutes").
  let endingWithinMs = typeof args.ending_within_minutes === 'number' && args.ending_within_minutes > 0
    ? (args.ending_within_minutes as number) * 60 * 1000
    : undefined;
  const sort = (args.sort as string) || 'volume';
  const limit = Math.min((args.limit as number) || 5, 20);
  const offset = (args.offset as number) || 0;
  const excludeIds = (args.exclude_condition_ids as string[]) || [];

  // Auto-detect time phrases embedded in the keyword ("today ipl markets" → days=1, keyword="ipl";
  // "markets closing in the next 5 minutes" → windowMs=5min).
  if (keyword) {
    const { days, windowMs, stripped } = extractTimePhrase(keyword);
    if (days !== null && endingWithinDays === undefined) endingWithinDays = days;
    if (windowMs !== null && endingWithinMs === undefined) endingWithinMs = windowMs;
    keyword = stripped.replace(/\s+/g, ' ').trim() || undefined;
  }

  const SELECT_COLS =
    'condition_id, question, description, outcome_prices, outcomes, volume, volume_24h, volume_1wk, liquidity, spread, categories, end_date, start_date, match_date, slug, event_slug, is_trending, is_hot, price_change_24h, yes_price_24h_ago, ai_sentiment, ai_confidence, ai_summary, favourite_outcome, clob_token_ids';

  // Resolve the active look-ahead window in milliseconds. A sub-day window
  // (minutes/hours) takes precedence over — and is intersected with — any
  // day-granularity window, since "next 5 minutes" is the more specific intent.
  const dayWindowMs = endingWithinDays && endingWithinDays > 0 ? endingWithinDays * DAY_MS : 0;
  const windowMs = endingWithinMs && endingWithinMs > 0
    ? (dayWindowMs > 0 ? Math.min(endingWithinMs, dayWindowMs) : endingWithinMs)
    : dayWindowMs;

  // Time window bounds — computed once when a window is active and reused by
  // both the SQL pre-filter (applyBaseFilters) and the JS safety check
  // (applyTimeWindow). For day-scale windows we allow a generous 12h grace
  // (markets often close a few hours after the listed match date); for sub-day
  // windows the grace shrinks proportionally so "next 5 minutes" doesn't drag
  // in markets that closed an hour ago.
  const graceMs = windowMs >= DAY_MS
    ? 12 * 60 * 60 * 1000
    : Math.max(60_000, Math.min(Math.floor(windowMs / 2), 30 * 60 * 1000));
  const nowMs = Date.now();
  const cutoffMs = windowMs > 0 ? nowMs + windowMs : 0;
  const toDateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const windowLowerDate = toDateOnly(nowMs - graceMs);
  const windowUpperDate = toDateOnly(cutoffMs + graceMs);

  const applyBaseFilters = (q: any) => {
    if (category) q = q.contains('categories', [category]);
    if (trending) q = q.eq('is_trending', true);
    if (minVolume) q = q.gte('volume', minVolume);
    if (excludeIds.length > 0) {
      q = q.not('condition_id', 'in', `(${excludeIds.join(',')})`);
    }
    if (windowMs > 0) {
      // SQL-side time window — match_date is a STORED generated column pulling
      // YYYY-MM-DD from event_slug/slug (see 20260417 migration). Two cases:
      //   • Per-match markets have match_date populated → bound by that.
      //   • Long-running futures have match_date NULL → bound by end_date.
      // Always require end_date in the future so resolved markets fall out.
      q = q.gte('end_date', new Date(nowMs).toISOString());
      q = q.or(
        `and(match_date.gte.${windowLowerDate},match_date.lte.${windowUpperDate}),` +
          `and(match_date.is.null,end_date.lte.${new Date(cutoffMs).toISOString()})`,
      );
    }
    return q;
  };

  // Defensive JS-side safety check for edge cases where the SQL pre-filter could
  // return extra rows (e.g. composite OR queries fetching candidates by keyword,
  // where the time bound wasn't part of the keyword OR). The SQL filter is the
  // real gatekeeper; this trims any stragglers.
  const applyTimeWindow = <T extends { end_date?: string | null; match_date?: string | null }>(rows: T[]): T[] => {
    if (windowMs <= 0) return rows;
    return rows.filter((r) => {
      const end = r.end_date ? new Date(r.end_date).getTime() : NaN;
      if (!isNaN(end) && end < nowMs) return false;
      if (r.match_date) {
        const md = new Date(`${r.match_date}T00:00:00Z`).getTime();
        if (isNaN(md)) return !isNaN(end) && end <= cutoffMs;
        return md >= nowMs - graceMs && md <= cutoffMs + graceMs;
      }
      if (!isNaN(end)) return end <= cutoffMs;
      return false;
    });
  };

  const applySort = (q: any) => {
    const sortCol = ['volume', 'volume_24h', 'liquidity', 'end_date'].includes(sort)
      ? sort
      : 'volume';
    q = q.order(sortCol, { ascending: sortCol === 'end_date' });
    if (offset > 0) {
      q = q.range(offset, offset + limit - 1);
    } else {
      q = q.limit(limit);
    }
    return q;
  };

  const formatResults = async (data: any[]) => {
    const liveMap = await fetchLivePrices(data).catch(() => new Map<string, number>());
    return {
      count: data.length,
      markets: data.map((m: any) => {
        const op = typeof m.outcome_prices === 'string' ? JSON.parse(m.outcome_prices) : m.outcome_prices;
        const live = liveMap.get(m.condition_id);
        const yesPrice = live ?? op?.[0] ?? null;
        const noPrice = live != null ? Math.round((1 - live) * 100) / 100 : (op?.[1] ?? null);
        return {
          condition_id: m.condition_id,
          question: m.question,
          outcome_prices: live != null ? [yesPrice, noPrice] : op,
          yes_price: yesPrice,
          no_price: noPrice,
          live_price: live != null,
          volume: m.volume,
          volume_24h: m.volume_24h,
          liquidity: m.liquidity,
          categories: m.categories,
          end_date: m.end_date,
          slug: m.slug,
          is_trending: m.is_trending,
          is_hot: m.is_hot,
          price_change_24h: m.price_change_24h,
          yes_price_24h_ago: m.yes_price_24h_ago,
          volume_1wk: m.volume_1wk,
          spread: m.spread,
          ai_sentiment: m.ai_sentiment,
          ai_confidence: m.ai_confidence,
          ai_summary: m.ai_summary,
          favourite_outcome: m.favourite_outcome,
        };
      }),
    };
  };

  // ---- No keyword: simple query ----
  if (!keyword) {
    let query = applyBaseFilters(
      db.from('market_catalog').select(SELECT_COLS).eq('is_active', true).eq('is_closed', false)
    );
    // When a time window is active, fetch a wider set then filter by start_date JS-side.
    if (windowMs > 0) {
      const sortCol = ['volume', 'volume_24h', 'liquidity', 'end_date'].includes(sort) ? sort : 'volume';
      query = query.order(sortCol, { ascending: sortCol === 'end_date' }).limit(400);
    } else {
      query = applySort(query);
    }
    const { data, error } = await query;
    if (error) return { error: error.message, markets: [] };
    const windowed = applyTimeWindow(data || []);
    const paged = windowMs > 0
      ? windowed.slice(offset, offset + limit)
      : windowed;
    return await formatResults(paged);
  }

  // ---- Keyword search: AND-first, OR fallback, searches question + description + event_slug ----
  // Stop words that pollute description matches (appear in almost every market)
  const STOP_WORDS = new Set([
    'will', 'win', 'the', 'be', 'by', 'in', 'on', 'of', 'to', 'a', 'an', 'is', 'it',
    'for', 'at', 'or', 'and', 'vs', 'this', 'that', 'with', 'from', 'has', 'have',
    'not', 'do', 'does', 'match', 'matches', 'game', 'games', 'market', 'markets',
    'price', 'hit', 'reach',
    // Conversational filler — LLMs sometimes pass raw user phrasing as the keyword.
    'show', 'me', 'my', 'please', 'give', 'tell', 'find', 'get', 'list',
    'display', 'want', 'need', 'any', 'some', 'all', 'now',
  ]);

  const allWords = keyword.trim().split(/\s+/).filter(Boolean);
  // Meaningful words for search (filter stop words, keep words 2+ chars)
  const searchWords = allWords.filter((w) => !STOP_WORDS.has(w.toLowerCase()) && w.length >= 2);
  // If all words are stop words, use original words
  const words = searchWords.length > 0 ? searchWords : allWords;

  // Identify which search words are known league codes → add event_slug prefix clauses.
  // Use word-boundary matching so "multiple choice" doesn't trigger the IPL expansion
  // via substring match inside "multiple".
  const leagueSlugPrefixes = new Set<string>();
  const leagueMatchedWords = new Set<string>();
  const keywordLower = keyword.toLowerCase();
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [league, prefixes] of Object.entries(LEAGUE_SLUG_PREFIXES)) {
    const pattern = new RegExp(`\\b${escapeRe(league)}\\b`, 'i');
    if (pattern.test(keywordLower)) {
      prefixes.forEach((p) => leagueSlugPrefixes.add(p));
      league.split(/\s+/).forEach((w) => leagueMatchedWords.add(w));
    }
  }

  // Short keywords (≤4 chars) like "ipl"/"ucl"/"nba" substring-match unrelated words
  // ("multiple" contains "ipl", "nuclear" contains "ucl"). We fetch loosely via ilike
  // then post-filter with a word-boundary regex, EXCEPT when the match came from
  // event_slug (league slugs legitimately contain the acronym as a non-word-boundary substring).
  const shortWords = words.filter((w) => w.length <= 4);

  // Helper: fetch candidate markets and score them
  const fetchAndRank = async () => {
    const sortCol = ['volume', 'volume_24h', 'liquidity', 'end_date'].includes(sort)
      ? sort
      : 'volume';
    const sortAsc = sortCol === 'end_date';

    // Query A — keyword-based OR query across question, description, event_slug.
    // Returns top-200 by volume. May miss lower-volume matches from the target
    // league when high-volume false positives (political/F1 markets whose
    // descriptions substring-match "ipl") fill up the slots.
    const orClauses: string[] = [];
    for (const w of words) {
      orClauses.push(`question.ilike.%${w}%`);
      orClauses.push(`description.ilike.%${w}%`);
      orClauses.push(`event_slug.ilike.%${w}%`);
    }

    const queryA = applyBaseFilters(
      db
        .from('market_catalog')
        .select(SELECT_COLS)
        .eq('is_active', true)
        .eq('is_closed', false)
        .or(orClauses.join(',')),
    )
      .order(sortCol, { ascending: sortAsc })
      .limit(200);

    // Query B — targeted event_slug prefix query for each recognised league.
    // Keeps all markets in that family discoverable regardless of their relative
    // volume against unrelated high-volume markets.
    const bPromises = [...leagueSlugPrefixes].map((prefix) =>
      applyBaseFilters(
        db
          .from('market_catalog')
          .select(SELECT_COLS)
          .eq('is_active', true)
          .eq('is_closed', false)
          .ilike('event_slug', `${prefix}%`),
      )
        .order(sortCol, { ascending: sortAsc })
        .limit(200),
    );

    const [resA, ...resB] = await Promise.all([queryA, ...bPromises]);
    if (resA.error) return { error: resA.error.message, results: [] };
    for (const r of resB) {
      if (r.error) return { error: r.error.message, results: [] };
    }

    // Merge + dedupe by condition_id
    const seen = new Set<string>();
    const data: any[] = [];
    for (const row of [...(resA.data || []), ...resB.flatMap((r) => r.data || [])]) {
      if (!row?.condition_id || seen.has(row.condition_id)) continue;
      seen.add(row.condition_id);
      data.push(row);
    }

    // Score: question matches worth 2, description 1, event_slug prefix match worth 3
    // (high signal — the market is part of the right league).
    const scored = (data || [])
      .map((m: any) => {
        const q = (m.question || '').toLowerCase();
        const d = (m.description || '').toLowerCase();
        const es = (m.event_slug || '').toLowerCase();
        let score = 0;
        let matchedByLeagueSlug = false;

        // League slug-prefix match (strongest signal)
        for (const prefix of leagueSlugPrefixes) {
          if (es.startsWith(prefix.toLowerCase())) {
            score += 3;
            matchedByLeagueSlug = true;
            break;
          }
        }

        // Per-word scoring — short words use word boundaries on question/description
        // to avoid substring false positives (e.g. "ipl" matching "multiple"). Compound
        // event_slug identifiers (e.g. "nba-lal-bos") use substring matching.
        for (const w of words) {
          const wl = w.toLowerCase();
          const isShort = wl.length <= 4;
          const re = isShort ? new RegExp(`\\b${wl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;

          const hitQ = re ? re.test(q) : q.includes(wl);
          const hitD = re ? re.test(d) : d.includes(wl);
          const hitES = es.includes(wl);

          if (hitQ) score += 2;
          else if (hitD) score += 1;
          else if (hitES) score += 2;
        }

        return { ...m, _score: score, _matchedByLeagueSlug: matchedByLeagueSlug };
      })
      .filter((m: any) => {
        if (m._score === 0) return false;
        // Markets matched by league slug prefix (e.g. nba-* for "nba") are always
        // valid — the acronym legitimately lives inside the compound slug.
        if (m._matchedByLeagueSlug) return true;
        // For short keywords, require a word-boundary appearance in question or
        // description — drops substring false positives like "multiple"/"triple" for "ipl".
        if (shortWords.length === 0) return true;
        const text = `${m.question || ''} ${m.description || ''}`;
        return shortWords.every((w) => {
          const wl = w.toLowerCase();
          const re = new RegExp(`\\b${wl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          return re.test(text);
        });
      })
      .sort((a: any, b: any) => b._score - a._score || (b.volume || 0) - (a.volume || 0));

    return { error: null, results: scored };
  };

  const { error: fetchErr, results: rawResults } = await fetchAndRank();
  if (fetchErr) return { error: fetchErr, markets: [] };

  // Apply the start_date/end_date time window to the keyword-scored results.
  const results = applyTimeWindow(rawResults);

  // Check if any result has ALL words matched (AND match), considering league slug matches
  const andResults = results.filter((m: any) => {
    const qdText = `${m.question || ''} ${m.description || ''}`.toLowerCase();
    const esText = (m.event_slug || '').toLowerCase();
    return words.every((w) => {
      const wl = w.toLowerCase();
      // League-code words count as "present" when the market was matched via league slug.
      if (leagueMatchedWords.has(wl) && m._matchedByLeagueSlug) return true;
      // Short keywords: require word-boundary in question/description OR substring in event_slug.
      if (wl.length <= 4) {
        const re = new RegExp(`\\b${wl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return re.test(qdText) || esText.includes(wl);
      }
      return qdText.includes(wl) || esText.includes(wl);
    });
  });

  if (andResults.length > 0) {
    return await formatResults(andResults.slice(offset, offset + limit));
  }

  // OR fallback — best scored results
  const ranked = results.slice(offset, offset + limit);
  const formatted = await formatResults(ranked);
  formatted.markets = formatted.markets.map((m: any) => ({
    ...m,
    _match_quality: 'partial',
  }));
  return formatted;
}

// ---------------------------------------------------------------------------
// get_orderbook
// ---------------------------------------------------------------------------

interface OrderbookLevel {
  price: string;
  size: string;
}

export async function getOrderbook(args: Record<string, unknown>) {
  const conditionId = args.condition_id as string;
  const size = args.size as number | undefined;

  if (!conditionId) {
    return { error: 'Missing required parameter: condition_id' };
  }

  // 1. Look up the market in Supabase to get clob_token_ids
  const { data: market, error: dbError } = await db
    .from('market_catalog')
    .select('condition_id, question, clob_token_ids')
    .eq('condition_id', conditionId)
    .single();

  if (dbError || !market) {
    return { error: `Market not found for condition_id "${conditionId}"` };
  }

  const tokenIds =
    typeof market.clob_token_ids === 'string'
      ? JSON.parse(market.clob_token_ids)
      : market.clob_token_ids;

  if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
    return { error: 'Market has no CLOB token IDs' };
  }

  const yesTokenId = tokenIds[0];

  // 2. Fetch the orderbook from the CLOB
  let bookData: { bids: OrderbookLevel[]; asks: OrderbookLevel[] };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${CLOB_HOST}/book?token_id=${yesTokenId}`, {
      headers: { 'User-Agent': 'Supermission/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { error: `CLOB returned HTTP ${res.status}` };
    }

    bookData = await res.json();
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || /abort/i.test(err?.message || '');
    return {
      error: isTimeout
        ? 'Orderbook request timed out — CLOB may be slow, try again shortly.'
        : `Failed to fetch orderbook: ${err?.message || 'unknown error'}`,
    };
  }

  const bids = (bookData.bids || []).map((l) => ({
    price: parseFloat(l.price),
    size: parseFloat(l.size),
  }));
  const asks = (bookData.asks || []).map((l) => ({
    price: parseFloat(l.price),
    size: parseFloat(l.size),
  }));

  // Sort bids descending, asks ascending
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);

  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const midpoint =
    bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const spreadPct =
    spread !== null && midpoint !== null && midpoint > 0
      ? (spread / midpoint) * 100
      : null;

  // Top-3 depth
  const bidDepth3 = bids.slice(0, 3).reduce((sum, l) => sum + l.size, 0);
  const askDepth3 = asks.slice(0, 3).reduce((sum, l) => sum + l.size, 0);

  // 3. Slippage estimate — walk the ask side to fill `size` USD
  let slippageEstimate: {
    side: string;
    avg_fill_price: number;
    slippage_vs_mid: number;
    slippage_pct: number;
    warning?: string;
  } | null = null;

  if (size && size > 0 && midpoint !== null && asks.length > 0) {
    let remaining = size;
    let totalCost = 0;
    let totalShares = 0;
    for (const level of asks) {
      if (remaining <= 0) break;
      const levelValue = level.price * level.size;
      const fillValue = Math.min(remaining, levelValue);
      const fillShares = fillValue / level.price;
      totalCost += fillValue;
      totalShares += fillShares;
      remaining -= fillValue;
    }
    if (totalShares > 0) {
      const avgFill = totalCost / totalShares;
      const slip = avgFill - midpoint;
      slippageEstimate = {
        side: 'BUY',
        avg_fill_price: Math.round(avgFill * 10000) / 10000,
        slippage_vs_mid: Math.round(slip * 10000) / 10000,
        slippage_pct:
          midpoint > 0
            ? Math.round((slip / midpoint) * 100 * 100) / 100
            : 0,
      };
      if (remaining > 0) {
        slippageEstimate.warning = `Only $${(size - remaining).toFixed(2)} of $${size} can be filled — book too thin.`;
      }
    }
  }

  return {
    condition_id: conditionId,
    question: market.question,
    best_bid: bestBid,
    best_ask: bestAsk,
    spread: spread !== null ? Math.round(spread * 10000) / 10000 : null,
    spread_pct: spreadPct !== null ? Math.round(spreadPct * 100) / 100 : null,
    midpoint:
      midpoint !== null ? Math.round(midpoint * 10000) / 10000 : null,
    bid_depth_3: Math.round(bidDepth3 * 100) / 100,
    ask_depth_3: Math.round(askDepth3 * 100) / 100,
    bid_levels: bids.length,
    ask_levels: asks.length,
    ...(slippageEstimate ? { slippage_estimate: slippageEstimate } : {}),
  };
}

// ---------------------------------------------------------------------------
// get_market_details
// ---------------------------------------------------------------------------

export async function getMarketDetails(args: Record<string, unknown>) {
  const conditionId = args.condition_id as string | undefined;
  const keyword = args.keyword as string | undefined;

  let query = db
    .from('market_catalog')
    .select(
      'condition_id, question, description, outcome_prices, outcomes, volume, volume_24h, volume_1wk, liquidity, spread, categories, tags, end_date, start_date, resolution_source, slug, is_trending, is_hot, price_change_24h, yes_price_24h_ago, ai_sentiment, ai_confidence, ai_summary, favourite_outcome, source_article_urls, clob_token_ids'
    );

  if (conditionId) {
    query = query.eq('condition_id', conditionId);
  } else if (keyword) {
    const words = keyword.trim().split(/\s+/).filter(Boolean);
    for (const word of words) {
      query = query.or(`question.ilike.%${word}%,description.ilike.%${word}%`);
    }
    query = query.eq('is_active', true).order('volume', { ascending: false }).limit(1);
  } else {
    return { error: 'Provide condition_id or keyword' };
  }

  const { data, error } = conditionId ? await query.single() : await query;
  if (error) return { error: error.message };

  const market = conditionId ? data : data?.[0];
  if (!market) return { error: 'Market not found' };

  return {
    condition_id: market.condition_id,
    question: market.question,
    description: market.description,
    outcomes: market.outcomes,
    yes_price: (typeof market.outcome_prices === 'string' ? JSON.parse(market.outcome_prices) : market.outcome_prices)?.[0],
    no_price: (typeof market.outcome_prices === 'string' ? JSON.parse(market.outcome_prices) : market.outcome_prices)?.[1],
    volume: market.volume,
    volume_24h: market.volume_24h,
    liquidity: market.liquidity,
    categories: market.categories,
    tags: market.tags,
    end_date: market.end_date,
    start_date: market.start_date,
    resolution_source: market.resolution_source,
    slug: market.slug,
    is_trending: market.is_trending,
    is_hot: market.is_hot,
    price_change_24h: market.price_change_24h,
    volume_1wk: market.volume_1wk,
    spread: market.spread,
    yes_price_24h_ago: market.yes_price_24h_ago,
    ai_sentiment: market.ai_sentiment,
    ai_confidence: market.ai_confidence,
    ai_summary: market.ai_summary,
    favourite_outcome: market.favourite_outcome,
    source_article_urls: market.source_article_urls,
    clob_token_ids: market.clob_token_ids,
  };
}

// ---------------------------------------------------------------------------
// check_resolution
// ---------------------------------------------------------------------------

export async function checkResolution(args: Record<string, unknown>) {
  const conditionId = args.condition_id as string;
  if (!conditionId) return { error: 'condition_id is required' };

  // Fetch from Polymarket Gamma API for authoritative resolution data
  let gammaMarket: any = null;
  let gammaError: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://gamma-api.polymarket.com/markets?condition_ids=${conditionId}`,
      {
        signal: controller.signal,
        headers: { 'User-Agent': 'Supermission/1.0' },
      },
    );
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        gammaMarket = data[0];
      }
    } else {
      gammaError = `Gamma API returned ${res.status}`;
    }
  } catch (e: any) {
    gammaError = e?.name === 'AbortError'
      ? 'Gamma API timed out'
      : (e?.message || 'Gamma API fetch failed');
  }

  // Fetch local Supabase data as fallback / supplement
  const { data: localMarket, error: dbError } = await db
    .from('market_catalog')
    .select('condition_id, question, outcomes, outcome_prices, end_date, is_closed')
    .eq('condition_id', conditionId)
    .single();

  // If both sources failed, return error
  if (!gammaMarket && (!localMarket || dbError)) {
    return {
      error: `Market not found. ${gammaError || ''} ${dbError?.message || ''}`.trim(),
    };
  }

  // Determine winning outcome from Gamma data: the outcome whose price is 1.0
  let winningOutcome: string | null = null;
  let finalPrices: number[] | null = null;
  let outcomes: string[] | null = null;

  if (gammaMarket) {
    outcomes =
      typeof gammaMarket.outcomes === 'string'
        ? JSON.parse(gammaMarket.outcomes)
        : gammaMarket.outcomes;
    finalPrices =
      typeof gammaMarket.outcomePrices === 'string'
        ? JSON.parse(gammaMarket.outcomePrices)
        : gammaMarket.outcomePrices;

    if (outcomes && finalPrices) {
      const winIdx = finalPrices.findIndex((p: number) => Number(p) === 1);
      if (winIdx !== -1) winningOutcome = outcomes[winIdx];
    }
  }

  // Fall back to local data for fields Gamma didn't provide
  if (!outcomes && localMarket) {
    outcomes =
      typeof localMarket.outcomes === 'string'
        ? JSON.parse(localMarket.outcomes)
        : localMarket.outcomes;
  }
  if (!finalPrices && localMarket) {
    finalPrices =
      typeof localMarket.outcome_prices === 'string'
        ? JSON.parse(localMarket.outcome_prices)
        : localMarket.outcome_prices;
  }

  const resolved = gammaMarket
    ? gammaMarket.closed === true
    : (localMarket?.is_closed ?? false);
  const active = gammaMarket ? gammaMarket.active === true : !resolved;
  const question = gammaMarket?.question || localMarket?.question || null;
  const endDate = gammaMarket?.endDate || localMarket?.end_date || null;
  const resolutionSource = gammaMarket?.resolutionSource || null;

  const result: Record<string, unknown> = {
    question,
    resolved,
    active,
    winning_outcome: winningOutcome,
    resolution_source: resolutionSource,
    end_date: endDate,
    final_prices: finalPrices,
    outcomes,
  };

  if (gammaError && !gammaMarket) {
    result._note =
      `Live resolution data unavailable (${gammaError}). Showing local data — resolution status may be delayed.`;
  }

  return result;
}
