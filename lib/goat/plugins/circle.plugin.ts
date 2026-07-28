/**
 * Circle GOAT Plugin — fallback tools when primary plugins are unavailable.
 * Provides: compliance check, bridge support check, USYC info.
 */

import { isCircleFeatureEnabled } from '@/lib/circle/config';
import { screenAddress, chainIdToCircleChain } from '@/lib/circle/compliance';
import { isCCTPSupported, chainIdToBridgeChain } from '@/lib/circle/bridge';
import { getUSYCInfo } from '@/lib/circle/usyc';

export function createCirclePlugin() {
  const tools: any[] = [];

  if (isCircleFeatureEnabled('compliance')) {
    tools.push({
      name: 'screen_address',
      description: 'Screen a blockchain address for compliance risk before transacting',
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'The blockchain address to screen' },
          chainId: { type: 'number', description: 'Chain ID (1=ETH, 8453=Base, 137=Polygon)' },
        },
        required: ['address'],
      },
      handler: async ({ address, chainId }: { address: string; chainId?: number }) => {
        const chain = chainIdToCircleChain(chainId || 8453);
        const result = await screenAddress(address, chain);
        return result || { safe: true, screened: false };
      },
    });
  }

  if (isCircleFeatureEnabled('bridge')) {
    tools.push({
      name: 'check_bridge_support',
      description: 'Check if CCTP bridging is supported between two chains',
      parameters: {
        type: 'object',
        properties: {
          sourceChainId: { type: 'number', description: 'Source chain ID' },
          destChainId: { type: 'number', description: 'Destination chain ID' },
        },
        required: ['sourceChainId', 'destChainId'],
      },
      handler: async (params: { sourceChainId: number; destChainId: number }) => {
        return {
          supported: isCCTPSupported(params.sourceChainId, params.destChainId),
          sourceChain: chainIdToBridgeChain(params.sourceChainId),
          destChain: chainIdToBridgeChain(params.destChainId),
        };
      },
    });
  }

  if (isCircleFeatureEnabled('usyc')) {
    tools.push({
      name: 'get_usyc_yield',
      description: 'Get current USYC Treasury yield information',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        return getUSYCInfo();
      },
    });
  }

  return {
    name: 'circle',
    description: 'Circle platform tools — compliance, bridging, yield',
    tools,
  };
}
