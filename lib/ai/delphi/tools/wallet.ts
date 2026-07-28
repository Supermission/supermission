/**
 * Wallet executors: full wallet intel, quick portfolio, token balance,
 * swap history, funding trace, tx history, gas/ETH price.
 */

import { orchestrateQuickAnalysis } from '@/lib/wallet-intelligence/orchestrator';
import { subgraphQuery } from '@/lib/uniswap/price-client';
import { byAddress } from '@/lib/tokens/registry';
import {
  decodeHexString,
  etherscanQuery,
  fetchTimeout,
  getBaseUrl,
  KNOWN_TOKEN_META,
  resolveSymbolFromAddress,
  RPC_URLS,
} from './shared';

// ---------------------------------------------------------------------------
// analyze_wallet — delegates to the wallet-intelligence endpoint
// ---------------------------------------------------------------------------

export async function executeAnalyzeWallet(args: Record<string, unknown>, connectedWallet: string | null) {
  const address = (args.walletAddress as string) || connectedWallet;
  if (!address) return { error: 'No wallet address provided and no wallet connected.' };

  const chains = args.chains as string[] | undefined;
  // Default to Base only for speed — all 3 chains takes too long for heavy wallets.
  // User can explicitly request ['base', 'polygon', 'ethereum'] if they want full analysis.
  const defaultChains = ['base'];

  try {
    const { signal, clear } = fetchTimeout(55_000);
    const res = await fetch(`${getBaseUrl()}/api/new-agents/wallet-intelligence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.INTERNAL_API_SECRET && { 'x-internal-secret': process.env.INTERNAL_API_SECRET }),
      },
      body: JSON.stringify({
        walletAddress: address,
        chains: chains || defaultChains,
        // Skip LLM profile generation — Delphi is its own LLM and interprets raw data directly.
        // This cuts ~10-15s from the response time.
        includeLLM: false,
      }),
      signal,
    });
    clear();

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { error: errData.error || `Wallet analysis failed: ${res.status}` };
    }
    return await res.json();
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      return { error: 'Wallet analysis timed out — this wallet may have extensive history. Try specifying a single chain (e.g. chains: ["base"]).' };
    }
    return { error: err.message || 'Wallet analysis failed' };
  }
}

// ---------------------------------------------------------------------------
// get_portfolio — quick native-balance snapshot via orchestrator
// ---------------------------------------------------------------------------

export async function executeGetPortfolio(args: Record<string, unknown>, connectedWallet: string | null) {
  const address = (args.walletAddress as string) || connectedWallet;
  if (!address) return { error: 'No wallet address provided and no wallet connected.' };

  const validChains = ['base', 'polygon', 'ethereum'] as const;
  type SupportedChain = typeof validChains[number];
  const rawChains = args.chains as string[] | undefined;
  const chains = rawChains?.filter((c): c is SupportedChain => (validChains as readonly string[]).includes(c));

  try {
    const result = await orchestrateQuickAnalysis(address, chains);
    return result;
  } catch (err: any) {
    return { error: err.message || 'Portfolio fetch failed' };
  }
}

// ---------------------------------------------------------------------------
// get_token_balance — direct on-chain balance check via JSON-RPC
// ---------------------------------------------------------------------------

export async function executeGetTokenBalance(args: Record<string, unknown>, walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'No wallet connected. Ask the user to connect their wallet.' };
  }

  const tokenAddress = args.tokenAddress as string;
  const chainId = (args.chainId as number) || 8453;

  if (!tokenAddress) return { error: 'Missing tokenAddress' };

  const rpcUrl = RPC_URLS[chainId];
  if (!rpcUrl) return { error: `Unsupported chain: ${chainId}` };

  try {
    const isNative =
      tokenAddress.toLowerCase() === 'native' ||
      tokenAddress === '0x0000000000000000000000000000000000000000';

    if (isNative) {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_getBalance',
          params: [walletAddress, 'latest'],
        }),
      });
      const data = await res.json();
      const balanceWei = BigInt(data.result || '0');
      const balanceFormatted = Number(balanceWei) / 1e18;
      const symbol = chainId === 137 ? 'MATIC' : 'ETH';
      return { token: symbol, address: 'native', chainId, decimals: 18, balance: balanceFormatted.toFixed(6), balanceRaw: balanceWei.toString() };
    }

    // ERC20: balanceOf call
    const paddedAddress = walletAddress.slice(2).toLowerCase().padStart(64, '0');
    const balanceOfData = '0x70a08231' + paddedAddress;

    // Prefer the hardcoded fast-path map, then fall back to the token registry
    // (SSOT) so chain-specific stables like USDG on Robinhood resolve without a
    // metadata round-trip.
    const registryToken = byAddress(tokenAddress, chainId);
    const known = KNOWN_TOKEN_META[tokenAddress.toLowerCase()]
      || (registryToken ? { symbol: registryToken.symbol, decimals: registryToken.decimals } : undefined);

    // If known token, just fetch balance
    if (known) {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: tokenAddress, data: balanceOfData }, 'latest'] }),
      });
      const result = await res.json();
      const balanceRaw = BigInt(result.result || '0');
      const balanceFormatted = Number(balanceRaw) / (10 ** known.decimals);
      return { token: known.symbol, address: tokenAddress, chainId, decimals: known.decimals, balance: balanceFormatted.toFixed(known.decimals > 6 ? 6 : known.decimals), balanceRaw: balanceRaw.toString() };
    }

    // Unknown token: fetch balance + decimals + symbol in parallel
    const [balRes, decRes, symRes] = await Promise.all([
      fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: tokenAddress, data: balanceOfData }, 'latest'] }) }),
      fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: tokenAddress, data: '0x313ce567' }, 'latest'] }) }),
      fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'eth_call', params: [{ to: tokenAddress, data: '0x95d89b41' }, 'latest'] }) }),
    ]);

    const [balData, decData, symData] = await Promise.all([balRes.json(), decRes.json(), symRes.json()]);

    const balanceRaw = BigInt(balData.result || '0');
    const decimals = parseInt(decData.result || '0x12', 16);

    let symbol = '???';
    try {
      const hex = (symData.result || '').slice(2);
      if (hex.length >= 128) {
        const len = parseInt(hex.slice(64, 128), 16);
        const strHex = hex.slice(128, 128 + len * 2);
        symbol = decodeHexString(strHex);
      }
    } catch { /* keep ??? */ }

    const balanceFormatted = Number(balanceRaw) / (10 ** decimals);
    return { token: symbol, address: tokenAddress, chainId, decimals, balance: balanceFormatted.toFixed(decimals > 6 ? 6 : decimals), balanceRaw: balanceRaw.toString() };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch token balance' };
  }
}

// ---------------------------------------------------------------------------
// get_wallet_swap_history — Supermission DB primary, Uniswap subgraph fallback
// ---------------------------------------------------------------------------

export async function executeGetWalletSwapHistory(args: Record<string, unknown>, walletAddress: string | null) {
  const wallet = (args.wallet as string) || walletAddress;
  if (!wallet) {
    return { error: 'No wallet address provided and no wallet connected.' };
  }

  const limit = Math.min(Math.max((args.limit as number) || 20, 1), 50);

  // Primary: query Supermission's own defi_activity table (ALL swaps made through the platform)
  try {
    const { supabaseAdmin } = await import('@/lib/supabase/client');
    const { data: activities, error } = await supabaseAdmin
      .from('defi_activity')
      .select('*')
      .eq('wallet_address', wallet.toLowerCase())
      .in('activity_type', ['swap', 'cross_chain_swap'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && activities && activities.length > 0) {
      const formatted = activities.map((a: any) => {
        const fromSym = resolveSymbolFromAddress(a.token_in) || (a.token_in?.slice(0, 8) + '...') || '?';
        const toSym = resolveSymbolFromAddress(a.token_out) || (a.token_out?.slice(0, 8) + '...') || '?';
        return {
          timestamp: a.created_at,
          pair: `${fromSym} → ${toSym}`,
          direction: 'SWAP',
          from: fromSym,
          to: toSym,
          amountIn: a.amount_in || '?',
          amountOut: a.amount_out || '?',
          sizeUSD: a.amount_usd ? `$${parseFloat(a.amount_usd).toFixed(2)}` : (a.amount_in ? `~$${parseFloat(a.amount_in).toFixed(2)}` : '?'),
          source: a.source || 'lifi',
          txHash: a.tx_hash || '',
          chainId: a.chain_id,
          status: a.status,
        };
      });

      return {
        swaps: formatted,
        count: formatted.length,
        wallet,
        source: 'supermission',
        message: `Found ${formatted.length} swap${formatted.length > 1 ? 's' : ''} on Supermission.`,
      };
    }
  } catch {
    // Platform query failed — fall back to Uniswap subgraph
  }

  // Fallback: Uniswap V3 subgraph for direct DEX swaps not made through Supermission
  try {
    const data = await subgraphQuery<{
      swaps: Array<{
        timestamp: string;
        amountUSD: string;
        amount0: string;
        amount1: string;
        pool: { token0: { symbol: string }; token1: { symbol: string }; feeTier: string };
        transaction: { id: string };
      }>;
    }>(
      8453,
      `{
        swaps(
          first: ${limit}
          orderBy: timestamp
          orderDirection: desc
          where: { origin: "${wallet.toLowerCase()}" }
        ) {
          timestamp
          amountUSD
          amount0
          amount1
          pool { token0 { symbol } token1 { symbol } feeTier }
          transaction { id }
        }
      }`
    );

    const swaps = data.swaps || [];
    if (swaps.length === 0) {
      return { swaps: [], message: `No swap history found for this wallet.` };
    }

    const formatted = swaps.map((s) => {
      const amount0 = parseFloat(s.amount0);
      const soldToken0 = amount0 < 0;
      const direction = soldToken0 ? 'SELL' : 'BUY';
      const fromSymbol = soldToken0 ? s.pool.token0.symbol : s.pool.token1.symbol;
      const toSymbol = soldToken0 ? s.pool.token1.symbol : s.pool.token0.symbol;
      const timestamp = parseInt(s.timestamp);
      const date = new Date(timestamp * 1000).toISOString();

      return {
        timestamp: date,
        pair: `${s.pool.token0.symbol}/${s.pool.token1.symbol}`,
        direction,
        action: `${direction} ${toSymbol} (sold ${fromSymbol})`,
        sizeUSD: `$${parseFloat(s.amountUSD).toFixed(2)}`,
        feeTier: `${parseInt(s.pool.feeTier) / 10000}%`,
        txHash: s.transaction.id,
      };
    });

    return { swaps: formatted, count: formatted.length, wallet, source: 'uniswap_subgraph' };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch swap history' };
  }
}

// ---------------------------------------------------------------------------
// trace_wallet_funding — Etherscan V2: funding source + first transactions
// ---------------------------------------------------------------------------

export async function executeTraceWalletFunding(args: Record<string, unknown>) {
  const address = args.address as string;
  const chainId = (args.chainId as number) || 8453;

  if (!address) return { error: 'Missing address' };

  try {
    // Try fundedby first, then fallback to first transactions
    let fundedBy: string | null = null;
    let fundingTx: string | null = null;
    let fundingAmount: string | null = null;

    try {
      const fundedResult = await etherscanQuery(chainId, 'account', 'fundedby', { address });
      if (fundedResult) {
        if (typeof fundedResult === 'string') {
          fundedBy = fundedResult;
        } else if (Array.isArray(fundedResult) && fundedResult.length > 0) {
          fundedBy = fundedResult[0].from || fundedResult[0].address || null;
          fundingTx = fundedResult[0].txHash || fundedResult[0].hash || null;
        } else if (typeof fundedResult === 'object') {
          fundedBy = fundedResult.from || fundedResult.address || null;
          fundingTx = fundedResult.txHash || fundedResult.hash || null;
        }
      }
    } catch {
      // fundedby action may not be available on all chains, fall through to txlist
    }

    // Get first 5 transactions as fallback or additional context
    let firstTxDate: string | null = null;
    let firstTxs: Array<{ hash: string; from: string; to: string; value: string; timestamp: string }> = [];

    try {
      const txResult = await etherscanQuery(chainId, 'account', 'txlist', {
        address,
        sort: 'asc',
        page: '1',
        offset: '5',
      });

      if (Array.isArray(txResult) && txResult.length > 0) {
        firstTxs = txResult.map((tx: any) => ({
          hash: tx.hash || '',
          from: tx.from || '',
          to: tx.to || '',
          value: tx.value ? (parseFloat(tx.value) / 1e18).toFixed(6) + ' ETH' : '0',
          timestamp: tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000).toISOString() : '',
        }));

        firstTxDate = firstTxs[0]?.timestamp || null;

        // If fundedby didn't work, use the first incoming transaction as funder
        if (!fundedBy) {
          const firstIncoming = txResult.find((tx: any) => tx.to?.toLowerCase() === address.toLowerCase() && tx.value !== '0');
          if (firstIncoming) {
            fundedBy = firstIncoming.from || null;
            fundingTx = firstIncoming.hash || null;
            fundingAmount = firstIncoming.value ? (parseFloat(firstIncoming.value) / 1e18).toFixed(6) + ' ETH' : null;
          }
        }
      }
    } catch {
      // txlist query failed
    }

    return {
      address,
      chainId,
      fundedBy,
      fundingTx,
      fundingAmount,
      firstTxDate,
      firstTransactions: firstTxs,
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to trace wallet funding' };
  }
}

// ---------------------------------------------------------------------------
// get_wallet_tx_history — Etherscan V2: full transaction list for a wallet
// ---------------------------------------------------------------------------

export async function executeGetWalletTxHistory(args: Record<string, unknown>, walletAddress: string | null) {
  const address = (args.address as string) || walletAddress;
  const chainId = (args.chainId as number) || 8453;
  const limit = Math.min(Math.max((args.limit as number) || 20, 1), 50);

  if (!address) return { error: 'No wallet address provided and no wallet connected.' };

  try {
    const txResult = await etherscanQuery(chainId, 'account', 'txlist', {
      address,
      sort: 'desc',
      page: '1',
      offset: String(limit),
    });

    if (!Array.isArray(txResult) || txResult.length === 0) {
      return { transactions: [], message: 'No transactions found for this wallet.' };
    }

    const transactions = txResult.map((tx: any) => ({
      hash: tx.hash || '',
      from: tx.from || '',
      to: tx.to || '',
      value: tx.value ? (parseFloat(tx.value) / 1e18).toFixed(6) + ' ETH' : '0',
      timestamp: tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000).toISOString() : '',
      functionName: tx.functionName || tx.input?.slice(0, 10) || '',
      status: tx.isError === '0' ? 'success' : 'fail',
      gasUsed: tx.gasUsed || '0',
    }));

    return {
      address,
      chainId,
      transactions,
      count: transactions.length,
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch transaction history' };
  }
}

// ---------------------------------------------------------------------------
// get_gas_info — Etherscan V2: gas price + ETH price
// ---------------------------------------------------------------------------

export async function executeGetGasInfo(args: Record<string, unknown>) {
  const chainId = (args.chainId as number) || 8453;

  try {
    // 2 parallel calls: gas price + ETH price
    const [gasResult, priceResult] = await Promise.allSettled([
      etherscanQuery(chainId, 'proxy', 'eth_gasPrice', {}),
      etherscanQuery(chainId, 'stats', 'ethprice', {}),
    ]);

    let gasPriceGwei = 0;
    if (gasResult.status === 'fulfilled' && gasResult.value) {
      const gasPriceWei = parseInt(gasResult.value, 16);
      gasPriceGwei = gasPriceWei / 1e9;
    }

    let ethPriceUSD = 0;
    if (priceResult.status === 'fulfilled' && priceResult.value) {
      ethPriceUSD = parseFloat(priceResult.value.ethusd || priceResult.value) || 0;
    }

    // Estimate swap cost: typical swap uses ~150K gas
    const typicalSwapGas = 150000;
    const estimatedSwapCostETH = (gasPriceGwei * typicalSwapGas) / 1e9;
    const estimatedSwapCostUSD = estimatedSwapCostETH * ethPriceUSD;

    return {
      chainId,
      gasPriceGwei: parseFloat(gasPriceGwei.toFixed(4)),
      ethPriceUSD: parseFloat(ethPriceUSD.toFixed(2)),
      estimatedSwapCostUSD: `$${estimatedSwapCostUSD.toFixed(4)}`,
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch gas info' };
  }
}
