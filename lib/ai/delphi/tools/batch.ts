/**
 * Batch operation executors: distribute USDC across trending tokens,
 * batch-allocate yield across LP/vault positions.
 *
 * Cross-module deps: batch yield allocation fans out to LP prep (lp.ts)
 * and Morpho prep (yields.ts).
 */

import { httpRpcUrl } from '@/lib/rpc/endpoints';
import { getTrendingTokens } from '@/lib/nansen/client';
import { executePrepareUniswapLP } from './lp';
import { executePrepareMorphoDeposit } from './yields';

// ---------------------------------------------------------------------------
// batch_buy_trending — analyze trending tokens and generate distribution plan
// ---------------------------------------------------------------------------

export async function executeBatchBuyTrending(args: Record<string, any>, walletAddress: string | null) {
  const totalAmount = parseFloat(args.totalAmount);
  if (isNaN(totalAmount) || totalAmount < 5) {
    return { error: 'Minimum batch buy amount is $5 USDC.' };
  }

  const count = Math.max(2, Math.min(args.count || 5, 10));
  const chain: string = args.chain || 'base';
  const allocationStrategy: string = args.allocationStrategy || 'equal';

  const chainIdMap: Record<string, number> = { base: 8453, ethereum: 1, polygon: 137 };
  const usdcMap: Record<string, string> = {
    base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  };

  const chainId = chainIdMap[chain];
  if (!chainId) {
    return { error: `Unsupported chain: ${chain}. Use base, ethereum, or polygon.` };
  }

  const fromToken = usdcMap[chain];

  // Check USDC balance on ALL chains so the AI can suggest bridging if needed
  const balances: Record<string, number> = {};
  if (walletAddress) {
    const balanceChecks = Object.entries(usdcMap).map(async ([c, addr]) => {
      try {
        const rpcUrl = ({ base: httpRpcUrl('base'), ethereum: httpRpcUrl('ethereum'), polygon: httpRpcUrl('polygon') } as Record<string, string>)[c];
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
        balances[c] = Number(raw) / 1e6; // USDC has 6 decimals
      } catch { /* skip failed balance check */ }
    });
    await Promise.all(balanceChecks);
  }

  const targetChainBalance = balances[chain] || 0;

  // Fetch trending tokens using the same pattern as executeGetTrendingTokens
  const result = await getTrendingTokens({
    chains: [chain],
    timeframe: '24h',
    sortBy: 'buy_volume',
    sortDirection: 'DESC',
    traderType: 'all',
    limit: Math.min(count * 3, 25),
  });

  if ('error' in result) return { error: (result as any).error };

  const rawTokens = Array.isArray(result) ? result : [];

  // Filter out stablecoins and tokens with no price or address
  const stableSymbols = ['USDC', 'USDT', 'DAI', 'USDbC', 'USDC.e', 'BUSD', 'FRAX'];
  const filtered = rawTokens.filter((t: any) => {
    if (!t.token_address || !t.price_usd || t.price_usd <= 0) return false;
    if (stableSymbols.includes((t.token_symbol || '').toUpperCase())) return false;
    return true;
  });

  if (filtered.length === 0) {
    return { error: 'No qualifying trending tokens found on this chain right now. Try a different chain.' };
  }

  const selected = filtered.slice(0, count);

  // Calculate allocations
  let allocations: number[];
  if (allocationStrategy === 'weighted') {
    const totalVolume = selected.reduce((sum: number, t: any) => sum + (t.buy_volume || t.volume || 1), 0);
    allocations = selected.map((t: any) => {
      const weight = (t.buy_volume || t.volume || 1) / totalVolume;
      return parseFloat((totalAmount * weight).toFixed(2));
    });
    // Adjust rounding difference to first token
    const diff = totalAmount - allocations.reduce((a, b) => a + b, 0);
    if (allocations.length > 0) allocations[0] = parseFloat((allocations[0] + diff).toFixed(2));
  } else {
    const perToken = parseFloat((totalAmount / selected.length).toFixed(2));
    allocations = selected.map(() => perToken);
    const diff = parseFloat((totalAmount - perToken * selected.length).toFixed(2));
    if (allocations.length > 0) allocations[0] = parseFloat((allocations[0] + diff).toFixed(2));
  }

  const tokens = selected.map((t: any, i: number) => {
    const rank = i + 1;
    let reasoning: string;
    if (i === 0) reasoning = `Highest 24h buy volume on ${chain.charAt(0).toUpperCase() + chain.slice(1)}`;
    else reasoning = `#${rank} by trading activity`;

    return {
      rank,
      symbol: t.token_symbol,
      address: t.token_address,
      chain,
      chainId,
      priceUSD: t.price_usd,
      allocationUSD: allocations[i],
      allocationPercent: parseFloat(((allocations[i] / totalAmount) * 100).toFixed(1)),
      decimalsOut: 18,
      reasoning,
      volume24h: t.volume || t.buy_volume || 0,
      priceChange24h: t.price_change ? `${t.price_change > 0 ? '+' : ''}${t.price_change.toFixed(2)}%` : 'N/A',
    };
  });

  return {
    plan: {
      fromToken,
      fromSymbol: 'USDC',
      decimalsIn: 6,
      chainId,
      chain,
      totalUSD: totalAmount,
      count: tokens.length,
      allocationStrategy,
      tokens,
    },
    walletBalances: {
      targetChain: { chain, balance: parseFloat(targetChainBalance.toFixed(4)) },
      allChains: Object.entries(balances).map(([c, b]) => ({ chain: c, balance: parseFloat(b.toFixed(4)) })),
      totalAcrossChains: parseFloat(Object.values(balances).reduce((s, b) => s + b, 0).toFixed(4)),
      sufficient: targetChainBalance >= totalAmount,
      shortfall: targetChainBalance >= totalAmount ? 0 : parseFloat((totalAmount - targetChainBalance).toFixed(4)),
    },
  };
}

// ---------------------------------------------------------------------------
// execute_batch_buy — confirmed batch-buy execution signal for the frontend
// ---------------------------------------------------------------------------

export async function executeExecuteBatchBuy(args: Record<string, any>, walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'Wallet not connected. Please connect your wallet first.' };
  }
  if (args.confirmed !== true) {
    return { error: 'Batch buy not confirmed. User must confirm before execution.' };
  }

  return {
    execution: {
      confirmed: true,
      chainId: args.chainId || 8453,
      fromToken: args.fromToken || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      totalAmount: args.totalAmount || '0',
    },
  };
}

// ---------------------------------------------------------------------------
// batch_allocate_yield — prepare multiple LP/vault positions for batch execution
// ---------------------------------------------------------------------------

export async function executeBatchAllocateYield(args: Record<string, any>, walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'Wallet not connected. Please connect your wallet first.' };
  }

  const positions = args.positions as Array<{
    protocol: 'uniswap_v3' | 'morpho';
    token0Symbol?: string;
    token1Symbol?: string;
    vaultName?: string;
    amountUSD: number;
    feeTier?: number;
  }>;

  if (!positions || !Array.isArray(positions) || positions.length === 0) {
    return { error: 'No positions provided. Provide an array of yield positions.' };
  }

  if (positions.length > 10) {
    return { error: 'Maximum 10 positions per batch.' };
  }

  const prepared: Array<{
    index: number;
    protocol: string;
    label: string;
    amountUSD: number;
    status: 'ready' | 'error';
    error?: string;
    lpData?: any;
    morphoData?: any;
  }> = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];

    if (pos.protocol === 'uniswap_v3') {
      if (!pos.token0Symbol || !pos.token1Symbol) {
        prepared.push({ index: i, protocol: 'uniswap_v3', label: 'Unknown LP', amountUSD: pos.amountUSD, status: 'error', error: 'Missing token symbols' });
        continue;
      }

      // amountUSD is a DOLLAR value, but executePrepareUniswapLP's amount0/amount1
      // are TOKEN amounts — so it may only be assigned to a stablecoin leg (1≈$1).
      // Assign it to whichever leg is the stablecoin; the pool ratio derives the
      // other. The old code assigned it to the volatile leg regardless of order,
      // turning "$5" of a WETH/USDC position into 5 WETH (~$17k).
      const STABLE_SYMBOLS = new Set(['USDC', 'USDbC', 'USDC.e', 'DAI', 'USDT']);
      const t0Stable = STABLE_SYMBOLS.has(pos.token0Symbol);
      const t1Stable = STABLE_SYMBOLS.has(pos.token1Symbol);
      if (!t0Stable && !t1Stable) {
        prepared.push({ index: i, protocol: 'uniswap_v3', label: `${pos.token0Symbol}/${pos.token1Symbol}`, amountUSD: pos.amountUSD, status: 'error', error: 'Batch yield sizing needs a stablecoin leg to map the USD amount; specify token amounts explicitly for volatile/volatile pairs.' });
        continue;
      }
      const result = await executePrepareUniswapLP({
        token0Symbol: pos.token0Symbol,
        token1Symbol: pos.token1Symbol,
        amount0: t0Stable ? String(pos.amountUSD) : undefined,
        amount1: !t0Stable && t1Stable ? String(pos.amountUSD) : undefined,
        feeTier: pos.feeTier || 3000,
        riskLevel: 'moderate',
      }, walletAddress);

      if ('error' in result) {
        prepared.push({ index: i, protocol: 'uniswap_v3', label: `${pos.token0Symbol}/${pos.token1Symbol}`, amountUSD: pos.amountUSD, status: 'error', error: result.error as string });
      } else {
        prepared.push({ index: i, protocol: 'uniswap_v3', label: `${pos.token0Symbol}/${pos.token1Symbol}`, amountUSD: pos.amountUSD, status: 'ready', lpData: result.lp });
      }
    } else if (pos.protocol === 'morpho') {
      if (!pos.vaultName) {
        prepared.push({ index: i, protocol: 'morpho', label: 'Unknown Vault', amountUSD: pos.amountUSD, status: 'error', error: 'Missing vault name' });
        continue;
      }

      const result = await executePrepareMorphoDeposit({
        vaultName: pos.vaultName,
        amount: String(pos.amountUSD),
      }, walletAddress);

      if ('error' in result) {
        prepared.push({ index: i, protocol: 'morpho', label: pos.vaultName, amountUSD: pos.amountUSD, status: 'error', error: result.error as string });
      } else {
        prepared.push({ index: i, protocol: 'morpho', label: pos.vaultName, amountUSD: pos.amountUSD, status: 'ready', morphoData: result.deposit });
      }
    } else {
      prepared.push({ index: i, protocol: pos.protocol, label: 'Unknown', amountUSD: pos.amountUSD, status: 'error', error: `Unsupported protocol: ${pos.protocol}` });
    }
  }

  const readyCount = prepared.filter((p) => p.status === 'ready').length;
  if (readyCount === 0) {
    return { error: `All ${positions.length} positions failed to prepare. ${prepared.map((p) => `${p.label}: ${p.error}`).join('; ')}` };
  }

  return {
    yieldPlan: {
      positions: prepared,
      totalUSD: prepared.filter((p) => p.status === 'ready').reduce((sum, p) => sum + p.amountUSD, 0),
      readyCount,
      totalCount: positions.length,
    },
  };
}

// ---------------------------------------------------------------------------
// execute_batch_yield — confirmed batch-yield execution signal for the frontend
// ---------------------------------------------------------------------------

export function executeExecuteBatchYield(args: Record<string, any>) {
  if (args.confirmed !== true) {
    return { error: 'Batch yield not confirmed. User must type yes or go to confirm.' };
  }
  return { yieldExecution: { confirmed: true } };
}
