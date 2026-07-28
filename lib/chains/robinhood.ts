import { defineChain } from 'viem';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

/**
 * Robinhood Chain — Arbitrum Nitro L2 (EVM-compatible), native gas token ETH.
 * Docs: https://docs.robinhoodchain.com  ·  Explorer: robinhoodchain.blockscout.com
 *
 * Custom viem chain definition (not shipped in `viem/chains`). Used by the wagmi
 * config, the shared viem public clients, and the GOAT chain map.
 */
export const ROBINHOOD_CHAIN_ID = 4663;

export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [httpRpcUrl('robinhood')],
    },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
  contracts: {
    // Canonical Multicall3 (0xcA11…CA11) — deployed at the standard deterministic
    // address on Robinhood Chain and verified to answer aggregate3. The previous
    // 0x2cAC2D…DaD1 address here is a DIFFERENT contract whose aggregate3 reverts,
    // which made every batched viem read (balances, quotes) fail and silently drop
    // Robinhood from the dashboard/agents.
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
});

/**
 * Robinhood Chain token addresses. USDG (Paxos Global Dollar) is the chain's
 * stablecoin — the settlement/quote asset here, analogous to how USDC.e is used
 * on Polygon. WETH is the canonical wrapped-ETH gateway token.
 */
export const ROBINHOOD_USDG_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
export const ROBINHOOD_WETH_ADDRESS = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
