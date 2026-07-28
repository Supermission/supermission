import { NextRequest, NextResponse } from 'next/server';
import { Address, isAddress } from 'viem';
import { analyzeWallet } from '@/lib/minimax/analyzers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, portfolioData } = body;

    if (!address || !isAddress(address)) {
      return NextResponse.json({ error: 'Valid wallet address required' }, { status: 400 });
    }

    if (!portfolioData) {
      return NextResponse.json({ error: 'Portfolio data required' }, { status: 400 });
    }

    // Run Minimax analysis
    const analysis = await analyzeWallet(address as Address, portfolioData);

    return NextResponse.json({
      success: true,
      data: analysis,
      timestamp: Date.now()
    });

  } catch (error: any) {
    console.error('[Dashboard:WalletAnalysis] Error:', error);
    return NextResponse.json(
      { error: 'Wallet analysis failed', details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
