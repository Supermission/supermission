import { NextRequest, NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/robinhood/store';
import { RobinhoodMcpClient, mcpResultToText } from '@/lib/robinhood/mcp-client';

/**
 * POST /api/robinhood/order
 * Places a REAL equity order via the Robinhood MCP. Called by the inline
 * confirmation card only after the user confirms in chat — never by the model
 * directly. Body: the order envelope from prepare_equity_order.
 */
export async function POST(request: NextRequest) {
  const owner = request.headers.get('x-verified-wallet')?.split(',')[0]?.toLowerCase();
  if (!owner) return NextResponse.json({ error: 'Wallet not connected' }, { status: 401 });

  let order: any;
  try {
    order = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!order?.symbol || !order?.side || !order?.order_type) {
    return NextResponse.json({ error: 'Malformed order' }, { status: 400 });
  }

  const token = await getValidAccessToken(owner);
  if (!token) return NextResponse.json({ error: 'not_connected' }, { status: 401 });

  const args: Record<string, any> = {
    symbol: String(order.symbol).toUpperCase(),
    side: order.side,
    order_type: order.order_type,
  };
  if (order.quantity != null) args.quantity = order.quantity;
  if (order.amount_dollars != null) args.amount_dollars = order.amount_dollars;
  if (order.limit_price != null) args.limit_price = order.limit_price;
  if (order.time_in_force) args.time_in_force = order.time_in_force;

  try {
    const client = new RobinhoodMcpClient(token);
    const res = await client.callTool('place_equity_order', args);
    return NextResponse.json({ ok: !res.isError, result: mcpResultToText(res) });
  } catch (err: any) {
    if (err?.code === 'unauthorized') return NextResponse.json({ error: 'not_connected' }, { status: 401 });
    console.error('[robinhood/order]', err?.message);
    return NextResponse.json({ error: err?.message || 'Order failed' }, { status: 500 });
  }
}
