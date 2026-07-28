import { NextRequest, NextResponse } from 'next/server';
import { verifyMandate } from '@/lib/agent-economy/ap2/verify-mandate';
import { MandateType } from '@/lib/agent-economy/ap2/types';
import { Address } from 'viem';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mandateId, mandateType, signature, transactionAmount, merchantAddress } = body;

    if (!mandateId || !mandateType) {
      return NextResponse.json(
        { success: false, error: 'mandateId and mandateType are required' },
        { status: 400 }
      );
    }

    const result = await verifyMandate({
      mandateId,
      mandateType: mandateType as MandateType,
      signature,
      transactionAmount,
      merchantAddress: merchantAddress as Address | undefined,
    });

    return NextResponse.json({
      success: true,
      verification: result,
    });
  } catch (error) {
    console.error('[Mandate Verify] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
