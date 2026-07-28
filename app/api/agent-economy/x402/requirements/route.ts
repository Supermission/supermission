import { NextRequest, NextResponse } from 'next/server';
import {
  createPaymentRequirements,
  storePaymentRequirements,
  createPaymentRequiredMessage,
} from '@/lib/agent-economy/x402/payment-required';
import { Address } from 'viem';

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing JSON body' },
        { status: 400 }
      );
    }
    const { payTo, amount, description, resource, expiresInSeconds, asset, network } = body;

    if (!payTo || !amount) {
      return NextResponse.json(
        { success: false, error: 'payTo and amount are required' },
        { status: 400 }
      );
    }

    // Validate amount is a positive integer in atomic units
    if (!/^\d+$/.test(String(amount))) {
      return NextResponse.json(
        { success: false, error: 'Amount must be a positive integer in atomic units (no decimals or scientific notation)' },
        { status: 400 }
      );
    }
    if (BigInt(amount) <= 0n) {
      return NextResponse.json(
        { success: false, error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }

    // Validate payTo is a valid address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
      return NextResponse.json(
        { success: false, error: 'payTo must be a valid Ethereum address' },
        { status: 400 }
      );
    }

    const requirements = createPaymentRequirements({
      payTo: payTo as Address,
      amount: String(amount),
      description,
      resource,
      expiresInSeconds,
      asset: asset as Address | undefined,
      network,
    });

    // Store and get payment ID
    const paymentId = await storePaymentRequirements(requirements);

    // Create x402 message format
    const message = createPaymentRequiredMessage(requirements);

    return NextResponse.json({
      success: true,
      paymentId,
      requirements,
      message,
    });
  } catch (error) {
    console.error('[x402 Requirements] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
