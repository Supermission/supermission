import { NextRequest, NextResponse } from 'next/server';
import { getWalletPolicy, updateWalletPolicy, getWalletByAddress } from '@/lib/agent-economy/wallet/create';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth';
import { Address } from 'viem';

export async function GET(request: NextRequest) {
  try {
    let walletId = request.nextUrl.searchParams.get('walletId');

    // If no walletId in query, infer from auth context using the owner's wallet address
    if (!walletId) {
      const authResult = await authenticateRequest(request, 'read');
      if (authResult.success && authResult.context?.ownerAddress) {
        const wallet = await getWalletByAddress(authResult.context.ownerAddress as Address);
        if (wallet) walletId = wallet.agentName;
      }
    }

    if (!walletId) {
      return NextResponse.json(
        { success: false, error: 'walletId is required. Pass ?walletId=agentName or use an agent API key.' },
        { status: 400 }
      );
    }

    const policy = await getWalletPolicy(walletId);

    if (!policy) {
      return NextResponse.json(
        { success: false, error: 'Policy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      policy: {
        id: policy.id,
        walletId: policy.walletId,
        dailySpendingLimit: policy.dailySpendingLimit.toString(),
        perTxLimit: policy.perTxLimit.toString(),
        allowedRecipients: policy.allowedRecipients,
        blockedRecipients: policy.blockedRecipients,
        allowedTokens: policy.allowedTokens,
        requireApprovalAbove: policy.requireApprovalAbove?.toString() || null,
        cooldownSeconds: policy.cooldownSeconds,
        updatedAt: policy.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[Wallet Policy GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Authenticate request - only authenticated users can update policy
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const { walletId, ...updates } = body;

    if (!walletId) {
      return NextResponse.json(
        { success: false, error: 'walletId is required' },
        { status: 400 }
      );
    }

    // Convert string amounts to bigint with validation
    const policyUpdates: Record<string, unknown> = {};
    const bigintFields = ['dailySpendingLimit', 'perTxLimit', 'requireApprovalAbove'] as const;
    for (const field of bigintFields) {
      if (updates[field] === undefined || updates[field] === null) continue;
      try {
        policyUpdates[field] = BigInt(updates[field]);
      } catch {
        return NextResponse.json(
          { success: false, error: `${field} must be a valid integer (atomic USDC units, e.g. "1000000" for $1)` },
          { status: 400 }
        );
      }
    }
    if (updates.allowedRecipients !== undefined) {
      policyUpdates.allowedRecipients = updates.allowedRecipients;
    }
    if (updates.blockedRecipients !== undefined) {
      policyUpdates.blockedRecipients = updates.blockedRecipients;
    }
    if (updates.allowedTokens !== undefined) {
      policyUpdates.allowedTokens = updates.allowedTokens;
    }
    if (updates.cooldownSeconds !== undefined) {
      policyUpdates.cooldownSeconds = updates.cooldownSeconds;
    }

    const result = await updateWalletPolicy(walletId, policyUpdates as any);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Wallet Policy PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
