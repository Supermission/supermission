import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

/**
 * POST /api/track — Client-side event tracking endpoint.
 * Receives fire-and-forget events from the browser and persists them.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, ...data } = body;

    switch (event) {
      case 'trade_failure': {
        await supabaseAdmin.from('trade_failures').insert({
          user_address: data.userAddress?.toLowerCase() || '',
          side: data.side || 'BUY',
          condition_id: data.conditionId || null,
          token_id: data.tokenId || null,
          amount: data.amount || null,
          error_reason: data.errorReason || 'Unknown',
          error_step: data.errorStep || null,
          metadata: { timestamp: data.timestamp },
        });
        break;
      }

      case 'bridge_initiated': {
        await supabaseAdmin.from('bridge_transactions').insert({
          user_address: data.userAddress?.toLowerCase() || '',
          amount: data.amount || '0',
          source_chain: data.sourceChain || 'base',
          dest_chain: data.destChain || 'polygon',
          status: 'initiated',
        });
        break;
      }

      case 'bridge_tx_sent': {
        // Update existing or insert new
        const { data: existing } = await supabaseAdmin
          .from('bridge_transactions')
          .select('id')
          .eq('user_address', data.userAddress?.toLowerCase() || '')
          .eq('status', 'initiated')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          await supabaseAdmin.from('bridge_transactions')
            .update({
              tx_hash: data.txHash,
              deposit_address: data.depositAddress,
              status: 'tx_sent',
            })
            .eq('id', existing.id);
        } else {
          await supabaseAdmin.from('bridge_transactions').insert({
            user_address: data.userAddress?.toLowerCase() || '',
            amount: data.amount || '0',
            tx_hash: data.txHash,
            deposit_address: data.depositAddress,
            status: 'tx_sent',
          });
        }
        break;
      }

      case 'bridge_result': {
        const { data: recent } = await supabaseAdmin
          .from('bridge_transactions')
          .select('id')
          .eq('user_address', data.userAddress?.toLowerCase() || '')
          .in('status', ['initiated', 'tx_sent'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recent) {
          await supabaseAdmin.from('bridge_transactions')
            .update({
              status: data.status,
              error_message: data.errorMessage || null,
              tx_hash: data.txHash || undefined,
            })
            .eq('id', recent.id);
        }
        break;
      }

      default:
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Never fail — tracking should not break the app
    console.error('[/api/track] Error:', err);
    return NextResponse.json({ ok: true });
  }
}
