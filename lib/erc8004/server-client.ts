/**
 * Server-side ERC-8004 Client
 * Uses Privy server wallet (via relayer) for gas-sponsored agent registration.
 */

import { type Address } from 'viem';
import { OfficialERC8004Client } from './official-client';
import { baseClient } from '@/lib/viem/clients';
import { getRelayerAddress } from '@/lib/server-wallets/relayer';

/**
 * Get server-side ERC-8004 read-only client (no wallet needed for reads).
 * For write operations, use relayContractCall from lib/server-wallets/relayer.ts.
 */
export function getServerERC8004Client(): OfficialERC8004Client {
  return new OfficialERC8004Client(baseClient as any, null as any);
}

/**
 * Get relayer wallet address (Privy server wallet).
 */
export async function getDeployerAddress(): Promise<Address | null> {
  return getRelayerAddress();
}
