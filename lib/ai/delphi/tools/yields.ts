/**
 * Yield / lending executors: DeFi yield scan, Morpho vaults, Uniswap pool
 * browser, Aave/Compound deposit prep, yield strategy, Morpho deposit prep.
 */

import { httpRpcUrl } from '@/lib/rpc/endpoints';
import { fetchMorphoVaults, fetchMorphoVault } from '@/lib/morpho/client';
import { MORPHO_VAULTS } from '@/lib/morpho/config';
import {
  BASE_USDC_ADDRESS,
  DEFI_PROTOCOL_CONFIG,
  fetchTimeout,
  formatCompact,
  getBaseUrl,
} from './shared';

// ---------------------------------------------------------------------------
// scan_yields — internal fetch to /api/new-agents/defi-yield
// ---------------------------------------------------------------------------

export async function executeScanYields(args: Record<string, unknown>) {
  try {
    const body: Record<string, unknown> = {
      // DELPHI is its own LLM — skip the second LLM layer + protocol details to cut latency
      includeLLM: false,
      includeProtocolDetails: false,
    };
    if (args.chain) body.chain = args.chain;
    if (args.minTvl != null) body.minTvl = args.minTvl;
    if (args.minApy != null) body.minApy = args.minApy;
    if (args.stablecoinOnly != null) body.stablecoinOnly = args.stablecoinOnly;
    if (args.riskTolerance) body.riskTolerance = args.riskTolerance;
    if (args.target) body.target = args.target;

    const { signal, clear } = fetchTimeout(25_000);
    const res = await fetch(`${getBaseUrl()}/api/new-agents/defi-yield`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.INTERNAL_API_SECRET && { 'x-internal-secret': process.env.INTERNAL_API_SECRET }),
      },
      body: JSON.stringify(body),
      signal,
    });
    clear();

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { error: errData.error || `Yield scan failed: ${res.status}` };
    }

    const json = await res.json();
    // The defi-yield API wraps in { success, data: { rankedOpportunities, ... } }
    // The DefiYieldResultPanel expects rankedOpportunities at the top level
    if (json.data) return json.data;
    return json;
  } catch (err: any) {
    return { error: err.message || 'Yield scan failed' };
  }
}

// ---------------------------------------------------------------------------
// scan_morpho_vaults — fetch live Morpho MetaMorpho vaults on Base
// ---------------------------------------------------------------------------

export async function executeScanMorphoVaults(args: Record<string, unknown>) {
  try {
    let vaults = await fetchMorphoVaults();
    const asset = args.asset as string | undefined;

    if (asset) {
      vaults = vaults.filter((v) => v.asset.symbol.toUpperCase() === asset.toUpperCase());
    }

    // Sort by APY descending
    vaults.sort((a, b) => b.apy.net - a.apy.net);

    return {
      action: 'list_vaults',
      vaults,
      vaultCount: vaults.length,
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch Morpho vaults' };
  }
}

// ---------------------------------------------------------------------------
// browse_pools — fetch Uniswap V3 pools from internal API
// ---------------------------------------------------------------------------

export async function executeBrowsePools(args: Record<string, unknown>) {
  const chainId = (args.chainId as number) || 8453;
  const search = (args.search as string) || '';
  const limit = Math.min(50, (args.limit as number) || 10);

  try {
    const params = new URLSearchParams({ chainId: String(chainId), first: String(limit) });
    if (search) params.set('search', search);

    const { signal, clear } = fetchTimeout(15_000);
    const res = await fetch(`${getBaseUrl()}/api/defi/pools?${params}`, { signal });
    clear();

    if (!res.ok) {
      return { error: 'Failed to fetch pool data' };
    }

    const data = await res.json();
    if (!data.ok) return { error: data.error || 'Pool fetch failed' };

    // Shape for DELPHI to render as markdown table
    const pools = (data.pools || []).map((p: any) => ({
      pair: `${p.token0?.symbol}/${p.token1?.symbol}`,
      feeTier: `${(parseInt(p.feeTier) / 10000).toFixed(2)}%`,
      apr: `${(p.estimatedAPR || 0).toFixed(1)}%`,
      tvl: `$${formatCompact(p.tvlUSD)}`,
      volume24h: `$${formatCompact(p.volumeUSD)}`,
    }));

    return { pools, count: pools.length, chainId };
  } catch {
    return { error: 'Pool data unavailable. Try again.' };
  }
}

// ---------------------------------------------------------------------------
// prepare_defi_deposit — Aave V3 / Compound III deposit preparation
// ---------------------------------------------------------------------------

export async function executePrepareDefiDeposit(args: Record<string, unknown>, walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'No wallet connected. Ask the user to connect their wallet before depositing.' };
  }

  const protocol = args.protocol as string;
  const amount = args.amount as string;

  if (!protocol || !DEFI_PROTOCOL_CONFIG[protocol]) {
    return { error: `Invalid protocol. Supported: ${Object.keys(DEFI_PROTOCOL_CONFIG).join(', ')}` };
  }
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return { error: 'Invalid amount. Provide a positive number.' };
  }

  const config = DEFI_PROTOCOL_CONFIG[protocol];
  const requiredAmount = parseFloat(amount);

  // Check USDC balance on ALL chains so the AI can suggest bridging if needed
  const usdcAddresses: Record<string, string> = {
    base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  };
  const balances: Record<string, number> = {};
  const balanceChecks = Object.entries(usdcAddresses).map(async ([chain, addr]) => {
    try {
      const rpcUrl = ({ base: httpRpcUrl('base'), ethereum: httpRpcUrl('ethereum'), polygon: httpRpcUrl('polygon') } as Record<string, string>)[chain];
      if (!rpcUrl) return;
      const paddedAddr = walletAddress.slice(2).toLowerCase().padStart(64, '0');
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: addr, data: '0x70a08231' + paddedAddr }, 'latest'] }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      const raw = BigInt(data.result || '0');
      balances[chain] = Number(raw) / 1e6;
    } catch { /* skip failed balance check */ }
  });
  await Promise.all(balanceChecks);

  const baseBalance = balances['base'] || 0;
  const sufficient = baseBalance >= requiredAmount;

  return {
    deposit: {
      protocol,
      protocolLabel: config.label,
      poolAddress: config.poolAddress,
      assetAddress: BASE_USDC_ADDRESS,
      assetSymbol: 'USDC',
      assetDecimals: 6,
      amount,
    },
    walletBalances: {
      targetChain: { chain: 'base', balance: parseFloat(baseBalance.toFixed(4)) },
      allChains: Object.entries(balances).map(([c, b]) => ({ chain: c, balance: parseFloat(b.toFixed(4)) })),
      totalAcrossChains: parseFloat(Object.values(balances).reduce((s, b) => s + b, 0).toFixed(4)),
      sufficient,
      shortfall: sufficient ? 0 : parseFloat((requiredAmount - baseBalance).toFixed(4)),
    },
  };
}

// ---------------------------------------------------------------------------
// generate_yield_strategy — AI yield strategy; reuses executeScanYields for pools
// ---------------------------------------------------------------------------

export async function executeGenerateYieldStrategy(args: Record<string, unknown>) {
  const riskTolerance = (args.riskTolerance as string) || 'balanced';
  const amount = args.amount as string || '1000';

  try {
    // Step 1: Fetch real yield pools — the strategy endpoint needs actual data to allocate
    const yieldResult = await executeScanYields({
      riskTolerance,
      target: riskTolerance === 'conservative' ? 'stable' : riskTolerance === 'aggressive' ? 'max_yield' : 'balanced',
    });

    const yieldPools = (yieldResult as any)?.rankedOpportunities || (yieldResult as any)?.pools || [];

    if (yieldPools.length === 0) {
      return { error: 'No yield pools available to build a strategy. Try scan_yields to see current opportunities.' };
    }

    // Step 2: Pass real pools to the strategy endpoint
    const { signal, clear } = fetchTimeout(25_000);
    const res = await fetch(`${getBaseUrl()}/api/dashboard/yields/strategy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolioData: {
          totalValue: parseFloat(amount),
          availableForDeploy: parseFloat(amount),
        },
        yieldPools,
        riskTolerance,
      }),
      signal,
    });
    clear();

    if (!res.ok) {
      // Fallback: return pools with manual allocation suggestion
      return {
        strategy: 'manual',
        note: 'Strategy engine unavailable — here are the top pools matching your risk profile.',
        riskTolerance,
        amount,
        pools: yieldPools.slice(0, 5),
      };
    }

    const data = await res.json();
    const strategy = data.data || data;

    // Validate response isn't empty
    if (!strategy || (typeof strategy === 'object' && Object.keys(strategy).length === 0)) {
      return {
        strategy: 'manual',
        note: 'Strategy engine returned empty — here are the top pools matching your risk profile.',
        riskTolerance,
        amount,
        pools: yieldPools.slice(0, 5),
      };
    }

    return strategy;
  } catch {
    return { error: 'Strategy generation unavailable. Use scan_yields to browse opportunities manually.' };
  }
}

// ---------------------------------------------------------------------------
// prepare_morpho_deposit — resolve vault + return deposit params for frontend
// ---------------------------------------------------------------------------

export async function executePrepareMorphoDeposit(args: Record<string, unknown>, walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'No wallet connected. Ask the user to connect their wallet before depositing.' };
  }

  const vaultName = args.vaultName as string;
  const amount = args.amount as string;

  if (!vaultName) return { error: 'Missing vault name' };
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return { error: 'Invalid amount. Provide a positive number.' };
  }

  // Match vault: exact first, then best substring (longest name match wins to avoid ambiguity)
  const nameLower = vaultName.toLowerCase();
  let configVault = MORPHO_VAULTS.find((v) => v.name.toLowerCase() === nameLower);

  if (!configVault) {
    // Substring match — pick the longest-named match to prefer specific over generic
    // e.g. "Steakhouse Prime Instant ETH" over "Steakhouse Prime Instant"
    const candidates = MORPHO_VAULTS.filter((v) => v.name.toLowerCase().includes(nameLower));
    if (candidates.length === 1) {
      configVault = candidates[0];
    } else if (candidates.length > 1) {
      return {
        error: `Multiple vaults match "${vaultName}": ${candidates.map((v) => `${v.name} (${v.asset})`).join(', ')}. Please specify the exact vault name.`,
      };
    }
  }

  if (!configVault) {
    return {
      error: `Vault "${vaultName}" not found. Available vaults: ${MORPHO_VAULTS.map((v) => `${v.name} (${v.asset})`).join(', ')}`,
    };
  }

  // Fetch live data for APY
  let apy = 0;
  let apyAvailable = true;
  try {
    const liveVault = await fetchMorphoVault(configVault.address);
    if (liveVault) apy = liveVault.apy.net;
  } catch (err) {
    console.warn('[DELPHI] Failed to fetch live APY for vault:', err);
    apyAvailable = false;
  }

  return {
    deposit: {
      vaultAddress: configVault.address,
      vaultName: configVault.name,
      assetAddress: configVault.assetAddress,
      assetSymbol: configVault.asset,
      assetDecimals: configVault.assetDecimals,
      amount,
      apy: apyAvailable ? (apy * 100).toFixed(2) : null,
      curator: configVault.curator,
    },
  };
}
