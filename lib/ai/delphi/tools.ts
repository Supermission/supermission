/**
 * DELPHI tool definitions + dispatcher — barrel re-export.
 *
 * The original 3958-line monolith was split into `./tools/*` by domain:
 *   - definitions.ts : DELPHI_TOOLS array (OpenAI function-calling schema)
 *   - dispatch.ts    : executeTool switch
 *   - shared.ts      : helpers, constants, token registries
 *   - pricing.ts     : prices, TWAP, trending, smart money, large swaps
 *   - tokens.ts      : token analysis, research, lists, Nansen, safety
 *   - wallet.ts      : wallet intel, portfolio, balances, history, gas
 *   - swaps.ts       : swap quote/prepare, compare routes, transfer
 *   - yields.ts      : yield scan, Morpho, DeFi deposits, strategy
 *   - lp.ts          : Uniswap V3 LP prepare/execute/analytics
 *   - batch.ts       : batch buy, batch yield allocation
 *
 * Consumers keep importing { DELPHI_TOOLS, executeTool } from this module.
 */

export type { ToolDefinition, ToolResult } from '../shared/types';
export { DELPHI_TOOLS } from './tools/definitions';
export { executeTool } from './tools/dispatch';
