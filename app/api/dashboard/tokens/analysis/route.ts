import { NextRequest, NextResponse } from 'next/server';
import { Address, isAddress } from 'viem';
import { analyzeToken } from '@/lib/minimax/analyzers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenAddress, chainId, tokenData } = body;

    if (!tokenAddress || !isAddress(tokenAddress)) {
      return NextResponse.json({ error: 'Valid token address required' }, { status: 400 });
    }

    if (!tokenData) {
      return NextResponse.json({ error: 'Token data required' }, { status: 400 });
    }

    // Run Minimax analysis
    const analysis = await analyzeToken(
      tokenAddress as Address,
      chainId || 8453,
      tokenData
    );

    return NextResponse.json({
      success: true,
      data: analysis,
      timestamp: Date.now()
    });

  } catch (error: any) {
    console.error('[Dashboard:TokenAnalysis] Error:', error);
    return NextResponse.json(
      { error: 'Token analysis failed', details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
