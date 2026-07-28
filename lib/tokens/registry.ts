/**
 * Token Registry — SINGLE SOURCE OF TRUTH for token metadata.
 *
 * Every balance / price / label surface (wallet dropdown, dashboard portfolio +
 * holdings, MoveFundsModal, markets/perps balance pills, Chainlink pricing,
 * Polymarket trade flow, token icons) derives token facts from this file.
 *
 * Adding or changing a token = edit ONE entry here. Previously the same token
 * (e.g. pUSD) had to be added to 5+ scattered config locations, which was a
 * recurring production bug source.
 *
 * IMPORTANT: contract addresses are the source of truth. Consumers that need a
 * checksummed / lowercased form should transform at the point of use — the
 * helper accessors below already lowercase where a case-insensitive lookup is
 * required (symbol resolution, tracked-token sets, Chainlink refs, icons).
 */

import type { SupportedChain } from '@/lib/wallet-intelligence/types';
// USDG's raw address lives with the Robinhood chain definition; the registry
// assembles its display/classification metadata around that canonical value.
import { ROBINHOOD_USDG_ADDRESS } from '@/lib/chains/robinhood';

// Chain IDs used across the app (native EVM chains + a virtual Hyperliquid id 0
// used only for iconography of the perps USDC balance).
export const CHAIN_IDS = {
  base: 8453,
  polygon: 137,
  ethereum: 1,
  arbitrum: 42161,
  robinhood: 4663,
  hyperliquid: 0,
} as const;

/** Chainlink stablecoin feed a token should be priced off, when applicable. */
export type ChainlinkStableRef = 'USDC' | 'USDT' | 'DAI';

/** Oracle symbol a token's USD price is derived from (Chainlink / CoinDesk). */
export type PriceRef = 'USDC' | 'USDT' | 'DAI' | 'ETH' | 'BTC' | 'MATIC' | string;

export interface TokenMeta {
  /** Stable unique key, e.g. 'pusd-polygon'. */
  key: string;
  /** Display symbol exactly as surfaced in the UI, e.g. 'USDC.e', 'pUSD'. */
  symbol: string;
  /** Human-readable name. */
  name: string;
  /** Contract address (native/wrapped as deployed on `chainId`). */
  address: string;
  /** EVM chain id (0 = virtual Hyperliquid balance). */
  chainId: number;
  decimals: number;
  isStablecoin: boolean;
  /** USD peg for stablecoins (always 1 today). */
  pegUsd?: number;
  /** Oracle symbol this token is priced off of. */
  priceRef?: PriceRef;
  /**
   * When set, this token participates in the Chainlink `knownTokens` stable
   * price map keyed by address → feed symbol. Stables without a Chainlink feed
   * (e.g. USDbC, USDG) intentionally omit this.
   */
  chainlinkStable?: ChainlinkStableRef;
  /** Static icon asset path (public/tokens/...). Powers TokenIcon KNOWN_ICONS. */
  iconPath?: string;
  /** Network label shown next to the balance in wallet surfaces. */
  networkLabel?: string;
  /**
   * Appears in the consolidated wallet cash-balance API (/api/wallet/balances)
   * and the wallet dropdown / panels. These are the stablecoin "cash" rows.
   */
  walletBalance?: boolean;
  /**
   * Included in the QuickNode ERC-20 discovery list (TRACKED_TOKENS) for its
   * chain. Only meaningful for base/polygon/ethereum/arbitrum.
   */
  trackedForDiscovery?: boolean;
}

const USDC_ICON_BASE = '/tokens/usdc-base.png';
const USDC_ICON_ETH = '/tokens/usdc-ethereum.png';
const USDCE_ICON = '/tokens/usdce-polygon.webp';

/**
 * The canonical token list. Grouped by chain for readability.
 * Blue-chip (non-stable) entries carry only the facts the surfaces need
 * (symbol/decimals/tracked/priceRef) — they render dynamic icons.
 */
export const TOKENS: readonly TokenMeta[] = [
  // ── Base (8453) ──────────────────────────────────────────────
  {
    key: 'usdc-base', symbol: 'USDC', name: 'USD Coin',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', chainId: 8453, decimals: 6,
    isStablecoin: true, pegUsd: 1, priceRef: 'USDC', chainlinkStable: 'USDC',
    iconPath: USDC_ICON_BASE, networkLabel: 'Base', walletBalance: true, trackedForDiscovery: true,
  },
  {
    key: 'dai-base', symbol: 'DAI', name: 'Dai Stablecoin',
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', chainId: 8453, decimals: 18,
    isStablecoin: true, pegUsd: 1, priceRef: 'DAI', chainlinkStable: 'DAI', trackedForDiscovery: true,
  },
  {
    key: 'usdbc-base', symbol: 'USDbC', name: 'USD Base Coin',
    address: '0xd9aaEC86B65D86f6A7B5B1b0c42FFA531710b6CA', chainId: 8453, decimals: 6,
    isStablecoin: true, pegUsd: 1, priceRef: 'USDC', trackedForDiscovery: true,
  },
  {
    key: 'weth-base', symbol: 'WETH', name: 'Wrapped Ether',
    address: '0x4200000000000000000000000000000000000006', chainId: 8453, decimals: 18,
    isStablecoin: false, priceRef: 'ETH', trackedForDiscovery: true,
  },
  {
    key: 'cbeth-base', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH',
    address: '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', chainId: 8453, decimals: 18,
    isStablecoin: false, priceRef: 'ETH', trackedForDiscovery: true,
  },
  {
    key: 'wsteth-base', symbol: 'wstETH', name: 'Wrapped liquid staked Ether 2.0',
    address: '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452', chainId: 8453, decimals: 18,
    isStablecoin: false, priceRef: 'ETH', trackedForDiscovery: true,
  },
  {
    key: 'wbtc-base', symbol: 'WBTC', name: 'Wrapped BTC',
    address: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', chainId: 8453, decimals: 8,
    isStablecoin: false, priceRef: 'BTC', trackedForDiscovery: true,
  },
  {
    key: 'brett-base', symbol: 'BRETT', name: 'Brett',
    address: '0x532f27101965dd16442e59d40670faf5ebb142e4', chainId: 8453, decimals: 18,
    isStablecoin: false, priceRef: 'BRETT', trackedForDiscovery: true,
  },
  {
    key: 'aero-base', symbol: 'AERO', name: 'Aerodrome Finance',
    address: '0x940181a94a35a4569e4529a3cdfb74e38fd98631', chainId: 8453, decimals: 18,
    isStablecoin: false, priceRef: 'AERO', trackedForDiscovery: true,
  },

  // ── Polygon (137) ────────────────────────────────────────────
  {
    key: 'usdc-polygon', symbol: 'USDC', name: 'USD Coin',
    address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', chainId: 137, decimals: 6,
    isStablecoin: true, pegUsd: 1, priceRef: 'USDC', chainlinkStable: 'USDC',
    iconPath: USDC_ICON_BASE, networkLabel: 'Polygon', walletBalance: true, trackedForDiscovery: true,
  },
  {
    key: 'usdce-polygon', symbol: 'USDC.e', name: 'USD Coin (PoS)',
    address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', chainId: 137, decimals: 6,
    isStablecoin: true, pegUsd: 1, priceRef: 'USDC', chainlinkStable: 'USDC',
    iconPath: USDCE_ICON, networkLabel: 'Polygon (legacy)', walletBalance: true, trackedForDiscovery: true,
  },
  {
    key: 'pusd-polygon', symbol: 'pUSD', name: 'Polymarket USD',
    address: '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB', chainId: 137, decimals: 6,
    isStablecoin: true, pegUsd: 1, priceRef: 'USDC', chainlinkStable: 'USDC',
    iconPath: '/tokens/polymarket.png', networkLabel: 'Polymarket', walletBalance: true, trackedForDiscovery: true,
  },
  {
    key: 'usdt-polygon', symbol: 'USDT', name: 'Tether USD',
    address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', chainId: 137, decimals: 6,
    isStablecoin: true, pegUsd: 1, priceRef: 'USDT', chainlinkStable: 'USDT', trackedForDiscovery: true,
  },
  {
    key: 'dai-polygon', symbol: 'DAI', name: 'Dai Stablecoin',
    address: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', chainId: 137, decimals: 18,
    isStablecoin: true, pegUsd: 1, priceRef: 'DAI', chainlinkStable: 'DAI', trackedForDiscovery: true,
  },
  {
    key: 'weth-polygon', symbol: 'WETH', name: 'Wrapped Ether',
    address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', chainId: 137, decimals: 18,
    isStablecoin: false, priceRef: 'ETH', trackedForDiscovery: true,
  },
  {
    key: 'wbtc-polygon', symbol: 'WBTC', name: 'Wrapped BTC',
    address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', chainId: 137, decimals: 8,
    isStablecoin: false, priceRef: 'BTC', trackedForDiscovery: true,
  },
  {
    key: 'wmatic-polygon', symbol: 'WMATIC', name: 'Wrapped Matic',
    address: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', chainId: 137, decimals: 18,
    isStablecoin: false, priceRef: 'MATIC', trackedForDiscovery: true,
  },
  {
    key: 'link-polygon', symbol: 'LINK', name: 'ChainLink Token',
    address: '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39', chainId: 137, decimals: 18,
    isStablecoin: false, priceRef: 'LINK', trackedForDiscovery: true,
  },
  {
    key: 'aave-polygon', symbol: 'AAVE', name: 'Aave',
    address: '0xd6df932a45c0f255f85145f286ea0b292b21c90b', chainId: 137, decimals: 18,
    isStablecoin: false, priceRef: 'AAVE', trackedForDiscovery: true,
  },
  {
    key: 'uni-polygon', symbol: 'UNI', name: 'Uniswap',
    address: '0xb33eaad8d922b1083446dc23f610c2567fb5180f', chainId: 137, decimals: 18,
    isStablecoin: false, priceRef: 'UNI', trackedForDiscovery: true,
  },

  // ── Ethereum (1) ─────────────────────────────────────────────
  {
    key: 'usdc-ethereum', symbol: 'USDC', name: 'USD Coin',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', chainId: 1, decimals: 6,
    isStablecoin: true, pegUsd: 1, priceRef: 'USDC', chainlinkStable: 'USDC',
    iconPath: USDC_ICON_ETH, networkLabel: 'Ethereum', walletBalance: true, trackedForDiscovery: true,
  },
  {
    key: 'usdt-ethereum', symbol: 'USDT', name: 'Tether USD',
    address: '0xdac17f958d2ee523a2206206994597c13d831ec7', chainId: 1, decimals: 6,
    isStablecoin: true, pegUsd: 1, priceRef: 'USDT', chainlinkStable: 'USDT', trackedForDiscovery: true,
  },
  {
    key: 'dai-ethereum', symbol: 'DAI', name: 'Dai Stablecoin',
    address: '0x6b175474e89094c44da98b954eedeac495271d0f', chainId: 1, decimals: 18,
    isStablecoin: true, pegUsd: 1, priceRef: 'DAI', chainlinkStable: 'DAI', trackedForDiscovery: true,
  },
  {
    key: 'weth-ethereum', symbol: 'WETH', name: 'Wrapped Ether',
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', chainId: 1, decimals: 18,
    isStablecoin: false, priceRef: 'ETH', trackedForDiscovery: true,
  },
  {
    key: 'wbtc-ethereum', symbol: 'WBTC', name: 'Wrapped BTC',
    address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', chainId: 1, decimals: 8,
    isStablecoin: false, priceRef: 'BTC', trackedForDiscovery: true,
  },
  {
    key: 'link-ethereum', symbol: 'LINK', name: 'ChainLink Token',
    address: '0x514910771af9ca656af840dff83e8264ecf986ca', chainId: 1, decimals: 18,
    isStablecoin: false, priceRef: 'LINK', trackedForDiscovery: true,
  },
  {
    key: 'aave-ethereum', symbol: 'AAVE', name: 'Aave',
    address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', chainId: 1, decimals: 18,
    isStablecoin: false, priceRef: 'AAVE', trackedForDiscovery: true,
  },
  {
    key: 'uni-ethereum', symbol: 'UNI', name: 'Uniswap',
    address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', chainId: 1, decimals: 18,
    isStablecoin: false, priceRef: 'UNI', trackedForDiscovery: true,
  },
  {
    key: 'reth-ethereum', symbol: 'rETH', name: 'Rocket Pool ETH',
    address: '0xae78736cd615f374d3085123a210448e74fc6393', chainId: 1, decimals: 18,
    isStablecoin: false, priceRef: 'ETH', trackedForDiscovery: true,
  },
  {
    key: 'wsteth-ethereum', symbol: 'wstETH', name: 'Wrapped liquid staked Ether 2.0',
    address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', chainId: 1, decimals: 18,
    isStablecoin: false, priceRef: 'ETH', trackedForDiscovery: true,
  },
  {
    key: 'cbeth-ethereum', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH',
    address: '0xbe9895146f7af43049ca1c1ae358b0541ea49704', chainId: 1, decimals: 18,
    isStablecoin: false, priceRef: 'ETH', trackedForDiscovery: true,
  },

  // ── Arbitrum (42161) ─────────────────────────────────────────
  {
    key: 'usdc-arbitrum', symbol: 'USDC', name: 'USD Coin',
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chainId: 42161, decimals: 6,
    isStablecoin: true, pegUsd: 1, priceRef: 'USDC', chainlinkStable: 'USDC',
    iconPath: USDC_ICON_BASE, networkLabel: 'Arbitrum', walletBalance: true, trackedForDiscovery: true,
  },
  {
    key: 'usdt-arbitrum', symbol: 'USDT', name: 'Tether USD',
    address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', chainId: 42161, decimals: 6,
    isStablecoin: true, pegUsd: 1, priceRef: 'USDT', chainlinkStable: 'USDT', trackedForDiscovery: true,
  },
  {
    key: 'dai-arbitrum', symbol: 'DAI', name: 'Dai Stablecoin',
    address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', chainId: 42161, decimals: 18,
    isStablecoin: true, pegUsd: 1, priceRef: 'DAI', chainlinkStable: 'DAI', trackedForDiscovery: true,
  },
  {
    key: 'weth-arbitrum', symbol: 'WETH', name: 'Wrapped Ether',
    address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', chainId: 42161, decimals: 18,
    isStablecoin: false, priceRef: 'ETH', trackedForDiscovery: true,
  },
  {
    key: 'wbtc-arbitrum', symbol: 'WBTC', name: 'Wrapped BTC',
    address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', chainId: 42161, decimals: 8,
    isStablecoin: false, priceRef: 'BTC', trackedForDiscovery: true,
  },
  {
    key: 'link-arbitrum', symbol: 'LINK', name: 'ChainLink Token',
    address: '0xf97f4df75117a78c1a5a0dbb814af92458539fb4', chainId: 42161, decimals: 18,
    isStablecoin: false, priceRef: 'LINK', trackedForDiscovery: true,
  },

  // ── Robinhood Chain (4663) ───────────────────────────────────
  {
    key: 'usdg-robinhood', symbol: 'USDG', name: 'Global Dollar',
    address: ROBINHOOD_USDG_ADDRESS, chainId: 4663, decimals: 6,
    isStablecoin: true, pegUsd: 1, priceRef: 'USDG',
    iconPath: '/tokens/usdg.png', networkLabel: 'Robinhood', walletBalance: true,
  },
];

// ── Chain-key mapping ──────────────────────────────────────────
const CHAIN_ID_TO_SUPPORTED: Record<number, SupportedChain> = {
  8453: 'base',
  137: 'polygon',
  1: 'ethereum',
  42161: 'arbitrum',
};

/** Balance-API chain key (includes robinhood; excludes discovery-only chains). */
export type WalletBalanceChain = 'base' | 'polygon' | 'arbitrum' | 'ethereum' | 'robinhood';
const CHAIN_ID_TO_BALANCE_KEY: Record<number, WalletBalanceChain> = {
  8453: 'base',
  137: 'polygon',
  1: 'ethereum',
  42161: 'arbitrum',
  4663: 'robinhood',
};

// ── Helper accessors ───────────────────────────────────────────

/** Look up a token by address (case-insensitive), optionally scoped to a chain. */
export function byAddress(address: string, chainId?: number): TokenMeta | undefined {
  const lc = address.toLowerCase();
  return TOKENS.find(
    (t) => t.address.toLowerCase() === lc && (chainId === undefined || t.chainId === chainId),
  );
}

/** Look up a token by chain + display symbol. */
export function byChainAndSymbol(chainId: number, symbol: string): TokenMeta | undefined {
  return TOKENS.find((t) => t.chainId === chainId && t.symbol === symbol);
}

/** All stablecoin token entries. */
export function stablecoins(): TokenMeta[] {
  return TOKENS.filter((t) => t.isStablecoin);
}

/** Unique set of stablecoin display symbols (USDC, USDC.e, pUSD, USDbC, USDG, USDT, DAI). */
export const STABLECOIN_SYMBOLS: ReadonlySet<string> = new Set(
  stablecoins().map((t) => t.symbol),
);

/**
 * Lowercased address → display symbol map across every registry token.
 * Powers the dashboard `getTokenSymbol` helpers (returns undefined for unknown
 * addresses so callers can apply their 'TOKEN' fallback).
 */
export function symbolForAddress(address: string): string | undefined {
  return byAddress(address)?.symbol;
}

/**
 * QuickNode ERC-20 discovery set for a chain — lowercased addresses of every
 * `trackedForDiscovery` token on that chain. Mirrors the legacy TRACKED_TOKENS.
 */
export function trackedAddressesFor(chain: SupportedChain): Set<string> {
  return new Set(
    TOKENS.filter(
      (t) => t.trackedForDiscovery && CHAIN_ID_TO_SUPPORTED[t.chainId] === chain,
    ).map((t) => t.address.toLowerCase()),
  );
}

/**
 * Chainlink stable price map: lowercased address → feed symbol, for every token
 * flagged `chainlinkStable`. (BSC entries are added by the consumer — the
 * registry only models the chains it tracks.)
 */
export function chainlinkStableRefs(): Record<string, ChainlinkStableRef> {
  const out: Record<string, ChainlinkStableRef> = {};
  for (const t of TOKENS) {
    if (t.chainlinkStable) out[t.address.toLowerCase()] = t.chainlinkStable;
  }
  return out;
}

/**
 * Static token-icon entries keyed `${lowercaseSymbol}:${chainId}` → asset path,
 * for every registry token that declares an `iconPath`. Powers TokenIcon.
 */
export function stableIconEntries(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of TOKENS) {
    if (t.iconPath) out[`${t.symbol.toLowerCase()}:${t.chainId}`] = t.iconPath;
  }
  return out;
}

/**
 * Wallet cash-balance token lists grouped by balance-API chain key. Each entry
 * carries the exact { address, label, decimals } the /api/wallet/balances route
 * and wallet dropdown expect (label === display symbol).
 */
export const WALLET_BALANCE_TOKENS: Record<
  WalletBalanceChain,
  { address: string; label: string; decimals: number }[]
> = (() => {
  const out = { base: [], polygon: [], arbitrum: [], ethereum: [], robinhood: [] } as Record<
    WalletBalanceChain,
    { address: string; label: string; decimals: number }[]
  >;
  for (const t of TOKENS) {
    if (!t.walletBalance) continue;
    const key = CHAIN_ID_TO_BALANCE_KEY[t.chainId];
    if (!key) continue;
    out[key].push({ address: t.address, label: t.symbol, decimals: t.decimals });
  }
  return out;
})();

// ── Named constants for on-chain / display consumers ───────────
// Single source for the addresses that trade flows and the wallet UI reference
// directly. Keeping the exact checksummed strings the codebase already used.
export const BASE_USDC_ADDRESS = byChainAndSymbol(8453, 'USDC')!.address;
export const POLYGON_USDC_NATIVE_ADDRESS = byChainAndSymbol(137, 'USDC')!.address;
export const POLYGON_USDCE_ADDRESS = byChainAndSymbol(137, 'USDC.e')!.address;
export const POLYGON_PUSD_ADDRESS = byChainAndSymbol(137, 'pUSD')!.address;
export const ARBITRUM_USDC_ADDRESS = byChainAndSymbol(42161, 'USDC')!.address;
export const ETHEREUM_USDC_ADDRESS = byChainAndSymbol(1, 'USDC')!.address;
