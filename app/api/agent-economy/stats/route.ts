import { NextResponse } from 'next/server';
import { getPlatformStats } from '@/lib/agent-economy/stats';

export const revalidate = 60;

export async function GET() {
  const stats = await getPlatformStats();
  return NextResponse.json(
    { success: true, stats },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
