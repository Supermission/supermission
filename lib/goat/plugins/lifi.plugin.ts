/**
 * LI.FI GOAT Plugin
 * Adds cross-chain swap and bridge capabilities to the AI agent.
 * Supports 35+ chains via the LI.FI aggregator API.
 */

import { PluginBase } from '@goat-sdk/core';
import { z } from 'zod';

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum', 8453: 'Base', 137: 'Polygon', 42161: 'Arbitrum',
  10: 'Optimism', 43114: 'Avalanche', 56: 'BSC', 250: 'Fantom',
  100: 'Gnosis', 324: 'zkSync', 59144: 'Linea', 534352: 'Scroll',
};

const USDC_ADDRESSES: Record<number, string> = {
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
};

function chainName(id: number): string {
  return CHAIN_NAMES[id] || `chain ${id}`;
}

export class LiFiPlugin extends PluginBase {
  private baseUrl: string;

  constructor() {
    super('lifi', []);
    this.baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  }

  supportsChain = () => true;

  async getTools() {
    const baseUrl = this.baseUrl;

    return [
      {
        name: 'lifi_getSwapQuote',
        description: `Get a swap or cross-chain swap quote via LI.FI aggregator.
Supports 35+ chains and finds the best route across all major DEXs and bridges.
For same-chain swaps, set toChainId equal to chainId.
For cross-chain, set different chain IDs (e.g. Base→Arbitrum).
Returns: estimated output, gas cost, route, and bridge/DEX used.
Examples:
- "How much ETH would I get for 100 USDC on Base?"
- "Bridge 50 USDC from Base to Arbitrum"
- "Swap 0.1 ETH on Ethereum to USDC on Polygon"`,
        parameters: z.object({
          chainId: z.number().describe('Source chain ID (e.g. 8453 for Base, 1 for Ethereum, 137 for Polygon, 42161 for Arbitrum, 10 for Optimism)'),
          toChainId: z.number().describe('Destination chain ID. Same as chainId for same-chain swaps.'),
          tokenIn: z.string().describe('Source token address (0x...)'),
          tokenOut: z.string().describe('Destination token address (0x...)'),
          amount: z.string().describe('Amount in raw units (wei). For USDC (6 decimals): 1000000 = $1. For ETH (18 decimals): 1000000000000000000 = 1 ETH.'),
          taker: z.string().describe('Wallet address executing the swap'),
          slippageBps: z.number().optional().describe('Slippage tolerance in basis points (default: 50 = 0.5%)'),
        }),
        execute: async (params: {
          chainId: number;
          toChainId: number;
          tokenIn: string;
          tokenOut: string;
          amount: string;
          taker: string;
          slippageBps?: number;
        }) => {
          try {
            const res = await fetch(`${baseUrl}/api/defi/swap/quote`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chainId: params.chainId,
                toChainId: params.toChainId,
                tokenIn: params.tokenIn,
                tokenOut: params.tokenOut,
                amount: params.amount,
                type: 'EXACT_INPUT',
                taker: params.taker,
                slippageBps: params.slippageBps ?? 50,
              }),
              signal: AbortSignal.timeout(18_000),
            });
            const data = await res.json();
            if (!data.ok) return { error: data.error || 'Quote failed' };

            const isCrossChain = params.chainId !== params.toChainId;
            return {
              type: isCrossChain ? 'cross_chain_swap' : 'swap',
              fromChain: chainName(params.chainId),
              toChain: chainName(params.toChainId),
              amountOut: data.amountOut,
              amountOutFormatted: data.amountOutFormatted,
              gasEstimateUSD: data.gasEstimateUSD,
              route: data.route,
              source: data.source,
              spender: data.spender,
            };
          } catch (e: any) {
            if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
              return { error: 'Quote request timed out. Try again or use a smaller amount.' };
            }
            return { error: `Failed to get quote: ${e.message}` };
          }
        },
      },
      {
        name: 'lifi_getTokens',
        description: `Get available tokens for swapping on a specific chain.
Returns: list of popular tokens with address, symbol, name, decimals.
Example: "What tokens can I swap on Base?" or "Show me Arbitrum tokens"`,
        parameters: z.object({
          chainId: z.number().describe('Chain ID to get tokens for'),
        }),
        execute: async (params: { chainId: number }) => {
          try {
            const res = await fetch(`${baseUrl}/api/defi/tokens?chainId=${params.chainId}`, {
              signal: AbortSignal.timeout(10_000),
            });
            const data = await res.json();
            if (!data.ok) return { error: data.error || 'Failed to fetch tokens' };

            const tokens = (data.tokens || []).slice(0, 20).map((t: any) => ({
              symbol: t.symbol,
              name: t.name,
              address: t.address,
              decimals: t.decimals,
            }));

            return { chain: chainName(params.chainId), chainId: params.chainId, tokens, total: data.count };
          } catch (e: any) {
            return { error: `Failed to fetch tokens: ${e.message}` };
          }
        },
      },
      {
        name: 'lifi_getTokenPrice',
        description: `Get the current price of a token in USDC by quoting 1 unit against USDC.
Example: "What's the current price of ETH?" or "How much is 1 WETH worth?"`,
        parameters: z.object({
          chainId: z.number().describe('Chain ID where the token lives'),
          tokenAddress: z.string().describe('Token address to price'),
          tokenDecimals: z.number().describe('Token decimals (e.g., 18 for ETH, 6 for USDC)'),
        }),
        execute: async (params: { chainId: number; tokenAddress: string; tokenDecimals: number }) => {
          const usdcAddress = USDC_ADDRESSES[params.chainId];
          if (!usdcAddress) return { error: `No USDC address known for ${chainName(params.chainId)}` };

          const oneUnit = BigInt(10 ** params.tokenDecimals).toString();

          try {
            const res = await fetch(`${baseUrl}/api/defi/swap/quote`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chainId: params.chainId,
                toChainId: params.chainId,
                tokenIn: params.tokenAddress,
                tokenOut: usdcAddress,
                amount: oneUnit,
                type: 'EXACT_INPUT',
                taker: '0x0000000000000000000000000000000000000001',
                slippageBps: 100,
              }),
              signal: AbortSignal.timeout(18_000),
            });
            const data = await res.json();
            if (!data.ok) return { error: data.error || 'Price check failed' };

            return {
              token: params.tokenAddress,
              chain: chainName(params.chainId),
              priceUSD: data.amountOutFormatted || data.amountOut,
            };
          } catch (e: any) {
            return { error: `Price check failed: ${e.message}` };
          }
        },
      },
      {
        name: 'lifi_getSupportedChains',
        description: `List the most popular chains supported for swapping and bridging.
Use this when the user asks "what chains do you support?" or "where can I swap?"`,
        parameters: z.object({}),
        execute: async () => {
          return {
            chains: Object.entries(CHAIN_NAMES).map(([id, name]) => ({
              chainId: Number(id),
              name,
              hasUSDC: !!USDC_ADDRESSES[Number(id)],
            })),
            note: 'LI.FI supports 35+ chains. These are the most popular ones.',
          };
        },
      },
    ];
  }
}

export function lifiPlugin(): LiFiPlugin {
  return new LiFiPlugin();
}
