import { NextRequest, NextResponse } from 'next/server';
import { verifyPayment } from '@/lib/agent-economy/x402/verify-payment';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { payload, requirements } = body;

    if (!payload || !requirements) {
      return NextResponse.json(
        { success: false, error: 'payload and requirements are required' },
        { status: 400 }
      );
    }

    // Convert string values back to bigint for verification
    const normalizedPayload = {
      ...payload,
      payload: {
        ...payload.payload,
        authorization: {
          ...payload.payload.authorization,
          value: BigInt(payload.payload.authorization.value),
          validAfter: BigInt(payload.payload.authorization.validAfter),
          validBefore: BigInt(payload.payload.authorization.validBefore),
        },
      },
    };

    const result = await verifyPayment({
      payload: normalizedPayload,
      requirements,
    });

    return NextResponse.json({
      success: true,
      valid: result.valid,
      signerAddress: result.signerAddress,
      errors: result.errors,
    });
  } catch (error) {
    console.error('[x402 Verify] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
