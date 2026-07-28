import { NextResponse } from 'next/server';
import { getUSYCInfo, isUSYCEnabled } from '@/lib/circle/usyc';

export async function GET() {
  if (!isUSYCEnabled()) {
    return NextResponse.json({ enabled: false });
  }

  const info = await getUSYCInfo();
  return NextResponse.json({ enabled: true, ...info });
}
