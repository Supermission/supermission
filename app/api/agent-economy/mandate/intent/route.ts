import { NextRequest, NextResponse } from 'next/server';
import { createIntentMandate, saveIntentMandate } from '@/lib/agent-economy/ap2/intent-mandate';
import { Address } from 'viem';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userAddress,
      naturalLanguageDescription,
      merchants,
      skus,
      maxAmount,
      currency,
      userCartConfirmationRequired,
      requiresRefundability,
      expiresInSeconds,
      userSignature,
    } = body;

    if (!userAddress || !naturalLanguageDescription || !maxAmount) {
      return NextResponse.json(
        { success: false, error: 'userAddress, naturalLanguageDescription, and maxAmount are required' },
        { status: 400 }
      );
    }

    const { mandate, typedData } = await createIntentMandate({
      userAddress: userAddress as Address,
      naturalLanguageDescription,
      merchants: merchants as Address[] | undefined,
      skus,
      maxAmount,
      currency,
      userCartConfirmationRequired,
      requiresRefundability,
      expiresInSeconds,
    });

    // If signature provided, save immediately
    if (userSignature) {
      const saveResult = await saveIntentMandate(mandate, userSignature);
      if (!saveResult.success) {
        return NextResponse.json(
          { success: false, error: saveResult.error },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        mandateId: mandate.id,
        mandate: {
          ...mandate,
          maxAmount: mandate.maxAmount.toString(),
          userSignature,
        },
      });
    }

    // Return typed data for signing
    return NextResponse.json({
      success: true,
      mandate: {
        ...mandate,
        maxAmount: mandate.maxAmount.toString(),
      },
      typedData: {
        ...typedData,
        message: {
          ...typedData.message,
          maxAmount: typedData.message.maxAmount.toString(),
          expiry: typedData.message.expiry.toString(),
        },
      },
    });
  } catch (error) {
    console.error('[Intent Mandate] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
