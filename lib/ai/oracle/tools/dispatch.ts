/**
 * ORACLE tool dispatcher — single switch that routes a tool name to
 * its per-domain executor.
 */

import type { ToolResult } from '../../shared/types';
import { searchMarkets, getMarketDetails, checkResolution, getOrderbook } from './markets';
import { getMyPositions, getTradeHistory, getWatchlist } from './portfolio';
import { prepareTrade, prepareBatchTrade, prepareSell } from './trading';
import { getSignals, executeResearch, savePreference } from './signals';

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  walletAddress: string | null
): Promise<ToolResult> {
  switch (name) {
    case 'search_markets':
      return { name, result: await searchMarkets(args) };
    case 'get_my_positions':
      return { name, result: await getMyPositions(walletAddress) };
    case 'get_trade_history':
      return { name, result: await getTradeHistory(walletAddress, args) };
    case 'get_market_details':
      return { name, result: await getMarketDetails(args) };
    case 'check_resolution':
      return { name, result: await checkResolution(args) };
    case 'get_orderbook':
      return { name, result: await getOrderbook(args) };
    case 'get_watchlist':
      return { name, result: await getWatchlist(walletAddress) };
    case 'prepare_trade':
      return { name, result: await prepareTrade(args) };
    case 'prepare_batch_trade':
      return { name, result: await prepareBatchTrade(args) };
    case 'prepare_sell':
      return { name, result: await prepareSell(args, walletAddress) };
    case 'research_topic':
      return { name, result: await executeResearch(args) };
    case 'get_signals':
      return { name, result: await getSignals(args) };
    case 'save_preference':
      return { name, result: await savePreference(walletAddress, args) };
    case 'request_clarification':
      return { name, result: { clarification: args } };
    case 'redirect_to_agent':
      return { name, result: { redirect: args } };
    default:
      return { name, result: { error: `Unknown tool: ${name}` } };
  }
}
