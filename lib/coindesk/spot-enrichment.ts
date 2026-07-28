/**
 * Spot Price Enrichment for Prediction Markets
 *
 * Detects crypto-related prediction markets and enriches them with
 * live spot prices from CoinDesk. Enables the AI to identify mispriced
 * markets (e.g., "Will BTC exceed $120k?" when BTC is at $118k).
 */

import { getCoinDeskClient, type LatestPrice } from './client';

/** Crypto assets we can match in prediction market questions */
const CRYPTO_PATTERNS: Array<{ pattern: RegExp; symbol: string; name: string }> = [
  { pattern: /\bBTC\b|bitcoin/i, symbol: 'BTC', name: 'Bitcoin' },
  { pattern: /\bETH\b|ethereum/i, symbol: 'ETH', name: 'Ethereum' },
  { pattern: /\bSOL\b|solana/i, symbol: 'SOL', name: 'Solana' },
  { pattern: /\bDOGE\b|dogecoin/i, symbol: 'DOGE', name: 'Dogecoin' },
  { pattern: /\bXRP\b|ripple/i, symbol: 'XRP', name: 'XRP' },
  { pattern: /\bADA\b|cardano/i, symbol: 'ADA', name: 'Cardano' },
  { pattern: /\bAVAX\b|avalanche/i, symbol: 'AVAX', name: 'Avalanche' },
  { pattern: /\bMATIC\b|\bPOL\b|polygon/i, symbol: 'MATIC', name: 'Polygon' },
  { pattern: /\bLINK\b|chainlink/i, symbol: 'LINK', name: 'Chainlink' },
  { pattern: /\bDOT\b|polkadot/i, symbol: 'DOT', name: 'Polkadot' },
  { pattern: /\bUNI\b|uniswap/i, symbol: 'UNI', name: 'Uniswap' },
  { pattern: /\bAAVE\b/i, symbol: 'AAVE', name: 'Aave' },
  { pattern: /\bBNB\b|binance coin/i, symbol: 'BNB', name: 'BNB' },
  { pattern: /\bSHIB\b|shiba/i, symbol: 'SHIB', name: 'Shiba Inu' },
  { pattern: /\bPEPE\b/i, symbol: 'PEPE', name: 'Pepe' },
  { pattern: /\bARB\b|arbitrum/i, symbol: 'ARB', name: 'Arbitrum' },
  { pattern: /\bOP\b|optimism/i, symbol: 'OP', name: 'Optimism' },
  { pattern: /\bSUI\b/i, symbol: 'SUI', name: 'Sui' },
];

/** Regex to extract price thresholds from market questions */
const PRICE_THRESHOLD_PATTERN = /\$[\d,]+(?:\.\d+)?k?|\d[\d,]*(?:\.\d+)?\s*(?:dollars|usd)/i;

export interface SpotPriceContext {
  /** CoinDesk symbol (e.g. 'BTC') */
  symbol: string;
  /** Human-readable name (e.g. 'Bitcoin') */
  name: string;
  /** Current spot price in USD */
  spotPrice: number;
  /** 24h change in USD */
  change24h: number;
  /** 24h change as percentage */
  changePct24h: number;
  /** Price threshold mentioned in the market question (if detected) */
  priceThreshold: number | null;
  /** Distance from current price to threshold as percentage (if threshold detected) */
  distancePct: number | null;
  /** Whether the current price is above the threshold */
  aboveThreshold: boolean | null;
}

/**
 * Detect crypto symbols mentioned in a prediction market question.
 * Returns an array of symbols (usually 1, but can be multiple for
 * questions like "Will ETH flip BTC?").
 */
export function detectCryptoSymbols(question: string): string[] {
  const matches: string[] = [];
  for (const { pattern, symbol } of CRYPTO_PATTERNS) {
    if (pattern.test(question)) {
      matches.push(symbol);
    }
  }
  return [...new Set(matches)];
}

/**
 * Extract a USD price threshold from a market question.
 * e.g. "Will BTC exceed $120,000?" → 120000
 *      "Will ETH hit $5k?"        → 5000
 */
export function extractPriceThreshold(question: string): number | null {
  const match = question.match(PRICE_THRESHOLD_PATTERN);
  if (!match) return null;

  let raw = match[0]
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\s*(dollars|usd)/i, '')
    .trim();

  // Handle "k" suffix (e.g. "$5k" → 5000)
  if (raw.toLowerCase().endsWith('k')) {
    raw = raw.slice(0, -1);
    return parseFloat(raw) * 1000;
  }

  return parseFloat(raw) || null;
}

/**
 * Enrich a batch of prediction markets with spot price context.
 *
 * Takes an array of market questions, detects which are crypto-related,
 * batch-fetches spot prices (1 API call), and returns a map of
 * market_id → SpotPriceContext[].
 *
 * @param markets - Array of { id, question } objects
 * @returns Map of market ID → spot price contexts
 */
export async function enrichMarketsWithSpotPrices(
  markets: Array<{ id: string; question: string }>
): Promise<Map<string, SpotPriceContext[]>> {
  const result = new Map<string, SpotPriceContext[]>();

  // Step 1: Detect all unique crypto symbols across all markets
  const marketSymbols = new Map<string, { symbols: string[]; question: string }>();
  const allSymbols = new Set<string>();

  for (const market of markets) {
    const symbols = detectCryptoSymbols(market.question);
    if (symbols.length > 0) {
      marketSymbols.set(market.id, { symbols, question: market.question });
      symbols.forEach((s) => allSymbols.add(s));
    }
  }

  if (allSymbols.size === 0) return result;

  // Step 2: Batch-fetch all spot prices (1 API call)
  let prices: Map<string, LatestPrice>;
  try {
    const client = getCoinDeskClient();
    prices = await client.getMultiPrice(Array.from(allSymbols));
  } catch (error) {
    console.warn('[CoinDesk:SpotEnrichment] Failed to fetch spot prices:', error);
    return result;
  }

  // Step 3: Build context for each market
  for (const [marketId, { symbols, question }] of marketSymbols) {
    const contexts: SpotPriceContext[] = [];
    const threshold = extractPriceThreshold(question);

    for (const symbol of symbols) {
      const priceData = prices.get(symbol);
      if (!priceData) continue;

      const entry = CRYPTO_PATTERNS.find((p) => p.symbol === symbol);
      const name = entry?.name || symbol;

      let distancePct: number | null = null;
      let aboveThreshold: boolean | null = null;

      if (threshold !== null && symbols.length === 1) {
        // Only compute distance if there's a single crypto in the question
        // (avoids ambiguity with "Will ETH flip BTC?" type questions)
        distancePct = ((priceData.price - threshold) / threshold) * 100;
        aboveThreshold = priceData.price >= threshold;
      }

      contexts.push({
        symbol,
        name,
        spotPrice: priceData.price,
        change24h: priceData.change24h,
        changePct24h: priceData.changePct24h,
        priceThreshold: threshold,
        distancePct,
        aboveThreshold,
      });
    }

    if (contexts.length > 0) {
      result.set(marketId, contexts);
    }
  }

  return result;
}
