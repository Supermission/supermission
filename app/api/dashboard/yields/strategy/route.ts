import { NextRequest, NextResponse } from 'next/server';
import { generateYieldStrategy } from '@/lib/minimax/analyzers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { portfolioData, yieldPools, riskTolerance } = body;

    if (!portfolioData) {
      return NextResponse.json({ error: 'Portfolio data required' }, { status: 400 });
    }

    // Validate risk tolerance
    const validRiskLevels = ['conservative', 'balanced', 'aggressive'];
    const risk = riskTolerance || 'balanced';
    if (!validRiskLevels.includes(risk)) {
      return NextResponse.json({ error: 'Invalid risk tolerance' }, { status: 400 });
    }

    // Generate strategy using Minimax
    const strategy = await generateYieldStrategy(
      portfolioData,
      yieldPools || [],
      risk as 'conservative' | 'balanced' | 'aggressive'
    );

    return NextResponse.json({
      success: true,
      data: strategy,
      timestamp: Date.now()
    });

  } catch (error: any) {
    console.error('[Dashboard:YieldStrategy] Error:', error);
    return NextResponse.json(
      { error: 'Strategy generation failed', details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
