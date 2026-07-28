/**
 * DELPHI tool dispatcher — single switch that routes a tool name to its
 * per-domain executor. Keeps the file layer thin so adding a new tool
 * is purely a matter of adding a case here and an executor in the
 * relevant domain file.
 */

import type { ToolResult } from '../../shared/types';
import {
  executeGetTokenPrice,
  executeGetTokenTwap,
  executeGetTrendingTokens,
  executeGetSmartMoneyMoves,
  executeGetTopTradedTokens,
  executeFindNewPools,
  executeGetRecentLargeSwaps,
  executeGetPoolFeeAnalytics,
  executeGetPriceChart,
} from './pricing';
import {
  executeAnalyzeToken,
  executeResearch,
  executeListTokens,
  executeListChains,
  executeNansenTokenAnalysis,
  executeSearchNansenToken,
  executeCheckTokenSafety,
  executeGetTokenHolders,
} from './tokens';
import {
  executeAnalyzeWallet,
  executeGetPortfolio,
  executeGetTokenBalance,
  executeGetWalletSwapHistory,
  executeTraceWalletFunding,
  executeGetWalletTxHistory,
  executeGetGasInfo,
} from './wallet';
import {
  executeGetSwapQuote,
  executePrepareSwap,
  executeCompareSwapRoutes,
  executePrepareTransfer,
} from './swaps';
import {
  executeScanYields,
  executeScanMorphoVaults,
  executeBrowsePools,
  executePrepareDefiDeposit,
  executeGenerateYieldStrategy,
  executePrepareMorphoDeposit,
} from './yields';
import {
  executePrepareUniswapLP,
  executeExecuteUniswapLP,
  executeGetLPPositions,
  executePrepareRemoveLiquidity,
  executeCollectLPFees,
  executeGetLPPositionAnalytics,
} from './lp';
import {
  executeBatchBuyTrending,
  executeExecuteBatchBuy,
  executeBatchAllocateYield,
  executeExecuteBatchYield,
} from './batch';

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  walletAddress: string | null
): Promise<ToolResult> {
  switch (name) {
    case 'analyze_token':
      return { name, result: await executeAnalyzeToken(args) };
    case 'get_swap_quote':
      return { name, result: await executeGetSwapQuote(args, walletAddress) };
    case 'get_token_price':
      return { name, result: await executeGetTokenPrice(args) };
    case 'scan_yields':
      return { name, result: await executeScanYields(args) };
    case 'analyze_wallet':
      return { name, result: await executeAnalyzeWallet(args, walletAddress) };
    case 'get_portfolio':
      return { name, result: await executeGetPortfolio(args, walletAddress) };
    case 'research_topic':
      return { name, result: await executeResearch(args) };
    case 'list_tokens':
      return { name, result: await executeListTokens(args) };
    case 'list_chains':
      return { name, result: executeListChains() };
    case 'scan_morpho_vaults':
      return { name, result: await executeScanMorphoVaults(args) };
    case 'prepare_morpho_deposit':
      return { name, result: await executePrepareMorphoDeposit(args, walletAddress) };
    case 'prepare_swap':
      return { name, result: await executePrepareSwap(args, walletAddress) };
    case 'get_token_balance':
      return { name, result: await executeGetTokenBalance(args, walletAddress) };
    case 'browse_pools':
      return { name, result: await executeBrowsePools(args) };
    case 'prepare_defi_deposit':
      return { name, result: await executePrepareDefiDeposit(args, walletAddress) };
    case 'generate_yield_strategy':
      return { name, result: await executeGenerateYieldStrategy(args) };
    case 'prepare_uniswap_lp':
      return { name, result: await executePrepareUniswapLP(args, walletAddress) };
    case 'execute_uniswap_lp':
      return { name, result: executeExecuteUniswapLP(args) };
    case 'get_lp_positions':
      return { name, result: await executeGetLPPositions(walletAddress) };
    case 'prepare_remove_liquidity':
      return { name, result: await executePrepareRemoveLiquidity(args, walletAddress) };
    case 'collect_lp_fees':
      return { name, result: await executeCollectLPFees(args, walletAddress) };
    case 'get_trending_tokens':
      return { name, result: await executeGetTrendingTokens(args) };
    case 'get_smart_money_moves':
      return { name, result: await executeGetSmartMoneyMoves(args) };
    case 'nansen_token_analysis':
      return { name, result: await executeNansenTokenAnalysis(args) };
    case 'search_nansen_token':
      return { name, result: await executeSearchNansenToken(args) };
    case 'prepare_transfer':
      return { name, result: await executePrepareTransfer(args, walletAddress) };
    case 'batch_buy_trending':
      return { name, result: await executeBatchBuyTrending(args, walletAddress) };
    case 'execute_batch_buy':
      return { name, result: await executeExecuteBatchBuy(args, walletAddress) };
    case 'batch_allocate_yield':
      return { name, result: await executeBatchAllocateYield(args, walletAddress) };
    case 'execute_batch_yield':
      return { name, result: executeExecuteBatchYield(args) };
    case 'get_token_twap':
      return { name, result: await executeGetTokenTwap(args) };
    case 'get_top_traded_tokens':
      return { name, result: await executeGetTopTradedTokens(args) };
    case 'get_wallet_swap_history':
      return { name, result: await executeGetWalletSwapHistory(args, walletAddress) };
    case 'find_new_pools':
      return { name, result: await executeFindNewPools(args) };
    case 'get_recent_large_swaps':
      return { name, result: await executeGetRecentLargeSwaps(args) };
    case 'get_pool_fee_analytics':
      return { name, result: await executeGetPoolFeeAnalytics(args) };
    case 'compare_swap_routes':
      return { name, result: await executeCompareSwapRoutes(args, walletAddress) };
    case 'get_lp_position_analytics':
      return { name, result: await executeGetLPPositionAnalytics(args, walletAddress) };
    case 'check_token_safety':
      return { name, result: await executeCheckTokenSafety(args) };
    case 'get_token_holders':
      return { name, result: await executeGetTokenHolders(args) };
    case 'trace_wallet_funding':
      return { name, result: await executeTraceWalletFunding(args) };
    case 'get_wallet_tx_history':
      return { name, result: await executeGetWalletTxHistory(args, walletAddress) };
    case 'get_gas_info':
      return { name, result: await executeGetGasInfo(args) };
    case 'get_price_chart':
      return { name, result: await executeGetPriceChart(args) };
    case 'request_clarification':
      return { name, result: { clarification: args } };
    case 'redirect_to_agent':
      return { name, result: { redirect: args } };
    default:
      return { name, result: { error: `Unknown tool: ${name}` } };
  }
}
