/**
 * Shared helpers and constants used across DELPHI tool executors.
 */

import { subgraphQuery, SYMBOL_TO_ADDRESS } from '@/lib/uniswap/price-client';
import { httpRpcUrlByChainId } from '@/lib/rpc/endpoints';
import { ROBINHOOD_USDG_ADDRESS, ROBINHOOD_WETH_ADDRESS } from '@/lib/chains/robinhood';

// ---------------------------------------------------------------------------
// Base URL for internal API calls
// ---------------------------------------------------------------------------

export function getBaseUrl(): string {
  // Prefer explicit app URL (custom domain), then Vercel auto-URL, then localhost
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/** Shared helper for Etherscan V2 API queries across multiple chains. */
export async function etherscanQuery(chainId: number, module: string, action: string, params: Record<string, string> = {}): Promise<any> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) throw new Error('ETHERSCAN_API_KEY not configured');
  const qs = new URLSearchParams({ chainid: String(chainId), module, action, apikey: apiKey, ...params });
  const res = await fetch(`https://api.etherscan.io/v2/api?${qs}`, { signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  if (data.status !== '1') throw new Error(data.result || data.message || 'Etherscan query failed');
  return data.result;
}

/** Create an AbortController with a timeout (ms). Returns { signal, clear }. */
export function fetchTimeout(ms = 25_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// ---------------------------------------------------------------------------
// Supported chains (static)
// ---------------------------------------------------------------------------

export const SUPPORTED_CHAINS: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  137: 'Polygon',
  42161: 'Arbitrum',
  4663: 'Robinhood',
};

// ---------------------------------------------------------------------------
// Token registries & RPC config shared across executors
// ---------------------------------------------------------------------------

/** Address-to-symbol mapping for common tokens (used for price lookups). */
export const ADDRESS_TO_SYMBOL: Record<string, string> = {
  '0x0000000000000000000000000000000000000000': 'ETH',
  '0x4200000000000000000000000000000000000006': 'ETH', // WETH on Base/OP
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'ETH', // WETH on Ethereum
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'ETH', // WETH on Arbitrum
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 'USDC',
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
  '0x0b2c639c533813f4aa9d7837caf62653d097ff85': 'USDC', // USDC Optimism
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'BTC', // WBTC
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
};

/** Known token metadata for balance and transfer tools. */
export const KNOWN_TOKEN_META: Record<string, { symbol: string; decimals: number }> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', decimals: 6 },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
};

/** Chain RPC endpoints. Used for direct on-chain balance reads. */
export const RPC_URLS: Record<number, string> = {
  8453: httpRpcUrlByChainId(8453),
  1: httpRpcUrlByChainId(1),
  137: httpRpcUrlByChainId(137),
  42161: httpRpcUrlByChainId(42161), // Arbitrum — prompt advertises it; was missing → "Unsupported chain: 42161"
  4663: httpRpcUrlByChainId(4663), // Robinhood Chain — native ETH + USDG balances/transfers
};

/** Extended known-token map including USDC.e, DAI variants etc. Used by prepare_transfer. */
export const TRANSFER_KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', decimals: 6 },
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': { symbol: 'USDC.e', decimals: 6 },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': { symbol: 'WETH', decimals: 18 }, // WETH Polygon
  '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': { symbol: 'USDbC', decimals: 6 },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', decimals: 18 }, // DAI Base
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { symbol: 'USDT', decimals: 6 }, // USDT Polygon
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': { symbol: 'USDT', decimals: 6 }, // USDT Arbitrum
  '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': { symbol: 'USDT', decimals: 6 }, // USDT Optimism
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT', decimals: 6 }, // USDT Base
  '0x8f3cf7ad23cd3cadbd9735aff958023d60313e92': { symbol: 'DAI', decimals: 18 }, // DAI Polygon
  '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { symbol: 'DAI', decimals: 18 }, // DAI Arbitrum
};

/** Static fallback token lists for when the API is still loading. */
export const STATIC_TOKENS: Record<number, Array<{ symbol: string; name: string; address: string; decimals: number }>> = {
  8453: [
    { symbol: 'ETH', name: 'Ether (native)', address: '0x0000000000000000000000000000000000000000', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    { symbol: 'USDC', name: 'USD Coin', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    { symbol: 'USDbC', name: 'USD Base Coin', address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
    { symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18 },
    { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8 },
    { symbol: 'AERO', name: 'Aerodrome', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18 },
  ],
  1: [
    { symbol: 'ETH', name: 'Ether (native)', address: '0x0000000000000000000000000000000000000000', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
    { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    { symbol: 'USDT', name: 'Tether USD', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
    { symbol: 'WBTC', name: 'Wrapped BTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
  ],
  137: [
    { symbol: 'MATIC', name: 'Polygon (native)', address: '0x0000000000000000000000000000000000000000', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    { symbol: 'USDC', name: 'USD Coin', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
    { symbol: 'USDT', name: 'Tether USD', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
  ],
  4663: [
    { symbol: 'ETH', name: 'Ether (native)', address: '0x0000000000000000000000000000000000000000', decimals: 18 },
    { symbol: 'USDG', name: 'Global Dollar', address: ROBINHOOD_USDG_ADDRESS, decimals: 6 },
    { symbol: 'WETH', name: 'Wrapped Ether', address: ROBINHOOD_WETH_ADDRESS, decimals: 18 },
  ],
};

/** Aave/Compound pool addresses for prepare_defi_deposit. */
export const DEFI_PROTOCOL_CONFIG: Record<string, { poolAddress: string; label: string }> = {
  'aave-v3': { poolAddress: '0xa238dd80c259a72e81d7e4664a9801593f98d1c5', label: 'Aave V3' },
  'compound-iii': { poolAddress: '0x46e6b214b524310239732d51387075e0e70970bf', label: 'Compound III' },
};

/** Base-chain USDC address (used in DeFi deposit flows). */
export const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ---------------------------------------------------------------------------
// Formatting & decoding helpers
// ---------------------------------------------------------------------------

/** Format large numbers compactly: 1234567 → "1.23M" */
export function formatCompact(n: number): string {
  if (!n || n === 0) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

/** Decode hex-encoded UTF-8 string */
export function decodeHexString(hex: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// ---------------------------------------------------------------------------
// Symbol ↔ address resolution (via Uniswap subgraph + hardcoded map)
// ---------------------------------------------------------------------------

/** Resolve any token symbol to address — checks hardcoded map first, then queries subgraph */
export async function resolveTokenAddress(symbol: string, chainId: number = 8453): Promise<string | null> {
  const upper = symbol.toUpperCase();
  // Check hardcoded map
  const chainMap = SYMBOL_TO_ADDRESS[chainId];
  if (chainMap?.[upper]) return String(chainMap[upper]).toLowerCase();
  // Check if it's already an address
  if (symbol.startsWith('0x') && symbol.length === 42) return symbol.toLowerCase();
  // Query subgraph with multiple case variants
  const variants = [upper, symbol, symbol.toLowerCase()];
  for (const variant of variants) {
    try {
      const data = await subgraphQuery<{
        tokens: Array<{ id: string; symbol: string; volumeUSD: string }>;
      }>(chainId, `{ tokens(where: { symbol: "${variant}" }, first: 5, orderBy: volumeUSD, orderDirection: desc) { id symbol volumeUSD } }`);
      if (data.tokens?.length > 0) return data.tokens[0].id.toLowerCase();
    } catch { /* try next */ }
  }
  return null;
}

/** Reverse lookup: address → symbol for known tokens */
export function resolveSymbolFromAddress(addr: string | null): string | null {
  if (!addr) return null;
  const lower = addr.toLowerCase();
  const baseMap = SYMBOL_TO_ADDRESS[8453];
  if (baseMap) {
    for (const [sym, a] of Object.entries(baseMap)) {
      if (String(a).toLowerCase() === lower) return sym;
    }
  }
  // Common tokens not in the subgraph map
  const KNOWN: Record<string, string> = {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
    '0x4200000000000000000000000000000000000006': 'WETH',
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 'USDC.e',
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 'USDC',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 'DAI',
  };
  return KNOWN[lower] || null;
}
