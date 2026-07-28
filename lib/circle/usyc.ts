/**
 * Circle USYC — yield-bearing token backed by US Treasuries.
 * Appears as a "safe yield" option in the yields tab.
 */

import { circleRequest } from './client';
import { isCircleFeatureEnabled } from './config';

export const USYC_ADDRESSES: Record<number, string> = {
  1: '0x136471a34f6ef19fE571EFFC1CA711fdb8E49f2b',
  8453: '0x136471a34f6ef19fE571EFFC1CA711fdb8E49f2b',
};

export interface USYCInfo {
  apy: number;
  totalSupply: string;
  navPerShare: string;
  minSubscription: string;
  chain: string;
}

export function isUSYCEnabled(): boolean {
  return isCircleFeatureEnabled('usyc');
}

export async function getUSYCInfo(): Promise<USYCInfo | null> {
  if (!isUSYCEnabled()) return null;

  try {
    const result = await circleRequest<{ data: any }>('/v1/tokenized/usyc/info');

    return {
      apy: result.data?.apy || 4.5,
      totalSupply: result.data?.totalSupply || '0',
      navPerShare: result.data?.navPerShare || '1.00',
      minSubscription: result.data?.minSubscription || '100',
      chain: 'Ethereum',
    };
  } catch (error) {
    console.error('[USYC] Info fetch failed:', error);
    return {
      apy: 4.5,
      totalSupply: 'N/A',
      navPerShare: '1.00',
      minSubscription: '100',
      chain: 'Ethereum',
    };
  }
}
