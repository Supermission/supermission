import { NextRequest, NextResponse } from 'next/server';
import { analyzeSentiment } from '@/lib/minimax/analyzers';

// Free endpoint - Minimax AI sentiment analysis
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, marketData } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Token symbol required' }, { status: 400 });
    }

    if (!marketData) {
      return NextResponse.json({ error: 'Market data required' }, { status: 400 });
    }

    // Run Minimax sentiment analysis
    const analysis = await analyzeSentiment(symbol, marketData);

    return NextResponse.json({
      success: true,
      data: analysis,
      timestamp: Date.now()
    });

  } catch (error: any) {
    console.error('[Dashboard:Sentiment] Error:', error);
    return NextResponse.json(
      { error: 'Sentiment analysis failed', details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
