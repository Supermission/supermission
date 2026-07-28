import { ASSET_CATEGORIES, FUNDING_INTERVAL_MS } from './constants';

// ─── Liquidation price estimation ───────────────────────────────────────────

/**
 * Estimate the liquidation price for a leveraged perp position.
 *
 * Used as a fallback in the position card when the Hyperliquid API hasn't
 * populated `pos.liqPx` yet (typical right after a fill — there's a few-second
 * lag before the clearinghouse echoes the value). The same formula is used by
 * the order panel to preview liq before entry, so the two stay consistent.
 *
 * Hyperliquid uses ~3% maintenance margin. Liquidation occurs when unrealized
 * loss consumes (initial margin − maintenance margin):
 *   initialMargin = posValue / leverage
 *   maintMargin   = posValue * 0.03
 *   lossToLiq     = initialMargin − maintMargin = posValue * (1/leverage − 0.03)
 *   priceMove     = lossToLiq / posValue = 1/leverage − 0.03
 */
export function estimateLiqPrice(
  entryPx: number,
  leverage: number,
  isLong: boolean,
): number {
  if (entryPx <= 0 || leverage <= 0) return 0;
  const maintenanceRate = 0.03;
  const moveToLiq = entryPx * Math.max(1 / leverage - maintenanceRate, 0.001);
  return isLong ? entryPx - moveToLiq : entryPx + moveToLiq;
}

// ─── Number formatting ──────────────────────────────────────────────────────

/** Remove trailing zeros (and trailing decimal point) from a numeric string */
export function stripTrailingZeros(s: string): string {
  if (!s.includes('.')) return s;
  let out = s.replace(/0+$/, '');
  if (out.endsWith('.')) out = out.slice(0, -1);
  return out;
}

/**
 * Truncate a number to N decimal places WITHOUT rounding.
 * Hyperliquid requires truncation, not rounding — rounding can push
 * values above the 5-significant-figure limit.
 */
export function truncateToDecimals(num: number, decimals: number): string {
  if (decimals <= 0) return Math.trunc(num).toString();
  const factor = 10 ** decimals;
  const truncated = Math.trunc(num * factor) / factor;
  return stripTrailingZeros(truncated.toFixed(decimals));
}

/**
 * Format a price string/number to a fixed number of decimals.
 * Falls back to 2 decimals if not specified.
 */
export function formatPrice(
  price: string | number,
  decimals: number = 2,
): string {
  const n = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format a size value using the asset's szDecimals */
export function formatSize(size: string | number, szDecimals: number): string {
  const n = typeof size === 'string' ? parseFloat(size) : size;
  if (isNaN(n)) return '—';
  return stripTrailingZeros(n.toFixed(szDecimals));
}

/**
 * Truncate a price to Hyperliquid's tick size rules (matching the official SDK):
 * - Max 5 significant figures (integers always allowed)
 * - Max (MAX_DECIMALS - szDecimals) decimal places (perps=6, spot=8)
 * - Uses TRUNCATION not rounding — rounding can push past 5 sig figs
 */
export function roundToTickSize(price: number, szDecimals: number = 0, isSpot: boolean = false): string {
  if (price <= 0) return '0';

  const MAX_DECIMALS = isSpot ? 8 : 6;
  const maxDecimals = Math.max(0, MAX_DECIMALS - szDecimals);

  // Step 1: Truncate to max decimal places (not round)
  let truncated = parseFloat(truncateToDecimals(price, maxDecimals));

  // Step 2: Enforce max 5 significant figures by truncation (integers always allowed)
  const sigFigs = 5;
  if (truncated !== 0 && !Number.isInteger(truncated)) {
    const magnitude = Math.floor(Math.log10(Math.abs(truncated))) + 1;
    const decimalsForSigFigs = Math.max(0, sigFigs - magnitude);
    const effectiveDecimals = Math.min(decimalsForSigFigs, maxDecimals);
    truncated = parseFloat(truncateToDecimals(truncated, effectiveDecimals));
  }

  return stripTrailingZeros(truncated.toString());
}

// ─── PnL helpers ────────────────────────────────────────────────────────────

/** Calculate unrealised PnL for a position */
export function calcUnrealizedPnl(
  entryPx: number,
  markPx: number,
  size: number,
  isLong: boolean,
): number {
  const diff = isLong ? markPx - entryPx : entryPx - markPx;
  return diff * Math.abs(size);
}

/** Rough estimate of liquidation price (ignoring fees / margin mode nuances) */
export function calcLiquidationPrice(
  entryPx: number,
  leverage: number,
  isLong: boolean,
): number {
  if (leverage <= 0) return 0;
  const moveToLiq = entryPx / leverage;
  return isLong ? entryPx - moveToLiq : entryPx + moveToLiq;
}

// ─── Funding helpers ────────────────────────────────────────────────────────

/** Display funding rate as signed percentage (e.g. "+0.0032%") */
export function formatFundingRate(rate: string): string {
  const n = parseFloat(rate);
  if (isNaN(n)) return '—';
  const pct = n * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(4)}%`;
}

/** Countdown to the next 8-hour funding boundary (00:00, 08:00, 16:00 UTC) */
export function timeToNextFunding(): {
  hours: number;
  minutes: number;
  seconds: number;
} {
  const now = Date.now();
  const nextBoundary =
    Math.ceil(now / FUNDING_INTERVAL_MS) * FUNDING_INTERVAL_MS;
  const diff = nextBoundary - now;

  const totalSec = Math.floor(diff / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { hours, minutes, seconds };
}

// ─── Volume / OI display ────────────────────────────────────────────────────

function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function formatVolume(vol: number): string {
  return compactNumber(vol);
}

export function formatOI(oi: number): string {
  return compactNumber(oi);
}

// ─── Category lookup ────────────────────────────────────────────────────────

/** Return the category string for a coin, or 'Other' if not categorised */
export function getCategoryForCoin(coin: string): string {
  // Strip common prefixes (kPEPE → PEPE, kBONK → BONK)
  const clean = coin.replace(/^k/, '');

  // Check exact match first
  for (const [category, coins] of Object.entries(ASSET_CATEGORIES)) {
    if (coins.includes(coin) || coins.includes(clean)) return category;
  }

  // Spot-specific categorization for tokens not in the perps list
  const SPOT_CATEGORIES: Record<string, string[]> = {
    Stocks: ['TSLA', 'NVDA', 'GOOGL', 'AAPL', 'SPY', 'AMZN', 'META', 'QQQ', 'MSFT', 'ORCL', 'COIN', 'MSTR', 'HOOD', 'SQ', 'PYPL', 'ABNB', 'UBER'],
    Meme: ['PURR', 'JEFF', 'LICK', 'MANLET', 'GMEOW', 'TRUMP', 'SCHIZO', 'RAGE', 'PUMP', 'FUCKY', 'SUCKY', 'RUG', 'CATNIP', 'PEPE', 'DOGE', 'SHIB', 'WIF', 'BONK', 'FLOKI', 'POPCAT', 'MOODENG', 'GOAT', 'BRETT', 'MEW', 'PNUT', 'TURBO', 'FARTCOIN', 'CHILLGUY'],
    DeFi: ['HFUN', 'AAVE', 'UNI', 'CRV', 'PENDLE', 'MORPHO', 'ONDO', 'ENA', 'JUP', 'COMP', 'MKR', 'SUSHI'],
    AI: ['GPT', 'VIRTUAL', 'AIXBT', 'GRIFFAIN', 'ZEREBRO', 'IO', 'GRASS', 'FET', 'RENDER', 'TAO', 'AR'],
    Gaming: ['AXS', 'SAND', 'MANA', 'GALA', 'IMX', 'PRIME', 'NXPC'],
    Infra: ['HYPE', 'LINK', 'PYTH', 'TIA', 'KAITO', 'W', 'ZRO', 'LAYER', 'POINTS'],
    'Layer 1': ['BTC', 'ETH', 'SOL', 'AVAX', 'DOT', 'ATOM', 'NEAR', 'SUI', 'APT', 'SEI', 'TON', 'HBAR', 'XRP', 'ADA'],
    'Layer 2': ['ARB', 'OP', 'POL', 'STRK', 'MANTA', 'BLAST', 'ZK', 'LINEA'],
    RWA: ['PAXG', 'USUAL', 'RESOLV', 'USPYX'],
  };

  for (const [category, coins] of Object.entries(SPOT_CATEGORIES)) {
    if (coins.includes(coin) || coins.includes(clean)) return category;
  }

  return 'Other';
}

// ─── Misc ───────────────────────────────────────────────────────────────────

/** Percentage change between two numeric values */
export function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}
