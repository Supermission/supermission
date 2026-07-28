/**
 * DeFi Yield Scanner AI Agent Service (Serverless)
 * Scans DeFi protocols for the best yield opportunities across chains
 * Uses DeFiLlama API for real-time yield data + LLM for insights
 * Implements X402 Payment Required protocol
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { formatGwei } from 'viem';
import { baseClient } from '@/lib/viem/clients';
import { base as baseChain } from 'viem/chains';
import { createSingleAgentJob, completeSingleAgentJob } from '@/lib/agent-economy/collaborate';
import { chatCompletionJSON, MODELS } from '@/lib/openrouter/client';

// ============================================
// AGENT CONFIGURATION
// ============================================
const AGENT_ID = 'defi-yield';
const AGENT_NAME = 'DeFi Yield Scanner';
const ERC8004_AGENT_ID = '0';
const CDP_WALLET = '0xE7138DF3CcB480718Dc2C37fAf7Aee70B08157e7';

// Token configuration (Base Mainnet USDC)
const PAYMENT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const TOKEN_DECIMALS = 6;

// Pricing
const SERVICE_PRICE = '0.1';

/**
 * DeFi Yield Request Interface
 */
interface DefiYieldRequest {
  // Supported chains: 'base' | 'polygon' (default: 'base')
  chain?: string;
  minTvl?: number; // Minimum TVL in USD
  minApy?: number; // Minimum APY %
  stablecoinOnly?: boolean;
  maxResults?: number;
  // Pipeline controls
  riskTolerance?: 'low' | 'medium' | 'high';
  target?: 'stable' | 'balanced' | 'max_yield';
  includeLLM?: boolean; // default true
  includeProtocolDetails?: boolean; // default true
  debug?: boolean;
  payment?: number;

  /**
   * Internal: used for swap preview personalization.
   * We set this server-side from the payer address (payment proof).
   */
  takerAddress?: string;
}

/**
 * Minimal helpers
 */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNumber(x: any): number {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function isAddressLike(x: unknown): x is `0x${string}` {
  return typeof x === 'string' && /^0x[a-fA-F0-9]{40}$/.test(x);
}

function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

function chainMatches(poolChain: string | undefined, requested: string): boolean {
  if (!poolChain) return false;
  const a = poolChain.trim().toLowerCase();
  const r = requested.trim().toLowerCase();
  if (a === r) return true;

  // Common aliases users type
  const aliases: Record<string, string[]> = {
    ethereum: ['eth', 'mainnet'],
    arbitrum: ['arb', 'arbitrum-one'],
    optimism: ['op', 'optimism-mainnet'],
    polygon: ['matic'],
    'binance': ['bsc', 'bnb', 'binance-smart-chain'],
    avalanche: ['avax'],
    base: ['base-mainnet'],
  };

  for (const [canonical, list] of Object.entries(aliases)) {
    const group = [canonical, ...list].map((s) => s.toLowerCase());
    if (group.includes(r)) return a === canonical;
  }

  return false;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

type LlamaPool = {
  pool: string;
  chain?: string;
  project?: string;
  symbol?: string;
  underlyingTokens?: string[];
  rewardTokens?: string[];
  tvlUsd?: number;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  stablecoin?: boolean;
  ilRisk?: boolean;
  exposure?: string;
  apyMean30d?: number;
  volumeUsd1d?: number;
  volumeUsd7d?: number;
};

type ProtocolMeta = {
  name?: string;
  category?: string;
  tvl?: number;
  url?: string;
  audit_links?: string[];
  chains?: string[];
};

type ScoredOpportunity = {
  poolId: string;
  chain: string;
  project: string;
  symbol: string;
  underlyingTokens?: string[];
  rewardTokens?: string[];
  tvlUsd: number;
  apy: number;
  apyBase: number;
  apyReward: number;
  stablecoin: boolean;
  ilRisk: boolean;
  exposure: string;
  apyMean30d: number;
  volatility30d: number;
  rewardShare: number; // 0..1
  riskScore: number; // 0..100 (higher = riskier)
  score: number; // 0..100 (higher = better for selected target/tolerance)
  reasons: string[];
  protocol?: ProtocolMeta | null;
};

/**
 * Fetch yield pools from DeFiLlama (cached) and filter to a reasonable candidate set.
 * We intentionally fetch a larger set than we return, so we can rank by a score
 * that accounts for risk, TVL, reward share, and volatility — not only APY.
 */
async function fetchDeFiLlamaPools(params: DefiYieldRequest): Promise<LlamaPool[]> {
  const data = await fetchJsonWithTimeout('https://yields.llama.fi/pools', 25_000, {
    headers: { Accept: 'application/json' },
    // Next.js fetch caching (server-side) - 5 minutes (yield data doesn't change frequently)
    // @ts-ignore
    next: { revalidate: 300 },
  });

  let pools: any[] = Array.isArray(data?.data) ? data.data : [];

  // Filter to requested chain (default: base). Supports base and polygon.
  const requestedChain = (params.chain || 'base').toLowerCase();
  const supportedChains = ['base', 'polygon'];
  const filterChain = supportedChains.includes(requestedChain) ? requestedChain : 'base';
  pools = pools.filter((p) => chainMatches(p?.chain, filterChain));

  const minTvl = toNumber(params.minTvl) || 100_000;
  const minApy = toNumber(params.minApy) || 1;

  pools = pools
    .filter((p) => toNumber(p?.tvlUsd) >= minTvl)
    .filter((p) => toNumber(p?.apy) >= minApy)
    .filter((p) => toNumber(p?.apy) < 10_000)
    .filter((p) => !!p?.pool && typeof p.pool === 'string')
    .filter((p) => !!p?.project && typeof p.project === 'string');

  if (params.stablecoinOnly) {
    pools = pools.filter((p) => p?.stablecoin === true);
  }

  // Keep a larger candidate set for ranking, but avoid huge payloads.
  // We pre-sort by APY to keep higher-signal candidates, then score/rank later.
  pools.sort((a, b) => toNumber(b?.apy) - toNumber(a?.apy));
  pools = pools.slice(0, 800);

  return pools.map((p) => ({
    pool: String(p.pool),
    chain: p.chain,
    project: p.project,
    symbol: p.symbol,
    underlyingTokens: Array.isArray(p.underlyingTokens) ? p.underlyingTokens.filter((x: any) => typeof x === 'string') : undefined,
    rewardTokens: Array.isArray(p.rewardTokens) ? p.rewardTokens.filter((x: any) => typeof x === 'string') : undefined,
    tvlUsd: toNumber(p.tvlUsd),
    apy: toNumber(p.apy),
    apyBase: toNumber(p.apyBase),
    apyReward: toNumber(p.apyReward),
    stablecoin: !!p.stablecoin,
    ilRisk: !!p.ilRisk,
    exposure: typeof p.exposure === 'string' ? p.exposure : 'unknown',
    apyMean30d: toNumber(p.apyMean30d),
    volumeUsd1d: toNumber(p.volumeUsd1d),
    volumeUsd7d: toNumber(p.volumeUsd7d),
  })) as LlamaPool[];
}

function computeOpportunityScore(pool: LlamaPool, params: DefiYieldRequest): ScoredOpportunity {
  const chain = (pool.chain || 'unknown').toString();
  const project = (pool.project || 'unknown').toString();
  const symbol = (pool.symbol || 'unknown').toString();
  const tvlUsd = toNumber(pool.tvlUsd);
  const apy = toNumber(pool.apy);
  const apyBase = toNumber(pool.apyBase);
  const apyReward = toNumber(pool.apyReward);
  const stablecoin = !!pool.stablecoin;
  const ilRisk = !!pool.ilRisk;
  const exposure = (pool.exposure || 'unknown').toString();
  const apyMean30d = toNumber(pool.apyMean30d);
  const denom = Math.max(1e-9, Math.abs(apyBase) + Math.abs(apyReward));
  const rewardShare = clamp(Math.abs(apyReward) / denom, 0, 1);

  // Volatility proxy: deviation from 30d mean
  const volatility30d =
    apyMean30d > 0 ? clamp(Math.abs(apy - apyMean30d) / apyMean30d, 0, 10) : clamp(Math.abs(apy) / 50, 0, 10);

  // Scale APY on log-ish curve so 10%→20% matters more than 500%→600%.
  const apyCap = 200; // anything above is treated as "very high"
  const apyScore = clamp(Math.log10(1 + clamp(apy, 0, apyCap)) / Math.log10(1 + apyCap), 0, 1) * 100;

  // TVL is a decent heuristic for survivability/liquidity.
  const tvlCap = 1_000_000_000; // $1B
  const tvlScore = clamp(Math.log10(1 + clamp(tvlUsd, 0, tvlCap)) / Math.log10(1 + tvlCap), 0, 1) * 100;

  // Risk score (higher = riskier)
  let riskScore = 35;
  riskScore += rewardShare * 30; // reward-heavy APY tends to be more transient
  riskScore += volatility30d * 8; // volatile yields are riskier
  if (ilRisk) riskScore += 15;
  if (!stablecoin) riskScore += 5;
  if (tvlUsd < 5_000_000) riskScore += 12;
  if (tvlUsd < 1_000_000) riskScore += 10;
  if (apy > 150) riskScore += 10;
  if (apy > 300) riskScore += 10;
  riskScore = clamp(riskScore, 0, 100);

  const riskTolerance = params.riskTolerance || 'medium';
  const target = params.target || (params.stablecoinOnly ? 'stable' : 'balanced');

  // Bonus for well-known platforms (inspired by the QuickNode DeFi platforms list)
  const trusted = new Set([
    'aave',
    'yearn',
    'uniswap',
    'curve',
    'sushiswap',
    'balancer',
    'compound',
    'pancakeswap',
    'harvest',
    'morpho',
  ]);
  const projectLower = project.toLowerCase();
  const isTrusted = Array.from(trusted).some((t) => projectLower.includes(t));

  // Base score prioritizes TVL + reasonable APY, then adjusts by target + tolerance.
  const stableBonus = stablecoin ? 10 : 0;
  const ilPenalty = ilRisk ? 10 : 0;
  const rewardPenalty = rewardShare > 0.8 ? 8 : rewardShare > 0.6 ? 4 : 0;
  const volPenalty = volatility30d > 0.8 ? 8 : volatility30d > 0.4 ? 4 : 0;

  let score = 0;
  if (target === 'stable') {
    score = apyScore * 0.30 + tvlScore * 0.55 + stableBonus * 1.0 - ilPenalty - rewardPenalty - volPenalty;
  } else if (target === 'max_yield') {
    score = apyScore * 0.55 + tvlScore * 0.30 + stableBonus * 0.3 - ilPenalty * 0.6 - rewardPenalty * 0.6 - volPenalty * 0.6;
  } else {
    score = apyScore * 0.40 + tvlScore * 0.45 + stableBonus * 0.6 - ilPenalty - rewardPenalty - volPenalty;
  }

  if (isTrusted) score += 4;

  // Tolerance adjustment: penalize risk more for conservative users.
  const riskPenaltyMultiplier = riskTolerance === 'low' ? 0.35 : riskTolerance === 'high' ? 0.15 : 0.25;
  score -= riskScore * riskPenaltyMultiplier;
  score = clamp(score, 0, 100);

  const reasons: string[] = [];
  if (stablecoin) reasons.push('Stablecoin pool');
  if (tvlUsd >= 50_000_000) reasons.push('High TVL');
  if (apyBase >= apyReward && apyBase > 0) reasons.push('APY mostly base (less mercenary)');
  if (rewardShare > 0.7) reasons.push('Reward-heavy APY (more transient)');
  if (volatility30d > 0.6) reasons.push('Yield volatile vs 30d average');
  if (ilRisk) reasons.push('Impermanent loss risk flagged');
  if (apy > 150) reasons.push('Very high APY (verify sustainability)');

  return {
    poolId: pool.pool,
    chain,
    project,
    symbol,
    underlyingTokens: pool.underlyingTokens,
    rewardTokens: pool.rewardTokens,
    tvlUsd,
    apy,
    apyBase,
    apyReward,
    stablecoin,
    ilRisk,
    exposure,
    apyMean30d,
    volatility30d,
    rewardShare,
    riskScore,
    score,
    reasons,
    protocol: null,
  };
}

async function fetchProtocolMeta(project: string): Promise<ProtocolMeta | null> {
  // DeFiLlama protocol endpoint (best-effort enrichment)
  // Many yield pool projects map to DeFiLlama protocol slugs.
  const url = `https://api.llama.fi/protocol/${encodeURIComponent(project)}`;
  try {
    const data = await fetchJsonWithTimeout(url, 7_000, {
      headers: { Accept: 'application/json' },
      // @ts-ignore
      next: { revalidate: 60 * 60 },
    });

    return {
      name: typeof data?.name === 'string' ? data.name : project,
      category: typeof data?.category === 'string' ? data.category : undefined,
      tvl: toNumber(data?.tvl),
      url: typeof data?.url === 'string' ? data.url : undefined,
      audit_links: Array.isArray(data?.audit_links) ? data.audit_links.filter((x: any) => typeof x === 'string') : undefined,
      chains: Array.isArray(data?.chains) ? data.chains.filter((x: any) => typeof x === 'string') : undefined,
    };
  } catch {
    return null;
  }
}

function diversifyByProject(opps: ScoredOpportunity[], perProjectMax = 1): ScoredOpportunity[] {
  const counts = new Map<string, number>();
  const out: ScoredOpportunity[] = [];
  for (const o of opps) {
    const k = `${o.chain}::${o.project}`;
    const c = counts.get(k) || 0;
    if (c >= perProjectMax) continue;
    counts.set(k, c + 1);
    out.push(o);
  }
  return out;
}

async function getBaseNetworkContext(): Promise<{ gasPriceGwei?: string; blockNumber?: string } | null> {
  try {
    const [gasPrice, blockNumber] = await Promise.all([baseClient.getGasPrice(), baseClient.getBlockNumber()]);
    return { gasPriceGwei: formatGwei(gasPrice), blockNumber: blockNumber.toString() };
  } catch (error) {
    console.warn('[defi-yield] base network context failed:', error);
    return null;
  }
}

async function fetchCdpSwapPrice(params: {
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  fromAmount: bigint;
  taker?: `0x${string}`;
}): Promise<any | null> {
  // CDP swap preview is no longer available after Privy migration.
  // Fall through to 0x API as the primary swap preview source.
  return null;
}

function suggestedSlippageBps(o: ScoredOpportunity): number {
  // Conservative default; widen a bit for higher-risk / more volatile pools.
  const risk = clamp(toNumber(o.riskScore), 0, 100);
  const vol = clamp(toNumber(o.volatility30d), 0, 10);

  let bps = 75;
  if (risk >= 70 || vol >= 0.9) bps = 200;
  else if (risk >= 55 || vol >= 0.6) bps = 125;
  else if (risk >= 40 || vol >= 0.4) bps = 100;
  else bps = 75;

  return clamp(bps, 25, 300);
}

/**
 * Resolve token addresses to human-readable symbols using DeFiLlama prices API.
 * Batches all addresses into a single call. Cached per invocation.
 */
const _tokenSymbolCache = new Map<string, string>();

async function resolveTokenSymbols(addresses: string[]): Promise<void> {
  const unresolved = addresses.filter((a) => isAddressLike(a) && !_tokenSymbolCache.has(a.toLowerCase()));
  if (unresolved.length === 0) return;

  // DeFiLlama accepts comma-separated "chain:address" identifiers
  const coins = unresolved.map((a) => `base:${a}`).join(',');
  try {
    const data = await fetchJsonWithTimeout(
      `https://coins.llama.fi/prices/current/${encodeURIComponent(coins)}`,
      8_000,
      { headers: { Accept: 'application/json' } }
    );
    const coinData = data?.coins || {};
    for (const addr of unresolved) {
      const key = `base:${addr}`;
      const symbol = coinData[key]?.symbol || coinData[key.toLowerCase()]?.symbol;
      _tokenSymbolCache.set(addr.toLowerCase(), typeof symbol === 'string' ? symbol : addr);
    }
  } catch (e) {
    console.warn('[DeFi Yield] Token symbol resolution failed (non-fatal):', e instanceof Error ? e.message : e);
    for (const addr of unresolved) {
      _tokenSymbolCache.set(addr.toLowerCase(), addr);
    }
  }
}

function getTokenSymbol(address: string): string {
  return _tokenSymbolCache.get(address.toLowerCase()) || address;
}

/**
 * Determine the target asset for a pool.
 * Returns { address, symbol, directDeposit } or null.
 *
 * For single-asset pools where the only underlying token is USDC (e.g. Morpho STEAKUSDC,
 * Aave USDC), there's no swap needed — the user deposits USDC directly. We mark these
 * as directDeposit so the UI can show "Deposit USDC" instead of "Swap unavailable".
 */
function pickTargetAsset(opp: ScoredOpportunity): { address: `0x${string}`; symbol: string; directDeposit: boolean } | null {
  const toks = Array.isArray(opp.underlyingTokens) ? opp.underlyingTokens : [];
  const usdc = PAYMENT_TOKEN.toLowerCase();

  // Find a non-USDC underlying token
  const target = toks.find((t) => isAddressLike(t) && t.toLowerCase() !== usdc);
  if (target) {
    return { address: target as `0x${string}`, symbol: getTokenSymbol(target), directDeposit: false };
  }

  // If all underlying tokens are USDC (single-asset lending/vault pool), it's a direct deposit
  const allUsdc = toks.length > 0 && toks.every((t) => isAddressLike(t) && t.toLowerCase() === usdc);
  if (allUsdc) {
    return { address: PAYMENT_TOKEN as `0x${string}`, symbol: 'USDC', directDeposit: true };
  }

  return null;
}

async function fetch0xPermit2Price(params: {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker?: string;
}): Promise<any | null> {
  const apiKey = process.env.ZEROX_API_KEY;
  if (!apiKey) return null;

  const url = new URL('https://api.0x.org/swap/permit2/price');
  url.searchParams.set('chainId', String(params.chainId));
  url.searchParams.set('sellToken', params.sellToken);
  url.searchParams.set('buyToken', params.buyToken);
  url.searchParams.set('sellAmount', params.sellAmount);
  if (params.taker) {
    url.searchParams.set('taker', params.taker);
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', '0x-api-key': apiKey },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.warn('[defi-yield] CDP swap price fetch failed:', error);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Produce deterministic ranked list + optional enrichment + optional LLM insights.
 */
async function buildYieldReport(params: DefiYieldRequest) {
  const includeProtocolDetails = params.includeProtocolDetails !== false;
  const includeLLM = params.includeLLM !== false;

  const pools = await fetchDeFiLlamaPools(params);
  const scored = pools.map((p) => computeOpportunityScore(p, params));
  scored.sort((a, b) => b.score - a.score);

  // Take top candidates, and create a diversified shortlist for LLM + UI
  const maxResults = clamp(toNumber(params.maxResults) || 20, 5, 50);
  const topRanked = scored.slice(0, maxResults);
  const diversified = diversifyByProject(scored, 1).slice(0, Math.max(15, Math.min(25, maxResults + 5)));

  // Enrich protocols for diversified shortlist only (keeps latency sane)
  if (includeProtocolDetails) {
    const uniqueProjects = Array.from(new Set(diversified.map((o) => o.project))).slice(0, 20);
    const metas = await Promise.all(uniqueProjects.map((p) => fetchProtocolMeta(p)));
    const byProject = new Map<string, ProtocolMeta | null>();
    uniqueProjects.forEach((p, idx) => byProject.set(p, metas[idx] || null));

    for (const o of topRanked) o.protocol = byProject.get(o.project) ?? null;
    for (const o of diversified) o.protocol = byProject.get(o.project) ?? null;
  }

  // LLM layer is optional and should never be required for correctness.
  let aiInsights: any = null;
  if (includeLLM && process.env.OPENROUTER_API_KEY) {
    const llmInput = diversified.slice(0, 15).map((o) => ({
      poolId: o.poolId,
      chain: o.chain,
      project: o.project,
      symbol: o.symbol,
      tvlUsd: o.tvlUsd,
      apy: o.apy,
      apyBase: o.apyBase,
      apyReward: o.apyReward,
      stablecoin: o.stablecoin,
      exposure: o.exposure,
      ilRisk: o.ilRisk,
      apyMean30d: o.apyMean30d,
      volatility30d: o.volatility30d,
      rewardShare: o.rewardShare,
      riskScore: o.riskScore,
      score: o.score,
      protocolCategory: o.protocol?.category,
      auditLinks: o.protocol?.audit_links?.slice(0, 2),
      reasons: o.reasons.slice(0, 4),
    }));

    const systemPrompt = `You are a senior DeFi yield analyst. You MUST only use the provided data.\n\nRules:\n- Do NOT invent protocols, audits, chains, or numbers.\n- If you are uncertain, say so explicitly.\n- Prefer higher TVL, lower rewardShare, and lower volatility for conservative picks.\n- Output STRICT JSON (no markdown).\n\nReturn JSON with this exact shape:\n{\n  \"summary\": string,\n  \"topPicks\": [\n    {\n      \"poolId\": string,\n      \"riskLevel\": \"low\"|\"medium\"|\"high\",\n      \"why\": string,\n      \"watchouts\": string[],\n      \"whoItsFor\": string\n    }\n  ],\n  \"portfolioSuggestion\": {\n    \"conservative\": {\"picks\": string[], \"notes\": string},\n    \"balanced\": {\"picks\": string[], \"notes\": string},\n    \"aggressive\": {\"picks\": string[], \"notes\": string}\n  },\n  \"redFlags\": string[],\n  \"notes\": string\n}`;

    const userMessage = `Filters:\n- chain: Base (fixed)\n- minTvl: ${toNumber(params.minTvl) || 100000}\n- minApy: ${toNumber(params.minApy) || 1}\n- stablecoinOnly: ${!!params.stablecoinOnly}\n- target: ${params.target || 'balanced'}\n- riskTolerance: ${params.riskTolerance || 'medium'}\n\nCandidate shortlist (ranked):\n${JSON.stringify(llmInput)}\n\nPick up to 5 top pools by poolId and explain tradeoffs.`;

    try {
      aiInsights = await chatCompletionJSON(MODELS.GEMINI_FLASH_15, systemPrompt, userMessage, {
        temperature: 0.2,
        max_tokens: 2200,
      });
    } catch (e) {
      console.error('[DeFi Yield] LLM insights failed (non-fatal):', e);
      aiInsights = null;
    }
  }

  return {
    poolsConsidered: pools.length,
    ranked: topRanked,
    shortlist: diversified.slice(0, 15),
    aiInsights,
    baseContext: await getBaseNetworkContext(),
    executionHints: await (async () => {
      // Batch-resolve all underlying token addresses to symbols via DeFiLlama
      const allAddresses = topRanked.flatMap((o) =>
        (Array.isArray(o.underlyingTokens) ? o.underlyingTokens : []).filter((t) => isAddressLike(t))
      );
      await resolveTokenSymbols(allAddresses);

      return topRanked.map((o) => {
        const targetAsset = pickTargetAsset(o);
        return {
          poolId: o.poolId,
          entryAsset: {
            chainId: CHAIN_ID,
            address: PAYMENT_TOKEN,
            symbol: 'USDC',
            decimals: TOKEN_DECIMALS,
          },
          targetAsset: targetAsset
            ? { chainId: CHAIN_ID, address: targetAsset.address, symbol: targetAsset.symbol, directDeposit: targetAsset.directDeposit }
            : null,
          suggestedSlippageBps: suggestedSlippageBps(o),
        };
      });
    })(),
    swapPreviews: await (async () => {
      const usdcBase = PAYMENT_TOKEN as `0x${string}`;
      const fromAmount = 100n * 10n ** BigInt(TOKEN_DECIMALS); // $100 USDC
      const taker = isAddressLike(params.takerAddress) ? (params.takerAddress as `0x${string}`) : undefined;

      const picks = topRanked.slice(0, 5);
      const previews = await Promise.all(
        picks.map(async (o) => {
          const target = pickTargetAsset(o);
          const slippageBps = suggestedSlippageBps(o);

          // Single-asset USDC pools: no swap needed, deposit directly
          if (target?.directDeposit) {
            console.log(`[DeFi Yield] Direct USDC deposit for pool ${o.poolId} (${o.symbol})`);
            return { poolId: o.poolId, ok: true, source: 'direct_deposit', slippageBps: 0, directDeposit: true, symbol: 'USDC' };
          }

          if (!target) {
            console.log(`[DeFi Yield] No target asset for pool ${o.poolId} (${o.symbol})`);
            return { poolId: o.poolId, ok: false, reason: 'missing_underlying_token_address' };
          }

          const cdpPrice = await fetchCdpSwapPrice({
            fromToken: usdcBase,
            toToken: target.address,
            fromAmount,
            taker,
          });
          if (cdpPrice) {
            console.log(`[DeFi Yield] CDP swap preview OK for pool ${o.poolId} (${o.symbol})`);
            return { poolId: o.poolId, ok: true, source: 'cdp', slippageBps, targetSymbol: target.symbol, price: cdpPrice };
          }

          // Fallback to 0x (optional add-on)
          const sellAmount = (100 * 1e6).toFixed(0); // 100 USDC (6 decimals)
          const oxPrice = await fetch0xPermit2Price({
            chainId: 8453,
            sellToken: PAYMENT_TOKEN,
            buyToken: target.address,
            sellAmount,
            taker: taker,
          });
          if (oxPrice) {
            console.log(`[DeFi Yield] 0x swap preview OK for pool ${o.poolId} (${o.symbol})`);
            return { poolId: o.poolId, ok: true, source: '0x', slippageBps, targetSymbol: target.symbol, price: oxPrice };
          }

          console.log(`[DeFi Yield] No swap preview available for pool ${o.poolId} (${o.symbol}, target: ${target.address})`);
          return { poolId: o.poolId, ok: false, reason: 'no_liquidity_or_preview_unavailable' };
        })
      );
      return previews;
    })(),
  };
}

/**
 * Execute task endpoint with X402 Payment Required support
 */
export async function POST(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  console.log('[DeFi Yield API] POST handler called');
  try {
    const body: DefiYieldRequest = await request.json();
    // Normalize chain — default to Base if not provided or unsupported.
    const rawChain = (body.chain || 'base').toLowerCase();
    body.chain = ['base', 'polygon'].includes(rawChain) ? rawChain : 'base';

    // Payment gating disabled - agents are free to use
    console.log(`[${AGENT_NAME}] Payment gating disabled - proceeding without payment`);

    // ========================================
    // STEP 1: Fetch DeFiLlama data + AI analysis (no payment required)
    // ========================================
    // Track job in collaborate_missions
    const user_address = request.headers.get('x-wallet-address');
    const jobResult = await createSingleAgentJob({
      agentName: AGENT_NAME,
      agentWallet: CDP_WALLET,
      title: `DeFi Yield Scan: ${body.target || 'balanced'}`,
      description: `Yield scan on ${body.chain || 'base'}, risk: ${body.riskTolerance || 'medium'}`,
      budget: SERVICE_PRICE,
      category: 'defi-yield',
      creatorAddress: user_address || 'anonymous',
    });
    const missionId = jobResult.missionId || null;

    let report;
    try {
      report = await buildYieldReport(body);
      console.log(`[${AGENT_NAME}] Considered ${report.poolsConsidered} pools; returning ${report.ranked.length}`);
    } catch (error) {
      const isTimeout = error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'));
      const errorMessage = isTimeout
        ? 'DeFiLlama data source is slow right now. Please try again in a moment.'
        : (error instanceof Error ? error.message : 'Yield scan failed');
      const status = isTimeout ? 504 : 422;
      return NextResponse.json({ success: false, error: 'Yield scan failed', message: errorMessage }, { status });
    }

    // Complete the job
    if (missionId && jobResult.taskId) {
      completeSingleAgentJob({ missionId, taskId: jobResult.taskId, submissionData: { poolsConsidered: report.poolsConsidered, returned: report.ranked.length } }).catch(() => {});
    }

    // ========================================
    // STEP 2: Return results
    // ========================================
    return NextResponse.json(
      {
        success: true,
        agentId: AGENT_ID,
        agentName: AGENT_NAME,
        missionId,
        data: {
          rankedOpportunities: report.ranked,
          shortlist: report.shortlist,
          aiInsights: report.aiInsights,
          poolsConsidered: report.poolsConsidered,
          baseContext: report.baseContext || null,
          executionHints: report.executionHints || [],
          swapPreviews: report.swapPreviews || [],
          filtersApplied: {
            chain: body.chain || 'all',
            minTvl: body.minTvl || 100000,
            minApy: body.minApy || 1,
            stablecoinOnly: body.stablecoinOnly || false,
            target: body.target || (body.stablecoinOnly ? 'stable' : 'balanced'),
            riskTolerance: body.riskTolerance || 'medium',
            includeLLM: body.includeLLM !== false,
            includeProtocolDetails: body.includeProtocolDetails !== false,
          },
          scannedAt: new Date().toISOString(),
        },
      },
    );
  } catch (error) {
    console.error(`[${AGENT_NAME}] Request error:`, error);
    return NextResponse.json({ error: 'Internal error', message: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

/**
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    agent: AGENT_NAME,
    agentId: AGENT_ID,
    erc8004AgentId: ERC8004_AGENT_ID,
    cdpWallet: CDP_WALLET,
    pricing: { perScan: SERVICE_PRICE, currency: 'USDC', chainId: CHAIN_ID, token: PAYMENT_TOKEN },
    capabilities: [
      'defi-yield-analysis',
      'apy-comparison',
      'risk-assessment',
      'tvl-tracking',
      'il-risk-analysis',
      'protocol-enrichment',
      'deterministic-ranking',
      'llm-insights-layer',
    ],
    supportedChains: ['Base', 'Polygon'],
    dataSource: 'DeFiLlama',
    timestamp: new Date().toISOString(),
  });
}
