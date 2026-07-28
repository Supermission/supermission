/**
 * ORACLE tool definitions + dispatcher — barrel re-export.
 *
 * The original 1673-line monolith was split into `./tools/*` by domain:
 *   - definitions.ts : ORACLE_TOOLS array (OpenAI function-calling schema)
 *   - dispatch.ts    : executeTool switch
 *   - shared.ts      : typed supabase handle
 *   - markets.ts     : search_markets, get_market_details (+ time/league helpers)
 *   - portfolio.ts   : get_my_positions, get_trade_history, get_watchlist
 *   - trading.ts     : prepare_trade, prepare_batch_trade, prepare_sell
 *   - signals.ts     : get_signals, research_topic, save_preference
 *
 * Consumers keep importing { ORACLE_TOOLS, executeTool } from this module.
 */

export type { ToolDefinition, ToolResult } from '../shared/types';
export { ORACLE_TOOLS } from './tools/definitions';
export { executeTool } from './tools/dispatch';
