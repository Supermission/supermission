import type { ToolResult } from '../../shared/types';
import { getValidAccessToken } from '@/lib/robinhood/store';
import { RobinhoodMcpClient, mcpResultToText } from '@/lib/robinhood/mcp-client';
import { RORO_MCP_READ_TOOLS } from './definitions';

const NOT_CONNECTED = {
  error: 'not_connected',
  message: 'This account is not connected to Robinhood yet. Tell the user to connect their Robinhood account first (the Connect Robinhood button), then retry.',
};

/**
 * Execute a RORO tool. Read tools bridge straight to the Robinhood MCP.
 * `prepare_equity_order` runs a pre-trade REVIEW via the MCP and returns an
 * envelope the inline card confirms + executes — it does NOT place the order.
 */
export async function executeTool(
  name: string,
  args: Record<string, any>,
  walletAddress?: string | null,
): Promise<ToolResult> {
  // Meta tool — no Robinhood needed.
  if (name === 'request_clarification') {
    return { name, result: { clarification: { question: args.question, options: args.options || [] } } };
  }

  const owner = (walletAddress || '').toLowerCase();
  if (!owner) return { name, result: NOT_CONNECTED };

  let token: string | null;
  try {
    token = await getValidAccessToken(owner);
  } catch (err: any) {
    return { name, result: { error: 'connection_error', message: err?.message || 'Could not read Robinhood connection.' } };
  }
  if (!token) return { name, result: NOT_CONNECTED };

  const client = new RobinhoodMcpClient(token);

  try {
    // Read-only bridge — MCP tool name matches ours.
    if (RORO_MCP_READ_TOOLS.has(name)) {
      const res = await client.callTool(name, args);
      return { name, result: { text: mcpResultToText(res), isError: !!res.isError } };
    }

    // Gated equity order: REVIEW only, return envelope for the inline confirm card.
    if (name === 'prepare_equity_order') {
      const orderArgs: Record<string, any> = {
        symbol: String(args.symbol || '').toUpperCase(),
        side: args.side,
        order_type: args.order_type,
      };
      if (args.quantity != null) orderArgs.quantity = args.quantity;
      if (args.amount_dollars != null) orderArgs.amount_dollars = args.amount_dollars;
      if (args.limit_price != null) orderArgs.limit_price = args.limit_price;
      if (args.time_in_force) orderArgs.time_in_force = args.time_in_force;

      let reviewText = '';
      let reviewError = false;
      try {
        const review = await client.callTool('review_equity_order', orderArgs);
        reviewText = mcpResultToText(review);
        reviewError = !!review.isError;
      } catch (err: any) {
        reviewText = err?.message || 'Review failed';
        reviewError = true;
      }

      return {
        name,
        result: {
          order: {
            kind: 'equity',
            ...orderArgs,
            review: reviewText,
            reviewError,
          },
        },
      };
    }

    return { name, result: { error: `Unknown tool: ${name}` } };
  } catch (err: any) {
    if (err?.code === 'unauthorized') return { name, result: NOT_CONNECTED };
    return { name, result: { error: 'robinhood_error', message: err?.message || 'Robinhood request failed.' } };
  }
}
