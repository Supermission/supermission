import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifyPrivyToken } from '@/lib/privy/server';

const VALID_ACTIVITY_TYPES = ['swap', 'lp_add', 'lp_remove', 'hook_deploy', 'pool_create', 'cross_chain_swap'] as const;
const VALID_STATUSES = ['pending', 'confirmed', 'failed'] as const;

function isAddressLike(x: unknown): x is string {
  return typeof x === 'string' && /^0x[a-fA-F0-9]{40}$/.test(x);
}

/**
 * POST /api/defi/activity - Record a DeFi activity
 */
export async function POST(req: NextRequest) {
  try {
    // Verify the caller owns the wallet they're recording activity for
    const token = req.cookies.get('privy-token')?.value;
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
    }
    const { walletAddresses } = await verifyPrivyToken(token);

    const body = await req.json();

    if (!isAddressLike(body.wallet_address)) {
      return NextResponse.json({ ok: false, error: 'Invalid wallet_address' }, { status: 400 });
    }

    if (!walletAddresses.includes(body.wallet_address.toLowerCase())) {
      return NextResponse.json({ ok: false, error: 'Wallet not owned by authenticated user' }, { status: 403 });
    }
    if (!VALID_ACTIVITY_TYPES.includes(body.activity_type)) {
      return NextResponse.json({ ok: false, error: 'Invalid activity_type' }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ ok: false, error: 'Invalid status' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('defi_activity')
      .insert({
        wallet_address: body.wallet_address.toLowerCase(),
        activity_type: body.activity_type,
        chain_id: Number(body.chain_id),
        tx_hash: body.tx_hash || null,
        status: body.status,
        token_in: body.token_in || null,
        token_out: body.token_out || null,
        amount_in: body.amount_in || null,
        amount_out: body.amount_out || null,
        price_impact: body.price_impact ?? null,
        slippage_bps: body.slippage_bps ?? null,
        amount_usd: body.amount_usd ?? null,
        fee_paid_usd: body.fee_paid_usd ?? null,
        source: body.source || 'uniswap',
        route: body.route || null,
        metadata: body.metadata || null,
      });

    if (error) {
      console.error('[DeFi Activity] Insert error:', error);
      return NextResponse.json({ ok: false, error: 'Failed to record activity' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[DeFi Activity] Unexpected error:', e);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

/**
 * GET /api/defi/activity?wallet=0x...&limit=20&offset=0
 */
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get('wallet');
    if (!isAddressLike(wallet)) {
      return NextResponse.json({ ok: false, error: 'wallet param required' }, { status: 400 });
    }

    const limit = Math.min(100, Number(req.nextUrl.searchParams.get('limit') || 20));
    const offset = Number(req.nextUrl.searchParams.get('offset') || 0);

    const { data, error, count } = await supabaseAdmin
      .from('defi_activity')
      .select('*', { count: 'exact' })
      .eq('wallet_address', wallet.toLowerCase())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[DeFi Activity] Query error:', error);
      return NextResponse.json({ ok: false, error: 'Failed to fetch activity' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      activities: data || [],
      total: count || 0,
      limit,
      offset,
    }, {
      headers: { 'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (e) {
    console.error('[DeFi Activity] Unexpected error:', e);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
