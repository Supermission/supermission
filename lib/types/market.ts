// Shared types for Prediction Market Terminal

// ── Common financial data types ──

export interface OHLCVPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketCatalogItem {
  condition_id: string;
  market_id: string;
  event_id: string;
  question: string;
  description: string | null;
  slug: string | null;

  clob_token_ids: string[];
  outcomes: string[];
  outcome_prices: number[];

  volume: number;
  volume_24h: number;
  volume_1wk: number;
  liquidity: number;
  spread: number;

  categories: string[];
  tags: string[];

  is_active: boolean;
  is_closed: boolean;
  end_date: string | null;
  start_date: string | null;
  resolution_source: string | null;

  ai_sentiment: string | null;
  ai_confidence: number | null;
  ai_summary: string | null;
  favourite_outcome: string | null;
  source_article_urls: string[];

  price_change_24h: number;
  is_trending: boolean;
  is_hot: boolean;

  icon: string | null;
  event_slug: string | null;

  created_at: string;
  updated_at: string;
  last_synced_at: string;
}

export interface LivePrices {
  yes: number;
  no: number;
  yesBid?: number;
  noBid?: number;
  /** Epoch ms when this price was last updated on the server. Optional for backwards-compat with older worker builds. */
  updatedAt?: number;
}

export interface TradeRecord {
  id: string;
  user_address: string;
  condition_id: string;
  token_id: string | null;
  side: 'BUY' | 'SELL';
  outcome: string;
  amount: number;
  price: number;
  shares: number | null;
  order_id: string | null;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
}

export interface WatchlistItem {
  id: string;
  user_address: string;
  condition_id: string;
  created_at: string;
}

export interface MarketSignal {
  id: string;
  condition_id: string;
  signal_type: 'sentiment' | 'momentum' | 'spot_price';
  signal_value: Record<string, any>;
  confidence: number;
  source: string;
  expires_at: string;
  created_at: string;
}

// ── Derived market tags (not from API — computed from question/dates) ──

const ASSET_PATTERNS: [RegExp, string][] = [
  [/\bbitcoin\b|\bbtc\b/i, 'BITCOIN'],
  [/\bethereum\b|\beth\b/i, 'ETHEREUM'],
  [/\bsolana\b|\bsol\b/i, 'SOLANA'],
  [/\bxrp\b/i, 'XRP'],
  [/\bdogecoin\b|\bdoge\b/i, 'DOGE'],
  [/\bbnb\b/i, 'BNB'],
  [/\bmicrostrategy\b|\bmstr\b/i, 'MSTR'],
  [/\bcricket\b/i, 'CRICKET'],
];

export function getMarketAssetTag(question: string): string | null {
  for (const [pattern, label] of ASSET_PATTERNS) {
    if (pattern.test(question)) return label;
  }
  return null;
}

// Specific timeframe patterns — unlikely to false-positive (contain "min"/"hour" + number)
const SPECIFIC_TIMEFRAME_PATTERNS: [RegExp, string][] = [
  [/5[- ]?min/i, '5M'],
  [/15[- ]?min/i, '15M'],
  [/30[- ]?min/i, '30M'],
  [/1[- ]?hour|60[- ]?min/i, '1H'],
  [/4[- ]?hour|240[- ]?min/i, '4H'],
];

// Generic timeframe words — ONLY safe when combined with a crypto asset context
// "daily" alone matches "daily active users", "monthly inflation", etc.
const GENERIC_TIMEFRAME_PATTERNS: [RegExp, string][] = [
  [/\bdaily\b/i, 'DAILY'],
  [/\bweekly\b/i, 'WEEKLY'],
  [/\bmonthly\b/i, 'MONTHLY'],
  [/\byearly\b|\bannual\b/i, 'YEARLY'],
];

const PRE_MARKET_ETF_PATTERN = /\bpre[- ]?market\b.*\betf\b|\betf\b.*\bpre[- ]?market\b/i;

export function getMarketTimeframeTag(market: {
  question: string;
  event_slug?: string | null;
  categories?: string[];
  end_date?: string | null;
  start_date?: string | null;
  created_at?: string;
}): string | null {
  const isCrypto = !!getMarketAssetTag(market.question);
  const searchTexts = [
    market.event_slug || '',
    market.question,
    (market.categories || []).join(' '),
  ].join(' ');

  // 1. Pre-market ETF — specific enough, no crypto gate needed
  if (PRE_MARKET_ETF_PATTERN.test(searchTexts)) return 'PRE-MKT ETF';

  // 2. Specific patterns (5-min, 15-min, 1-hour, 4-hour) — safe without crypto gate
  for (const [pattern, label] of SPECIFIC_TIMEFRAME_PATTERNS) {
    if (pattern.test(searchTexts)) return label;
  }

  // 3. Generic patterns (daily, weekly, monthly, yearly) — ONLY for crypto markets
  //    Without this gate, "Will monthly inflation exceed 3%?" gets tagged "MONTHLY"
  if (isCrypto) {
    for (const [pattern, label] of GENERIC_TIMEFRAME_PATTERNS) {
      if (pattern.test(searchTexts)) return label;
    }
  }

  // 4. Heuristic: crypto market + end_date within 4h → classify by remaining time
  if (market.end_date && isCrypto) {
    const minsLeft = (new Date(market.end_date).getTime() - Date.now()) / 60_000;
    if (minsLeft > 0 && minsLeft <= 6) return '5M';
    if (minsLeft > 6 && minsLeft <= 16) return '15M';
    if (minsLeft > 16 && minsLeft <= 65) return '1H';
    if (minsLeft > 65 && minsLeft <= 250) return '4H';
  }

  return null;
}

// Soft tint styles for asset/timeframe tags (matches card tag aesthetic)
export const ASSET_TAG_STYLES: Record<string, string> = {
  BITCOIN:  'text-orange-700/80 bg-[rgb(255,247,237)] dark:text-white dark:bg-[rgb(154,52,18)]',
  ETHEREUM: 'text-indigo-700/80 bg-[rgb(238,242,255)] dark:text-white dark:bg-[rgb(55,48,163)]',
  SOLANA:   'text-violet-700/80 bg-[rgb(245,243,255)] dark:text-white dark:bg-[rgb(109,40,217)]',
  XRP:      'text-slate-700/80 bg-[rgb(241,245,249)] dark:text-white dark:bg-[rgb(51,65,85)]',
  DOGE:     'text-amber-700/80 bg-[rgb(255,251,235)] dark:text-white dark:bg-[rgb(146,64,14)]',
  BNB:      'text-yellow-700/80 bg-[rgb(254,252,232)] dark:text-white dark:bg-[rgb(133,77,14)]',
  MSTR:     'text-sky-700/80 bg-[rgb(240,249,255)] dark:text-white dark:bg-[rgb(3,105,161)]',
  CRICKET:  'text-green-700/80 bg-[rgb(240,253,244)] dark:text-white dark:bg-[rgb(21,128,61)]',
};

export const TIMEFRAME_TAG_STYLE = 'text-[#1a1a1a] bg-[rgb(241,243,244)] font-bold dark:text-white dark:bg-[rgb(39,39,42)]';

export type MarketSortOption = 'volume' | 'trending' | 'newest' | 'ending_soon' | 'price_change';

export interface MarketFilters {
  category?: string;
  sort?: MarketSortOption;
  search?: string;
  limit?: number;
  offset?: number;
  trending_only?: boolean;
}
