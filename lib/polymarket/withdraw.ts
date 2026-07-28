/**
 * Native Polymarket proxy withdrawal.
 *
 * Funds deposited via polymarket.com (Magic/email login) sit in the user's
 * Polymarket proxy wallet, not their EOA. The proxy is executed through the
 * ProxyWalletFactory's `proxy(ProxyCall[])`: called DIRECTLY by the owner EOA,
 * `_msgSender()` resolves to msg.sender (the EOA), so the factory runs the calls
 * from that EOA's proxy wallet. One signed tx (gas-sponsorable), no GSN relayer.
 *
 * Contracts (Polymarket/proxy-factories): factory 0xaB45…254052.
 *   enum CallType { INVALID, CALL, DELEGATECALL }  // CALL = 1
 *   struct ProxyCall { CallType typeCode; address to; uint256 value; bytes data; }
 *   function proxy(ProxyCall[] calls) payable returns (bytes[])
 */

import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';
import { POLY_PROXY_FACTORY } from './proxy';
import { POLYGON_PUSD, POLYGON_USDC } from './trade-utils';

export const PROXY_WALLET_FACTORY_ABI = [
  {
    name: 'proxy',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'typeCode', type: 'uint8' }, // CallType enum; 1 = CALL
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'returnValues', type: 'bytes[]' }],
  },
] as const;

const CALL_TYPE_CALL = 1;

export interface WithdrawToken {
  address: Address;
  /** Raw 6-decimal amount (bigint). */
  amount: bigint;
}

/**
 * Build the tx that withdraws the given proxy-held tokens to `destination`
 * (the owner EOA). Batches multiple tokens (e.g. USDC.e + pUSD) into one
 * proxy() call. Returns { to: factory, data } — send from the owner EOA on
 * Polygon (chainId 137).
 */
export function buildPolymarketProxyWithdraw(
  destination: Address,
  tokens: WithdrawToken[],
): { to: Address; data: Hex } {
  const calls = tokens
    .filter((t) => t.amount > 0n)
    .map((t) => ({
      typeCode: CALL_TYPE_CALL,
      to: t.address,
      value: 0n,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [destination, t.amount] }),
    }));

  const data = encodeFunctionData({
    abi: PROXY_WALLET_FACTORY_ABI,
    functionName: 'proxy',
    args: [calls],
  });
  return { to: POLY_PROXY_FACTORY, data };
}

/** The two Polymarket-relevant stablecoins on Polygon that a proxy may hold. */
export const POLYMARKET_WITHDRAW_TOKENS = {
  USDCe: POLYGON_USDC as Address,
  pUSD: POLYGON_PUSD as Address,
} as const;
