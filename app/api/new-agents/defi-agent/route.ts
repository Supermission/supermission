/**
 * DeFi Agent — Full DeFi capabilities
 * Swap tokens, cross-chain bridge, scan yields, manage positions.
 * Powered by LI.FI aggregator (35+ chains, best-rate routing).
 */

import { NextRequest, NextResponse } from 'next/server';
import { chatCompletion, chatCompletionJSON, MODELS } from '@/lib/openrouter/client';
import { requireAuth } from '@/lib/auth/require-auth';

const AGENT_ID = 'defi-agent';
const AGENT_NAME = 'DeFi Agent';

const CHAIN_ID = 8453;

interface DefiAgentRequest {
  intent?: string;
  chainId?: number;
  toChainId?: number;
  action?: 'swap_quote' | 'bridge' | 'token_price' | 'token_list' | 'supported_chains' | 'yield_scan' | 'positions' | 'morpho_lend' | 'general';
  // Swap/bridge params
  tokenIn?: string;
  tokenOut?: string;
  amount?: string;
  slippageBps?: number;
  // Yield params
  minTvl?: number;
  minApy?: number;
  stablecoinOnly?: boolean;
  riskTolerance?: 'low' | 'medium' | 'high';
  // Internal
  takerAddress?: string;
}

// Multi-chain token registry — popular tokens per chain
const TOKEN_MAP: Record<number, Record<string, string>> = {
  // Base (8453)
  8453: {
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    weth: '0x4200000000000000000000000000000000000006',
    eth: '0x4200000000000000000000000000000000000006',
    dai: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    cbbtc: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    cbeth: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    aero: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
  },
  // Ethereum (1)
  1: {
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    eth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    wbtc: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    link: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    uni: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  },
  // Polygon (137)
  137: {
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    'usdc.e': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    weth: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    eth: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    wmatic: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    matic: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    dai: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  },
  // Arbitrum (42161)
  42161: {
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    'usdc.e': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    eth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    arb: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    dai: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    wbtc: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  },
  // Optimism (10)
  10: {
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    'usdc.e': '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    weth: '0x4200000000000000000000000000000000000006',
    eth: '0x4200000000000000000000000000000000000006',
    usdt: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    op: '0x4200000000000000000000000000000000000042',
    dai: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  },
  // Avalanche (43114)
  43114: {
    usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    'usdc.e': '0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664',
    wavax: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    avax: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    weth: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
    usdt: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
  },
  // BSC (56)
  56: {
    usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    usdt: '0x55d398326f99059fF775485246999027B3197955',
    wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    bnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    eth: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    weth: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    dai: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
  },
};

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum', 8453: 'Base', 137: 'Polygon', 42161: 'Arbitrum',
  10: 'Optimism', 43114: 'Avalanche', 56: 'BSC', 250: 'Fantom',
  100: 'Gnosis', 324: 'zkSync', 59144: 'Linea', 534352: 'Scroll',
};

const CHAIN_ALIASES: Record<string, number> = {
  ethereum: 1, eth: 1, mainnet: 1,
  base: 8453,
  polygon: 137, matic: 137, poly: 137,
  arbitrum: 42161, arb: 42161,
  optimism: 10, op: 10,
  avalanche: 43114, avax: 43114,
  bsc: 56, binance: 56, bnb: 56,
  fantom: 250, ftm: 250,
  gnosis: 100, xdai: 100,
  zksync: 324,
  linea: 59144,
  scroll: 534352,
};

export async function POST(req: NextRequest) {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const body = (await req.json()) as DefiAgentRequest;
    const takerAddress = body.takerAddress;
    const chainId = body.chainId || 8453;

    // Detect intent from free-text
    const action = body.action || detectAction(body.intent || '');

    let result: any;

    // Proxy Morpho intents to the dedicated morpho-lend agent
    if (action === 'morpho_lend') {
      const morphoRes = await fetch(`${req.nextUrl.origin}/api/new-agents/morpho-lend/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(takerAddress ? { 'x-wallet-address': takerAddress } : {}),
          ...(process.env.INTERNAL_API_SECRET && { 'x-internal-secret': process.env.INTERNAL_API_SECRET }),
        },
        body: JSON.stringify({ intent: body.intent, amount: body.amount }),
      });
      const morphoData = await morphoRes.json();
      return NextResponse.json(morphoData);
    }

    switch (action) {
      case 'swap_quote':
      case 'bridge':
        result = await handleSwapQuote(body, chainId, takerAddress);
        break;
      case 'token_price':
        result = await handleTokenPrice(body, chainId);
        break;
      case 'token_list':
        result = await handleTokenList(body, chainId);
        break;
      case 'supported_chains':
        result = handleSupportedChains();
        break;
      case 'yield_scan':
        result = await handleYieldScan(body);
        break;
      case 'positions':
        result = await handlePositions(takerAddress, chainId);
        break;
      default:
        result = await handleGeneral(body, takerAddress);
    }

    return NextResponse.json({
      success: true,
      agentId: AGENT_ID,
      agentName: AGENT_NAME,
      action,
      ...result,
    });
  } catch (e: any) {
    console.error(`[${AGENT_NAME}] Error:`, e);
    return NextResponse.json(
      { success: false, error: e.message || 'Internal error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    agentId: AGENT_ID,
    agentName: AGENT_NAME,
    status: 'operational',
    capabilities: [
      'swap_quote — Get swap quotes via LI.FI across 35+ chains',
      'bridge — Cross-chain token bridging (e.g. Base → Arbitrum)',
      'token_price — Get current token prices in USD',
      'token_list — List available tokens on a chain',
      'supported_chains — Show supported chains for swapping/bridging',
      'yield_scan — Find best DeFi yields (DeFiLlama)',
      'positions — View DeFi positions for a wallet',
      'general — General DeFi questions and analysis',
    ],
    supportedChains: [1, 8453, 137, 42161, 10, 43114, 56],
  });
}

function detectAction(intent: string): DefiAgentRequest['action'] {
  const lower = intent.toLowerCase();
  // Morpho-specific intents — proxy to morpho-lend agent
  if (/morpho|metamorpho|morpho\s*blue|moonwell\s*vault|gauntlet\s*vault|steakhouse\s*vault|morpho\s*vault/.test(lower)) return 'morpho_lend';
  if (/bridge|cross[- ]?chain|transfer\s+\w+\s+(from|to)\s+\w+/.test(lower)) return 'bridge';
  if (/swap|trade|exchange|convert|buy|sell/.test(lower)) return 'swap_quote';
  if (/price\s+of|how\s+much\s+is|what('s|\s+is)\s+\w+\s+worth|token\s+price/.test(lower)) return 'token_price';
  if (/what\s+tokens|list\s+tokens|available\s+tokens|tokens\s+on/.test(lower)) return 'token_list';
  if (/what\s+chains|supported\s+chains|which\s+chains/.test(lower)) return 'supported_chains';
  if (/yield|apy|earn|lend|deposit|farm/.test(lower)) return 'yield_scan';
  if (/position|portfolio|balance|holding/.test(lower)) return 'positions';
  return 'general';
}

/** Resolve a chain name/alias to chain ID */
function resolveChainId(name: string): number | null {
  const lower = name.toLowerCase().trim();
  if (CHAIN_ALIASES[lower]) return CHAIN_ALIASES[lower];
  // Try numeric
  const num = parseInt(lower, 10);
  if (!isNaN(num) && num > 0) return num;
  return null;
}

/** Resolve a token symbol to address on a specific chain */
function resolveToken(symbol: string, chainId: number): string | null {
  const lower = symbol.toLowerCase().trim();
  // If already an address, return as-is
  if (/^0x[a-fA-F0-9]{40}$/.test(lower)) return lower;
  const chainTokens = TOKEN_MAP[chainId];
  if (!chainTokens) return null;
  return chainTokens[lower] || null;
}

async function handleSwapQuote(body: DefiAgentRequest, chainId: number, taker?: string) {
  // If explicit params are not provided, use LLM to parse intent
  if (!body.tokenIn || !body.tokenOut || !body.amount) {
    const parsed = await parseSwapIntent(body.intent || '', chainId);
    if (!parsed) {
      return {
        message: 'Please specify: token to sell, token to buy, and amount. Example: "Swap 100 USDC to ETH on Base" or "Bridge 50 USDC from Base to Arbitrum"',
        needsInput: true,
      };
    }
    body.tokenIn = parsed.tokenIn;
    body.tokenOut = parsed.tokenOut;
    body.amount = parsed.amount;
    if (parsed.fromChainId) chainId = parsed.fromChainId;
    if (parsed.toChainId) body.toChainId = parsed.toChainId;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const toChainId = body.toChainId || chainId;
  const isCrossChain = toChainId !== chainId;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18_000);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/defi/swap/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId,
          ...(isCrossChain ? { toChainId } : {}),
          tokenIn: body.tokenIn,
          tokenOut: body.tokenOut,
          amount: body.amount,
          type: 'EXACT_INPUT',
          taker: taker || '0x0000000000000000000000000000000000000001',
          slippageBps: body.slippageBps || 50,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const quoteData = await res.json();
    if (!quoteData.ok) {
      return { error: quoteData.error, message: `Quote failed: ${quoteData.error}` };
    }

    // Extract token symbols from the raw quote
    const rawQuote = quoteData.rawQuote || {};
    const action = rawQuote.action || {};
    const fromToken = action.fromToken || {};
    const toToken = action.toToken || {};
    const fromSymbol = fromToken.symbol || '???';
    const toSymbol = toToken.symbol || '???';
    const fromDecimals = fromToken.decimals || 18;
    const toDecimals = toToken.decimals || 18;

    // Format amounts for display
    const amountInFormatted = formatTokenAmount(body.amount, fromDecimals);
    const amountOutFormatted = quoteData.amountOutFormatted || formatTokenAmount(quoteData.amountOut, toDecimals);

    const label = isCrossChain ? 'Cross-chain bridge' : 'Swap';
    const fromChainName = CHAIN_NAMES[chainId] || `Chain ${chainId}`;
    const toChainName = CHAIN_NAMES[toChainId] || `Chain ${toChainId}`;

    return {
      quote: {
        type: isCrossChain ? 'bridge' : 'swap',
        source: quoteData.source,
        tokenIn: body.tokenIn,
        tokenOut: body.tokenOut,
        fromSymbol,
        toSymbol,
        fromDecimals,
        toDecimals,
        fromName: fromToken.name || fromSymbol,
        toName: toToken.name || toSymbol,
        amountIn: body.amount,
        amountInFormatted,
        amountOut: quoteData.amountOut,
        amountOutFormatted,
        priceImpact: quoteData.priceImpact,
        gasEstimateUSD: quoteData.gasEstimateUSD,
        route: quoteData.route,
        chainId,
        toChainId,
        fromChainName,
        toChainName,
        spender: quoteData.spender,
        methodParameters: quoteData.methodParameters,
      },
      message: `**${label}**: ${amountInFormatted} ${fromSymbol} on ${fromChainName} → ${amountOutFormatted} ${toSymbol} on ${toChainName} via ${quoteData.route || quoteData.source} (gas: ~$${quoteData.gasEstimateUSD || '?'})`,
    };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { error: 'timeout', message: 'Quote timed out. Please try again.' };
    }
    return { error: e.message, message: 'Failed to get quote. Please try again.' };
  }
}

/** Format raw token amount using decimals */
function formatTokenAmount(raw: string, decimals: number): string {
  try {
    const n = Number(BigInt(raw)) / 10 ** decimals;
    if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(4);
    return n.toPrecision(4);
  } catch {
    return raw;
  }
}

async function handleTokenPrice(body: DefiAgentRequest, chainId: number) {
  const parsed = await parseTokenPriceIntent(body.intent || '', chainId);
  if (!parsed) {
    return { message: 'Please specify a token. Example: "Price of ETH" or "How much is AERO worth?"' };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  // Get USDC address on the chain for price comparison
  const usdcAddress = TOKEN_MAP[parsed.chainId]?.usdc;
  if (!usdcAddress) {
    return { message: `No USDC on ${CHAIN_NAMES[parsed.chainId] || `chain ${parsed.chainId}`} to price against.` };
  }

  const oneUnit = BigInt(10 ** parsed.decimals).toString();

  try {
    const res = await fetch(`${baseUrl}/api/defi/swap/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: parsed.chainId,
        toChainId: parsed.chainId,
        tokenIn: parsed.tokenAddress,
        tokenOut: usdcAddress,
        amount: oneUnit,
        type: 'EXACT_INPUT',
        taker: '0x0000000000000000000000000000000000000001',
        slippageBps: 100,
      }),
      signal: AbortSignal.timeout(18_000),
    });
    const data = await res.json();
    if (!data.ok) return { message: `Price check failed: ${data.error}` };

    const price = data.amountOutFormatted || data.amountOut;
    return {
      tokenPrice: {
        symbol: parsed.symbol,
        address: parsed.tokenAddress,
        chain: CHAIN_NAMES[parsed.chainId] || `Chain ${parsed.chainId}`,
        chainId: parsed.chainId,
        priceUSD: price,
      },
      message: `**${parsed.symbol}** on ${CHAIN_NAMES[parsed.chainId]}: **$${price}**`,
    };
  } catch (error) {
    console.warn('[defi-agent] handleTokenPrice failed:', error);
    return { message: 'Price check failed. Please try again.' };
  }
}

async function handleTokenList(body: DefiAgentRequest, chainId: number) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/defi/tokens?chainId=${chainId}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    if (!data.ok) return { message: `Failed to fetch tokens: ${data.error}` };

    const tokens = (data.tokens || []).slice(0, 20).map((t: any) => ({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
    }));

    return {
      tokens,
      message: `Top tokens on **${CHAIN_NAMES[chainId] || `Chain ${chainId}`}**: ${tokens.map((t: any) => t.symbol).join(', ')}`,
    };
  } catch (error) {
    console.warn('[defi-agent] handleTokenList failed:', error);
    return { message: 'Failed to fetch token list. Please try again.' };
  }
}

function handleSupportedChains() {
  const chains = Object.entries(CHAIN_NAMES).map(([id, name]) => ({
    chainId: Number(id),
    name,
    hasTokenMap: !!TOKEN_MAP[Number(id)],
  }));

  return {
    chains,
    message: `Supported chains: ${chains.map(c => `**${c.name}** (${c.chainId})`).join(', ')}. LI.FI supports 35+ chains total.`,
  };
}

async function handleYieldScan(body: DefiAgentRequest) {
  try {
    const res = await fetch('https://yields.llama.fi/pools');
    if (!res.ok) throw new Error('DeFiLlama API unavailable');
    const { data: pools } = await res.json();

    const chainFilter = body.chainId === 1 ? 'Ethereum' : body.chainId === 137 ? 'Polygon' : 'Base';
    const minTvl = body.minTvl || 100000;
    const minApy = body.minApy || 1;

    let filtered = pools.filter((p: any) =>
      p.chain === chainFilter &&
      p.tvlUsd >= minTvl &&
      (p.apy || 0) >= minApy
    );

    if (body.stablecoinOnly) {
      filtered = filtered.filter((p: any) => p.stablecoin === true);
    }

    filtered.sort((a: any, b: any) => (b.apy || 0) - (a.apy || 0));
    const top = filtered.slice(0, 10);

    return {
      opportunities: top.map((p: any) => ({
        protocol: p.project,
        pool: p.symbol,
        apy: p.apy?.toFixed(2) + '%',
        tvl: '$' + (p.tvlUsd / 1e6).toFixed(1) + 'M',
        chain: p.chain,
        stablecoin: p.stablecoin,
      })),
      count: top.length,
      totalScanned: filtered.length,
      message: `Found ${top.length} yield opportunities on ${chainFilter} (${minApy}%+ APY, $${(minTvl / 1000).toFixed(0)}K+ TVL)`,
    };
  } catch (e: any) {
    return { error: e.message, message: 'Yield scan failed. DeFiLlama may be temporarily unavailable.' };
  }
}

async function handlePositions(wallet?: string, chainId?: number) {
  if (!wallet) {
    return { message: 'Connect your wallet to view positions.', needsInput: true };
  }
  return {
    message: `Position tracking for ${wallet.slice(0, 6)}...${wallet.slice(-4)} on chain ${chainId}. Use the Positions tab in the DeFi section for detailed views.`,
    wallet,
    chainId,
  };
}

async function handleGeneral(body: DefiAgentRequest, wallet?: string) {
  try {
    const systemPrompt = `You are a DeFi expert assistant powered by LI.FI aggregation. You help users with:
- Swap strategies (same-chain and cross-chain) across 35+ chains
- Cross-chain bridging (e.g. "bridge USDC from Base to Arbitrum")
- Token prices ("price of ETH", "how much is AERO worth?")
- Yield optimization and liquidity provision
- DeFi protocol analysis

Supported chains: Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BSC, and more.
Be concise and data-driven. Tell users they can ask you to swap, bridge, or check prices directly in chat.`;
    const message = await chatCompletion(
      MODELS.GEMINI_FLASH_15,
      systemPrompt,
      body.intent || 'Help me with DeFi'
    );

    return {
      message: message || 'I can help with swaps, bridges, token prices, and yields. What would you like to do?',
      suggestions: [
        'Swap 100 USDC to ETH on Base',
        'Bridge 50 USDC from Base to Arbitrum',
        'Price of ETH',
        'Best yields on Base',
      ],
    };
  } catch {
    return {
      message: 'I can help with swaps, bridges, token prices, and yields. What would you like to do?',
      suggestions: [
        'Swap 100 USDC to ETH on Base',
        'Bridge 50 USDC from Base to Arbitrum',
        'Price of ETH',
        'Best yields on Base',
      ],
    };
  }
}

/**
 * Parse swap/bridge intent using LLM + regex fallback.
 * Resolves token symbols to addresses across all supported chains.
 */
async function parseSwapIntent(
  intent: string,
  defaultChainId: number
): Promise<{
  tokenIn: string;
  tokenOut: string;
  amount: string;
  fromChainId?: number;
  toChainId?: number;
} | null> {

  // 1. Try regex patterns first (fast path)
  const regexResult = regexParseSwap(intent, defaultChainId);
  if (regexResult) return regexResult;

  // 2. Fallback to LLM parsing for complex intents
  try {
    const systemPrompt = `Extract swap/bridge parameters from the user's message. Return JSON only:
{
  "fromToken": "symbol (e.g. USDC, ETH, WETH)",
  "toToken": "symbol",
  "amount": "number as string",
  "fromChain": "chain name or null",
  "toChain": "chain name or null",
  "decimals": number (6 for USDC/USDT, 18 for ETH/WETH/most tokens, 8 for WBTC)
}
If you cannot extract all of fromToken, toToken, and amount, return {"error": "missing_params"}.`;
    const parsed = await chatCompletionJSON<{
      fromToken?: string;
      toToken?: string;
      amount?: string;
      fromChain?: string | null;
      toChain?: string | null;
      decimals?: number;
      error?: string;
    }>(MODELS.GEMINI_FLASH_15, systemPrompt, intent);

    if (!parsed || parsed.error) return null;
    if (!parsed.fromToken || !parsed.toToken || !parsed.amount) return null;

    const fromChainId = parsed.fromChain ? (resolveChainId(parsed.fromChain) || defaultChainId) : defaultChainId;
    const toChainId = parsed.toChain ? (resolveChainId(parsed.toChain) || fromChainId) : fromChainId;

    const tokenIn = resolveToken(parsed.fromToken, fromChainId);
    const tokenOut = resolveToken(parsed.toToken, toChainId);
    if (!tokenIn || !tokenOut) return null;

    // Convert human amount to raw units
    const decimals = parsed.decimals || 18;
    const rawAmount = BigInt(Math.round(parseFloat(parsed.amount) * 10 ** decimals)).toString();

    return { tokenIn, tokenOut, amount: rawAmount, fromChainId, toChainId };
  } catch (e) {
    console.error('[parseSwapIntent] LLM fallback failed:', e);
    return null;
  }
}

/** Fast regex-based swap parsing with multi-chain support */
function regexParseSwap(intent: string, defaultChainId: number): {
  tokenIn: string; tokenOut: string; amount: string; fromChainId?: number; toChainId?: number;
} | null {
  // "swap 100 USDC to ETH on Base"
  const swapMatch = intent.match(
    /(?:swap|convert|exchange)\s+([\d.]+)\s+(\w+)\s+(?:to|for|into)\s+(\w+)(?:\s+on\s+(\w+))?/i
  );
  if (swapMatch) {
    const [, amount, from, to, chain] = swapMatch;
    const chainId = chain ? (resolveChainId(chain) || defaultChainId) : defaultChainId;
    return resolveSwapTokens(from, to, amount, chainId, chainId);
  }

  // "bridge 50 USDC from Base to Arbitrum"
  const bridgeMatch = intent.match(
    /(?:bridge|transfer|send|move)\s+([\d.]+)\s+(\w+)\s+(?:from\s+)?(\w+)\s+to\s+(\w+)/i
  );
  if (bridgeMatch) {
    const [, amount, token, fromChain, toChain] = bridgeMatch;
    const fromChainId = resolveChainId(fromChain) || defaultChainId;
    const toChainId = resolveChainId(toChain) || defaultChainId;
    // Bridge same token: resolve on both chains
    const tokenIn = resolveToken(token, fromChainId);
    const tokenOut = resolveToken(token, toChainId);
    if (!tokenIn || !tokenOut) return null;
    const decimals = guessDecimals(token);
    const rawAmount = BigInt(Math.round(parseFloat(amount) * 10 ** decimals)).toString();
    return { tokenIn, tokenOut, amount: rawAmount, fromChainId, toChainId };
  }

  // "buy ETH with 100 USDC"
  const buyMatch = intent.match(/buy\s+(\w+)\s+with\s+([\d.]+)\s+(\w+)(?:\s+on\s+(\w+))?/i);
  if (buyMatch) {
    const [, to, amount, from, chain] = buyMatch;
    const chainId = chain ? (resolveChainId(chain) || defaultChainId) : defaultChainId;
    return resolveSwapTokens(from, to, amount, chainId, chainId);
  }

  // "sell 0.5 ETH for USDC"
  const sellMatch = intent.match(/sell\s+([\d.]+)\s+(\w+)\s+(?:for|to)\s+(\w+)(?:\s+on\s+(\w+))?/i);
  if (sellMatch) {
    const [, amount, from, to, chain] = sellMatch;
    const chainId = chain ? (resolveChainId(chain) || defaultChainId) : defaultChainId;
    return resolveSwapTokens(from, to, amount, chainId, chainId);
  }

  return null;
}

function resolveSwapTokens(
  from: string, to: string, amount: string, fromChainId: number, toChainId: number
): { tokenIn: string; tokenOut: string; amount: string; fromChainId: number; toChainId: number } | null {
  const tokenIn = resolveToken(from, fromChainId);
  const tokenOut = resolveToken(to, toChainId);
  if (!tokenIn || !tokenOut) return null;
  const decimals = guessDecimals(from);
  const rawAmount = BigInt(Math.round(parseFloat(amount) * 10 ** decimals)).toString();
  return { tokenIn, tokenOut, amount: rawAmount, fromChainId, toChainId };
}

function guessDecimals(symbol: string): number {
  const lower = symbol.toLowerCase();
  if (['usdc', 'usdt', 'usdc.e'].includes(lower)) return 6;
  if (['wbtc', 'cbbtc'].includes(lower)) return 8;
  return 18;
}

/** Parse token price intent */
async function parseTokenPriceIntent(
  intent: string,
  defaultChainId: number
): Promise<{ tokenAddress: string; symbol: string; decimals: number; chainId: number } | null> {
  // "price of ETH on Base" / "how much is AERO worth"
  const match = intent.match(
    /(?:price\s+of|how\s+much\s+is|what(?:'s|\s+is))\s+(\w+)(?:\s+worth)?(?:\s+on\s+(\w+))?/i
  );
  if (match) {
    const [, symbol, chain] = match;
    const chainId = chain ? (resolveChainId(chain) || defaultChainId) : defaultChainId;
    const address = resolveToken(symbol, chainId);
    if (!address) return null;
    return { tokenAddress: address, symbol: symbol.toUpperCase(), decimals: guessDecimals(symbol), chainId };
  }
  return null;
}
