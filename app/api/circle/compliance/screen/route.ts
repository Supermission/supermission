import { NextRequest, NextResponse } from 'next/server';
import { screenAddress, chainIdToCircleChain } from '@/lib/circle/compliance';

export async function POST(req: NextRequest) {
  try {
    const { address, chainId } = await req.json();

    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    const chain = chainIdToCircleChain(chainId || 8453);
    const result = await screenAddress(address, chain);

    if (!result) {
      return NextResponse.json({ screened: false, safe: true });
    }

    return NextResponse.json({
      screened: true,
      safe: !result.isBlocked && result.riskLevel !== 'HIGH',
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Screening failed', safe: true, screened: false },
      { status: 500 }
    );
  }
}
