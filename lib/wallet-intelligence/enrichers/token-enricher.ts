/**
 * Token Enricher
 * Fetches token metadata (symbol, name, logo, price) and enriches balance data
 */

import { type Address, formatUnits } from 'viem';
import { getQuickNodeClient } from '../../quicknode/client';
import { STABLECOINS, MIN_TOKEN_BALANCE_USD } from '../../quicknode/config';
import type { SupportedChain, TokenBalance, TokenMetadata } from '../types';

// CoinGecko API client — Demo keys (CG-...) use the public URL + demo header
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';
const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

// Chain ID to CoinGecko platform ID
const CHAIN_TO_PLATFORM: Record<SupportedChain, string> = {
  base: 'base',
  polygon: 'polygon-pos',
  ethereum: 'ethereum',
  arbitrum: 'arbitrum-one',
};

/**
 * Fetch token price from CoinGecko
 */
async function fetchTokenPrice(
  chain: SupportedChain,
  tokenAddress: string
): Promise<number | undefined> {
  if (!COINGECKO_API_KEY) {
    console.warn('[TokenEnricher] CoinGecko API key not configured');
    return undefined;
  }

  try {
    const platform = CHAIN_TO_PLATFORM[chain];
    const url = `${COINGECKO_BASE_URL}/simple/token_price/${platform}`;
    const params = new URLSearchParams({
      contract_addresses: tokenAddress.toLowerCase(),
      vs_currencies: 'usd',
    });

    const response = await fetch(`${url}?${params}`, {
      headers: {
        'x-cg-demo-api-key': COINGECKO_API_KEY,
      },
    });

    if (!response.ok) {
      console.error(`[TokenEnricher] CoinGecko API error: ${response.status}`);
      return undefined;
    }

    const data = await response.json();
    const price = data[tokenAddress.toLowerCase()]?.usd;

    return typeof price === 'number' ? price : undefined;
  } catch (error) {
    console.error('[TokenEnricher] Error fetching token price:', error);
    return undefined;
  }
}

/**
 * Fetch multiple token prices in a single request
 */
async function batchFetchTokenPrices(
  chain: SupportedChain,
  tokenAddresses: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  if (!COINGECKO_API_KEY || tokenAddresses.length === 0) {
    return prices;
  }

  try {
    const platform = CHAIN_TO_PLATFORM[chain];
    const url = `${COINGECKO_BASE_URL}/simple/token_price/${platform}`;

    // CoinGecko allows up to 100 addresses per request
    const batchSize = 100;
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      const params = new URLSearchParams({
        contract_addresses: batch.map((addr) => addr.toLowerCase()).join(','),
        vs_currencies: 'usd',
      });

      const response = await fetch(`${url}?${params}`, {
        headers: {
          'x-cg-demo-api-key': COINGECKO_API_KEY,
        },
      });

      if (response.ok) {
        const data = await response.json();
        Object.entries(data).forEach(([address, priceData]: [string, any]) => {
          if (priceData?.usd) {
            prices.set(address.toLowerCase(), priceData.usd);
          }
        });
      }

      // Rate limit: 500 req/min for Pro plan
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } catch (error) {
    console.error('[TokenEnricher] Error batch fetching token prices:', error);
  }

  return prices;
}

/**
 * Detect if token is likely a scam/spam
 */
function isScamToken(token: { symbol: string; name: string; balance: bigint }): boolean {
  const symbol = token.symbol.toLowerCase();
  const name = token.name.toLowerCase();

  // Common scam patterns
  const scamKeywords = [
    'visit',
    'claim',
    'airdrop',
    'free',
    'reward',
    'bonus',
    'prize',
    'gift',
    'www.',
    '.com',
    'http',
  ];

  // Check for suspicious keywords
  const hasSuspiciousKeywords = scamKeywords.some(
    (keyword) => symbol.includes(keyword) || name.includes(keyword)
  );

  // Check for suspicious characters
  const hasSuspiciousChars = /[^\w\s\-.]/.test(symbol) || /[^\w\s\-.]/.test(name);

  return hasSuspiciousKeywords || hasSuspiciousChars;
}

/**
 * Check if token is a stablecoin
 */
function isStablecoin(chain: SupportedChain, tokenAddress: string): boolean {
  return STABLECOINS[chain]?.has(tokenAddress.toLowerCase()) || false;
}

/**
 * Enrich token balance with metadata and price
 */
export async function enrichTokenBalance(
  chain: SupportedChain,
  tokenAddress: Address,
  balance: bigint,
  decimals: number,
  metadata: { symbol: string; name: string }
): Promise<TokenBalance> {
  const balanceFormatted = formatUnits(balance, decimals);
  const balanceNumber = parseFloat(balanceFormatted);

  // Fetch price
  const price = await fetchTokenPrice(chain, tokenAddress);
  const balanceUSD = price ? balanceNumber * price : 0;

  // Detect scam tokens
  const isSpam = isScamToken({ symbol: metadata.symbol, name: metadata.name, balance });

  return {
    address: tokenAddress,
    symbol: metadata.symbol,
    name: metadata.name,
    decimals,
    balance: balance.toString(),
    balanceFormatted,
    balanceUSD,
    price,
    isSpam,
  };
}

/**
 * Batch enrich multiple token balances
 */
export async function batchEnrichTokenBalances(
  chain: SupportedChain,
  tokens: Array<{
    address: Address;
    balance: bigint;
    decimals: number;
    metadata: { symbol: string; name: string };
  }>
): Promise<TokenBalance[]> {
  // Fetch all prices in batch
  const tokenAddresses = tokens.map((t) => t.address);
  const prices = await batchFetchTokenPrices(chain, tokenAddresses);

  // Enrich each token
  const enrichedTokens = tokens.map((token) => {
    const balanceFormatted = formatUnits(token.balance, token.decimals);
    const balanceNumber = parseFloat(balanceFormatted);
    const price = prices.get(token.address.toLowerCase());
    const balanceUSD = price ? balanceNumber * price : 0;
    const isSpam = isScamToken({
      symbol: token.metadata.symbol,
      name: token.metadata.name,
      balance: token.balance,
    });

    return {
      address: token.address,
      symbol: token.metadata.symbol,
      name: token.metadata.name,
      decimals: token.decimals,
      balance: token.balance.toString(),
      balanceFormatted,
      balanceUSD,
      price,
      isSpam,
    };
  });

  // Filter out dust and scam tokens
  return enrichedTokens
    .filter((token) => !token.isSpam && token.balanceUSD >= MIN_TOKEN_BALANCE_USD)
    .sort((a, b) => b.balanceUSD - a.balanceUSD); // Sort by value descending
}

/**
 * Calculate total token value in USD
 */
export function calculateTotalTokenValue(tokens: TokenBalance[]): number {
  return tokens.reduce((sum, token) => sum + token.balanceUSD, 0);
}

/**
 * Calculate stablecoin ratio (percentage of portfolio in stablecoins)
 */
export function calculateStablecoinRatio(
  chain: SupportedChain,
  tokens: TokenBalance[]
): number {
  const totalValue = calculateTotalTokenValue(tokens);
  if (totalValue === 0) return 0;

  const stablecoinValue = tokens
    .filter((token) => isStablecoin(chain, token.address))
    .reduce((sum, token) => sum + token.balanceUSD, 0);

  return stablecoinValue / totalValue;
}
