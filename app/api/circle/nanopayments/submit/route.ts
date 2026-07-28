import { NextRequest, NextResponse } from 'next/server';
import { shouldUseNanopayments, verifyBatchPayment, settleBatchPayment } from '@/lib/circle/nanopayments';

/**
 * Submit a signed EIP-3009 authorization for batched settlement via Circle.
 */
export async function POST(req: NextRequest) {
  if (!shouldUseNanopayments()) {
    return NextResponse.json(
      { success: false, error: 'Circle Nanopayments not enabled' },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const { from, to, value, validAfter, validBefore, nonce, signature } = body;

    if (!from || !to || !value || !signature) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify the payment
    const paymentPayload = {
      x402Version: 1,
      payload: {
        authorization: { from, to, value, validAfter, validBefore, nonce },
        signature,
      },
    };

    const paymentRequirements = {
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: value,
      payTo: to,
      maxTimeoutSeconds: 3600,
    };

    const verifyResult = await verifyBatchPayment(paymentPayload, paymentRequirements);
    if (!verifyResult.isValid) {
      return NextResponse.json(
        { success: false, error: verifyResult.invalidReason || 'Payment verification failed' },
        { status: 400 }
      );
    }

    // Settle the payment
    const settleResult = await settleBatchPayment(paymentPayload, paymentRequirements);

    return NextResponse.json({
      success: settleResult.success,
      paymentId: settleResult.transaction || `nano_${Date.now()}`,
      error: settleResult.error,
    });
  } catch (error: any) {
    console.error('[Nanopayments] Submit error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Nanopayment submission failed' },
      { status: 500 }
    );
  }
}
