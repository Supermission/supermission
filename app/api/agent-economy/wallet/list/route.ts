import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/agent-economy/auth';
import { supabaseAdmin } from '@/lib/supabase/client';
import { parseAbi, type Address } from 'viem';
import { baseClient } from '@/lib/viem/clients';
import { USDC_ADDRESS } from '@/lib/agent-economy/constants';

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
]);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let owner = searchParams.get('owner');

    // Derive from auth context if not provided
    if (!owner) {
      const authResult = await authenticateRequest(request, 'read');
      if (authResult.success && authResult.context?.ownerAddress) {
        owner = authResult.context.ownerAddress;
      }
    }

    if (!owner) {
      return NextResponse.json(
        { success: false, error: 'Owner address is required (pass ?owner= or use auth header)' },
        { status: 400 }
      );
    }

    const { data: wallets, error } = await supabaseAdmin
      .from('server_wallets')
      .select('id, agent_name, account_address, daily_limit, spent_today, created_at')
      .eq('owner_address', owner.toLowerCase())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Wallet List] Database error:', error);
      return NextResponse.json({ success: true, wallets: [] });
    }

    if (!wallets || wallets.length === 0) {
      return NextResponse.json({ success: true, wallets: [] });
    }

    // Read on-chain USDC balance for all wallet addresses in parallel
    const balances = await Promise.all(
      wallets.map((w) =>
        baseClient.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [w.account_address as Address],
        }).catch(() => 0n)
      )
    );

    return NextResponse.json({
      success: true,
      wallets: wallets.map((w, i) => ({
        id: w.id,
        agentName: w.agent_name,
        accountAddress: w.account_address,
        balance: balances[i].toString(),
        dailyLimit: w.daily_limit || '0',
        spentToday: w.spent_today || '0',
        createdAt: w.created_at,
      })),
    });
  } catch (error) {
    console.error('[Wallet List] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
