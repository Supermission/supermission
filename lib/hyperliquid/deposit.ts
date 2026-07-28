import { encodeFunctionData } from 'viem';
import { fetchClearinghouseState } from './client';

// ─── Contract addresses ──────────────────────────────────────────────────────

/** Hyperliquid bridge contract on Arbitrum */
export const HL_BRIDGE_ADDRESS = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7' as const;

/** Native USDC on Arbitrum */
export const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;

/** Minimum deposit amount in USDC — Hyperliquid requires ≥5 USDC */
export const MIN_DEPOSIT_USDC = 6;

/** Minimum deposit from Ethereum (higher gas makes small deposits uneconomical) */
export const MIN_DEPOSIT_USDC_ETH = 10;

// ─── USDC addresses per chain (for bridging to Arbitrum) ─────────────────────

export const USDC_BY_CHAIN: Record<number, string> = {
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',   // Base
  137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',    // Polygon native USDC
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',      // Ethereum
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',   // Arbitrum
};

// Also accept Polygon bridged USDC.e
export const USDC_POLYGON_BRIDGED = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const;

// ─── ABIs ────────────────────────────────────────────────────────────────────

const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

const DEPOSIT_USD_ABI = [
  {
    name: 'depositUsd',
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint64' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ─── Encode helpers ──────────────────────────────────────────────────────────

/**
 * Encode an ERC-20 approve call for USDC on Arbitrum to the HL bridge.
 * @param amount – human-readable USDC amount (e.g. 14.41)
 */
export function encodeApproveUsdc(amount: number): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [HL_BRIDGE_ADDRESS, BigInt(Math.floor(amount * 1e6))],
  });
}

/**
 * Encode a depositUsd call to the HL bridge contract.
 * @param amount – human-readable USDC amount (e.g. 14.41)
 */
export function encodeDepositUsd(amount: number): `0x${string}` {
  return encodeFunctionData({
    abi: DEPOSIT_USD_ABI,
    functionName: 'depositUsd',
    args: [BigInt(Math.floor(amount * 1e6))],
  });
}

// ─── Balance helpers ─────────────────────────────────────────────────────────

/**
 * Get the user's Hyperliquid account equity (USD value).
 * Returns 0 if the account has never deposited.
 */
export async function getHLBalance(address: string): Promise<number> {
  try {
    const state = await fetchClearinghouseState(address);
    return parseFloat(state.marginSummary.accountValue) || 0;
  } catch (err) {
    console.warn('[Hyperliquid] Failed to fetch HL balance for', address, ':', (err as Error).message ?? err);
    return 0;
  }
}

/**
 * Get the user's actual *withdrawable* HL balance — net of locked margin and
 * maintenance requirements. This is the field HL itself uses to gate withdraws,
 * and differs from {@link getHLBalance} (account equity) when positions are open.
 *
 * Returns `null` on fetch failure so callers can distinguish "transient error"
 * from "really zero" — important for the Move Funds UI, which would otherwise
 * tell users their balance is 0 during an HL API hiccup.
 */
export async function getHLWithdrawable(address: string): Promise<number | null> {
  try {
    const state = await fetchClearinghouseState(address);
    const raw = (state as { withdrawable?: string }).withdrawable;
    if (raw == null) return null;
    const num = parseFloat(raw);
    return Number.isFinite(num) ? num : null;
  } catch (err) {
    console.warn('[Hyperliquid] Failed to fetch HL withdrawable for', address, ':', (err as Error).message ?? err);
    return null;
  }
}

/**
 * Poll for USDC arriving on Arbitrum after a bridge.
 * Resolves `true` once `balanceOf(address) >= minAmount` (in human USDC),
 * or `false` if it times out.
 */
export async function waitForArbUsdcBalance(
  address: string,
  minAmount: number,
  timeoutMs = 180_000,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient?: any,
): Promise<boolean> {
  const start = Date.now();
  const minRaw = BigInt(Math.floor(minAmount * 1e6));

  while (Date.now() - start < timeoutMs) {
    try {
      if (publicClient) {
        const balance = await publicClient.readContract({
          address: USDC_ARBITRUM,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        });
        if (balance >= minRaw) return true;
      }
    } catch {
      // ignore transient RPC errors
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return false;
}

// ─── Chain metadata ──────────────────────────────────────────────────────────

export interface ChainBalance {
  chainId: number;
  name: string;
  balance: number;
  usdcAddress: string;
}

export const CHAIN_NAMES: Record<number, string> = {
  8453: 'Base',
  137: 'Polygon',
  1: 'Ethereum',
  42161: 'Arbitrum',
};
