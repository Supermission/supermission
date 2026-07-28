import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { supabaseAdmin } from '@/lib/supabase/client';
import { parseAbi, type Address } from 'viem';
import { baseClient } from '@/lib/viem/clients';
import { USDC_ADDRESS } from '@/lib/agent-economy/constants';

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
]);

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'read');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult, authResult.context?.requestId);
    }

    const context = authResult.context!;
    const walletAddress = context.ownerAddress as Address;

    // Read actual on-chain USDC balance
    const onChainBalance = await baseClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [walletAddress],
    });

    // Still pull daily limit / spending tracker from DB (policy fields, not balance)
    const { data: wallet } = await supabaseAdmin
      .from('server_wallets')
      .select('daily_limit, spent_today')
      .eq('owner_address', walletAddress.toLowerCase())
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      balance: onChainBalance.toString(),
      dailyLimit: wallet?.daily_limit || '0',
      spentToday: wallet?.spent_today || '0',
    });
  } catch (error) {
    console.error('[Wallet Balance] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
