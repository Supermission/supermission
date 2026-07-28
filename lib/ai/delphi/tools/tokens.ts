/**
 * Token-analysis executors: deep due diligence, web research, directory
 * listings, Nansen intel, safety checks, holder distribution.
 */

import { getCachedTokenData } from '@/lib/new-agents/tokenDueDiligence/cacheDataHelper';
import { researchTopic } from '@/lib/ai/shared/research';
import { getTokenInfo, getNansenIndicators, getFlowIntelligence, searchToken } from '@/lib/nansen/client';
import { etherscanQuery, fetchTimeout, getBaseUrl, STATIC_TOKENS, SUPPORTED_CHAINS } from './shared';
import { isEvmAddress, resolveChainFromAddress, SUPPORTED_CHAIN_SLUG } from './resolve-chain';

const NO_CHAIN_FOUND = 'Could not find this token on Ethereum, Base, Polygon, or Arbitrum. Double-check the address, or tell me which chain it is on.';

/** Resolve a numeric chainId for a token, auto-detecting from the address when
 *  the caller didn't pass one. Returns null if it can't be determined. */
async function coerceChainId(explicit: unknown, address: unknown): Promise<number | null> {
  if (typeof explicit === 'number' && explicit > 0) return explicit;
  if (isEvmAddress(address)) {
    const r = await resolveChainFromAddress(address);
    if (r.found && r.chainId) return r.chainId;
  }
  return null;
}

// ---------------------------------------------------------------------------
// analyze_token — wraps getCachedTokenData (12h cache)
// ---------------------------------------------------------------------------

export async function executeAnalyzeToken(args: Record<string, unknown>) {
  const contractAddress = args.contractAddress as string;
  if (!contractAddress) return { error: 'Missing contractAddress' };
  const chainId = await coerceChainId(args.chainId, contractAddress);
  if (!chainId) return { error: NO_CHAIN_FOUND };

  try {
    const report = await getCachedTokenData(contractAddress, chainId);
    return report;
  } catch (err: any) {
    return { error: err.message || 'Token analysis failed' };
  }
}

// ---------------------------------------------------------------------------
// research_topic — wraps researchTopic from shared research utility
// ---------------------------------------------------------------------------

export async function executeResearch(args: Record<string, unknown>) {
  const query = args.query as string;
  if (!query) return { error: 'Missing required parameter: query' };

  try {
    const result = await researchTopic(query);
    return {
      query: result.query,
      one_liner: result.oneLiner,
      sources: result.snippets.map((s) => ({
        title: s.title,
        url: s.url,
        excerpt: s.excerpt,
      })),
      cached: result.cached,
    };
  } catch {
    return { error: 'Research service unavailable. Answer from your own knowledge instead.' };
  }
}

// ---------------------------------------------------------------------------
// list_tokens — internal fetch to /api/defi/tokens with static fallback
// ---------------------------------------------------------------------------

export async function executeListTokens(args: Record<string, unknown>) {
  const chainId = args.chainId as number;
  if (!chainId) return { error: 'Missing chainId' };

  // Try API with a retry on "loading" responses
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { signal, clear } = fetchTimeout(15_000);
      const res = await fetch(`${getBaseUrl()}/api/defi/tokens?chainId=${chainId}`, { signal });
      clear();
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || '';
        // Retry once if backend is still loading
        if (attempt === 0 && (errMsg.toLowerCase().includes('loading') || errMsg.toLowerCase().includes('initializ'))) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        // Fall through to static fallback
        break;
      }
      return await res.json();
    } catch {
      break;
    }
  }

  // Fallback: return static common tokens for the chain
  const staticList = STATIC_TOKENS[chainId];
  if (staticList) {
    return { tokens: staticList, source: 'static_fallback', note: 'Live token list unavailable — showing common tokens.' };
  }
  return { error: `Token list unavailable for chain ${chainId}. Supported chains: Base (8453), Ethereum (1), Polygon (137).` };
}

// ---------------------------------------------------------------------------
// list_chains — static list of supported chains
// ---------------------------------------------------------------------------

export function executeListChains() {
  return {
    chains: Object.entries(SUPPORTED_CHAINS).map(([id, name]) => ({
      chainId: parseInt(id, 10),
      name,
    })),
  };
}

// ---------------------------------------------------------------------------
// nansen_token_analysis — deep token analysis via Nansen (info + indicators + flows)
// ---------------------------------------------------------------------------

export async function executeNansenTokenAnalysis(args: Record<string, any>) {
  let chain: string | undefined = args.chain;
  let address = args.tokenAddress;

  // If no address but symbol given, search for it
  if (!address && args.tokenSymbol) {
    const search = await searchToken(args.tokenSymbol, chain);
    if ('error' in search) return { error: (search as any).error };
    const tokens = Array.isArray(search) ? search : [];
    const match = tokens[0];
    if (!match) return { error: `Token "${args.tokenSymbol}" not found${chain ? ` on ${chain}` : ''}` };
    address = match.address;
    chain = match.chain || chain;
  }

  if (!address) return { error: 'Token address required' };

  // Auto-detect the chain from the address when the model didn't pass one.
  if (!chain && isEvmAddress(address)) {
    const r = await resolveChainFromAddress(address);
    if (r.found && r.chainId) chain = SUPPORTED_CHAIN_SLUG[r.chainId];
  }
  if (!chain) return { error: NO_CHAIN_FOUND };

  // Fetch all 3 in parallel
  const [tokenInfo, indicators, flows] = await Promise.all([
    getTokenInfo(chain, address, '1d'),
    getNansenIndicators(chain, address),
    getFlowIntelligence(chain, address, '1d'),
  ]);

  const result: any = { chain, address };

  if (tokenInfo && !('error' in tokenInfo)) {
    const d = tokenInfo as any;
    result.token = {
      name: d.name, symbol: d.symbol, logo: d.logo,
      marketCap: d.market_cap_usd, fdv: d.fdv_usd,
      circulatingSupply: d.circulating_supply, totalSupply: d.total_supply,
      volume24h: d.volume_total_usd, buyVolume: d.buy_volume_usd, sellVolume: d.sell_volume_usd,
      buys: d.total_buys, sells: d.total_sells,
      uniqueBuyers: d.unique_buyers, uniqueSellers: d.unique_sellers,
      liquidity: d.liquidity_usd, holders: d.total_holders,
      deployDate: d.token_deployment_date,
      website: d.website, twitter: d.x, telegram: d.telegram,
    };
  }

  if (indicators && !('error' in indicators)) {
    const d = indicators as any;
    result.riskIndicators = (d.risk_indicators || []).map((i: any) => ({
      type: i.indicator_type, score: i.score, signal: i.signal, percentile: i.signal_percentile,
    }));
    result.rewardIndicators = (d.reward_indicators || []).map((i: any) => ({
      type: i.indicator_type, score: i.score, signal: i.signal, percentile: i.signal_percentile,
    }));
  }

  if (flows && !('error' in flows)) {
    const d = Array.isArray(flows) ? flows[0] : flows as any;
    result.flows = {
      smartTrader: { netFlow: d.smart_trader_net_flow_usd, avgFlow: d.smart_trader_avg_flow_usd, wallets: d.smart_trader_wallet_count },
      whale: { netFlow: d.whale_net_flow_usd, avgFlow: d.whale_avg_flow_usd, wallets: d.whale_wallet_count },
      exchange: { netFlow: d.exchange_net_flow_usd, avgFlow: d.exchange_avg_flow_usd, wallets: d.exchange_wallet_count },
      publicFigure: { netFlow: d.public_figure_net_flow_usd, avgFlow: d.public_figure_avg_flow_usd, wallets: d.public_figure_wallet_count },
    };
  }

  return { nansenAnalysis: result };
}

// ---------------------------------------------------------------------------
// search_nansen_token — search token by name/symbol via Nansen
// ---------------------------------------------------------------------------

export async function executeSearchNansenToken(args: Record<string, any>) {
  const result = await searchToken(args.query, args.chain);
  if ('error' in result) return { error: (result as any).error };
  const tokens = Array.isArray(result) ? result : [];
  return {
    results: tokens.map((t: any) => ({
      name: t.name, symbol: t.symbol, chain: t.chain,
      address: t.address, price: t.price,
      volume24h: t.volume_24h, marketCap: t.market_cap,
    })),
  };
}

// ---------------------------------------------------------------------------
// check_token_safety — Etherscan V2: source code, deployer, holder count
// ---------------------------------------------------------------------------

export async function executeCheckTokenSafety(args: Record<string, unknown>) {
  const contractAddress = args.contractAddress as string;
  if (!contractAddress) return { error: 'Missing contractAddress' };
  const chainId = (await coerceChainId(args.chainId, contractAddress)) ?? 8453;

  try {
    // 3 parallel Etherscan calls
    const [sourceResult, creationResult, holderResult] = await Promise.allSettled([
      etherscanQuery(chainId, 'contract', 'getsourcecode', { address: contractAddress }),
      etherscanQuery(chainId, 'contract', 'getcontractcreation', { contractaddresses: contractAddress }),
      etherscanQuery(chainId, 'token', 'tokenholdercount', { contractaddress: contractAddress }),
    ]);

    let verified = false;
    let compilerVersion: string | null = null;
    let license: string | null = null;

    if (sourceResult.status === 'fulfilled' && Array.isArray(sourceResult.value) && sourceResult.value.length > 0) {
      const src = sourceResult.value[0];
      verified = !!(src.SourceCode && src.SourceCode !== '');
      compilerVersion = src.CompilerVersion || null;
      license = src.LicenseType || null;
    }

    let deployer: string | null = null;
    let deployTx: string | null = null;
    let deployTimestamp: number | null = null;

    if (creationResult.status === 'fulfilled' && Array.isArray(creationResult.value) && creationResult.value.length > 0) {
      const creation = creationResult.value[0];
      deployer = creation.contractCreator || null;
      deployTx = creation.txHash || null;
      // Try to parse block timestamp if available
      if (creation.timestamp) {
        deployTimestamp = parseInt(creation.timestamp);
      }
    }

    let holderCount = 0;
    if (holderResult.status === 'fulfilled') {
      holderCount = parseInt(holderResult.value) || 0;
    }

    // Safety scoring: start at 100, subtract penalties
    let safetyScore = 100;
    const warnings: string[] = [];

    if (!verified) {
      safetyScore -= 40;
      warnings.push('Contract source code is NOT verified — high risk');
    }

    if (holderCount < 10) {
      safetyScore -= 40;
      warnings.push(`Extremely low holder count (${holderCount}) — possible rug risk`);
    } else if (holderCount < 50) {
      safetyScore -= 20;
      warnings.push(`Low holder count (${holderCount}) — early stage or low adoption`);
    }

    if (deployTimestamp) {
      const daysSinceDeploy = (Date.now() / 1000 - deployTimestamp) / 86400;
      if (daysSinceDeploy < 7) {
        safetyScore -= 10;
        warnings.push(`Deployed ${Math.floor(daysSinceDeploy)} day(s) ago — very new contract`);
      }
    }

    safetyScore = Math.max(0, safetyScore);

    return {
      contractAddress,
      chainId,
      verified,
      compilerVersion,
      license,
      deployer,
      deployTx,
      holderCount,
      safetyScore,
      warnings,
    };
  } catch (err: any) {
    return { error: err.message || 'Token safety check failed' };
  }
}

// ---------------------------------------------------------------------------
// get_token_holders — Etherscan V2: holder count + top holders
// ---------------------------------------------------------------------------

export async function executeGetTokenHolders(args: Record<string, unknown>) {
  const contractAddress = args.contractAddress as string;
  if (!contractAddress) return { error: 'Missing contractAddress' };
  const chainId = (await coerceChainId(args.chainId, contractAddress)) ?? 8453;

  try {
    // 2 parallel calls: holder count + top 10 holders
    const [countResult, topResult] = await Promise.allSettled([
      etherscanQuery(chainId, 'token', 'tokenholdercount', { contractaddress: contractAddress }),
      etherscanQuery(chainId, 'token', 'toptokenholders', { contractaddress: contractAddress, page: '1', offset: '10' }),
    ]);

    let holderCount = 0;
    if (countResult.status === 'fulfilled') {
      holderCount = parseInt(countResult.value) || 0;
    }

    let topHolders: Array<{ address: string; balance: string; share: string }> = [];
    let top10Concentration = 0;

    if (topResult.status === 'fulfilled' && Array.isArray(topResult.value)) {
      topHolders = topResult.value.map((h: any) => {
        const share = parseFloat(h.TokenHolderPercent || h.share || '0');
        top10Concentration += share;
        return {
          address: h.TokenHolderAddress || h.address || '',
          balance: h.TokenHolderQuantity || h.balance || '0',
          share: `${share.toFixed(2)}%`,
        };
      });
    }

    let concentrationRisk: 'low' | 'medium' | 'high' = 'low';
    if (top10Concentration > 80) concentrationRisk = 'high';
    else if (top10Concentration > 50) concentrationRisk = 'medium';

    return {
      contractAddress,
      chainId,
      holderCount,
      topHolders,
      top10Concentration: `${top10Concentration.toFixed(2)}%`,
      concentrationRisk,
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch token holders' };
  }
}
