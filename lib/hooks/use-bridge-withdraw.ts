'use client';

import { useCallback, useState } from 'react';
import { useWallets, useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth';
import { createPublicClient, http, erc20Abi, encodeFunctionData, type Address } from 'viem';
import { polygon } from 'viem/chains';
import { deriveMagicProxyAddress } from '@/lib/polymarket/proxy';
import { POLYGON_PUSD, POLYGON_RPC } from '@/lib/polymarket/trade-utils';
import { buildPolymarketProxyWithdraw } from '@/lib/polymarket/withdraw';

/**
 * Polymarket Bridge withdrawal — the PRIMARY off-ramp for Polymarket funds.
 *
 * Flow (docs.polymarket.com/trading/bridge/withdraw):
 *   1. (optional) POST /api/trade/bridge/quote → estimated received + fees.
 *   2. POST /api/trade/bridge/withdraw → a per-chain bridge deposit address.
 *   3. Send pUSD from the user's Polymarket wallet to that bridge address.
 *      Polymarket's Collateral Offramp unwraps pUSD → USDC and delivers it on
 *      the destination chain to `recipientAddr`.
 *
 * The pUSD send is one gasless (sponsored) Polygon tx. Funds deposited via the
 * Polymarket frontend sit in the user's Magic proxy wallet, so we send through
 * ProxyWalletFactory.proxy() (the EOA calls the factory, which runs the ERC-20
 * transfer from the proxy). If the pUSD sits on the EOA instead, we send a plain
 * transfer. Prioritizes pUSD in both the balance read and the amount sent.
 */

/** Stage lets the caller decide whether a fallback (legacy proxy sweep) is safe. */
export type BridgeWithdrawStage = 'api' | 'balance' | 'send' | 'unsupported';

export class BridgeWithdrawError extends Error {
  stage: BridgeWithdrawStage;
  constructor(stage: BridgeWithdrawStage, message: string) {
    super(message);
    this.name = 'BridgeWithdrawError';
    this.stage = stage;
  }
}

export interface BridgeQuote {
  /** Estimated USD delivered to the recipient after fees. */
  estOutputUsd: number;
  /** Estimated destination-token amount, in that token's base units (string). */
  estToTokenBaseUnit: string;
  /** Total fee/slippage impact in USD (0 when the API reports none). */
  totalImpactUsd: number;
  /** Minimum guaranteed received (destination token units). */
  minReceived: number;
  /** Estimated time to completion, ms. */
  estCheckoutTimeMs: number;
  /** Opaque quote id echoed by Polymarket. */
  quoteId: string;
}

export interface BridgeWithdrawParams {
  /** The user's owner EOA — recipient on the destination chain. */
  eoa: string;
  /** Amount of pUSD to bridge, in whole dollars. */
  amountUsd: number;
  /** Destination chain id (137 Polygon, 8453 Base, 42161 Arbitrum). */
  toChainId: number;
  /** Destination token address (USDC on the destination chain). */
  toTokenAddress: string;
}

type Status = 'idle' | 'quoting' | 'requesting' | 'signing' | 'confirming' | 'done' | 'error';

const PUSD = POLYGON_PUSD as Address;

/**
 * Polymarket bridge minimum checkout — verified live against
 * bridge.polymarket.com/supported-assets on 2026-07-22 ($2 for USDC on
 * Polygon/Base/Arbitrum). Below this the bridge rejects the withdrawal, so we
 * stop early with a clear message rather than letting the on-chain send fail.
 */
const MIN_BRIDGE_USD = 2;

/** dollars → 6-decimal base units (pUSD/USDC decimals). */
function toBaseUnits(usd: number): bigint {
  return BigInt(Math.round(usd * 1e6));
}

/**
 * Resolve which wallet actually holds the user's pUSD — the Magic proxy or the
 * EOA — and how much. Prefers whichever holds MORE pUSD (the proxy is the usual
 * Polymarket-frontend case). Never throws; returns zeros on RPC failure.
 */
async function resolvePusdSource(eoa: Address): Promise<{
  source: Address;
  isProxy: boolean;
  balance: bigint;
  proxy: Address;
}> {
  const pub = createPublicClient({ chain: polygon, transport: http(POLYGON_RPC) });
  const proxy = deriveMagicProxyAddress(eoa);
  const [proxyBal, eoaBal] = await Promise.all([
    pub
      .readContract({ address: PUSD, abi: erc20Abi, functionName: 'balanceOf', args: [proxy] })
      .catch(() => 0n) as Promise<bigint>,
    pub
      .readContract({ address: PUSD, abi: erc20Abi, functionName: 'balanceOf', args: [eoa] })
      .catch(() => 0n) as Promise<bigint>,
  ]);
  if (proxyBal >= eoaBal) return { source: proxy, isProxy: true, balance: proxyBal, proxy };
  return { source: eoa, isProxy: false, balance: eoaBal, proxy };
}

export function useBridgeWithdraw() {
  const { wallets } = useWallets();
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();
  const [status, setStatus] = useState<Status>('idle');

  /**
   * Preview the bridge withdrawal. Returns null if the bridge API is
   * unavailable or the pair is unsupported — quotes are best-effort UI sugar,
   * so callers should treat null as "no estimate", not a hard failure.
   */
  const getQuote = useCallback(
    async ({ eoa, amountUsd, toChainId, toTokenAddress }: BridgeWithdrawParams): Promise<BridgeQuote | null> => {
      const amountRaw = toBaseUnits(amountUsd);
      if (amountRaw <= 0n) return null;
      setStatus('quoting');
      try {
        const res = await fetch('/api/trade/bridge/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromAmountBaseUnit: amountRaw.toString(),
            fromChainId: 137,
            fromTokenAddress: PUSD,
            recipientAddress: eoa,
            toChainId,
            toTokenAddress,
          }),
        });
        if (!res.ok) {
          setStatus('idle');
          return null;
        }
        const q = await res.json();
        setStatus('idle');
        const fee = q?.estFeeBreakdown ?? {};
        return {
          estOutputUsd: Number(q?.estOutputUsd ?? 0),
          estToTokenBaseUnit: String(q?.estToTokenBaseUnit ?? '0'),
          totalImpactUsd: Number(fee?.totalImpactUsd ?? 0),
          minReceived: Number(fee?.minReceived ?? 0),
          estCheckoutTimeMs: Number(q?.estCheckoutTimeMs ?? 0),
          quoteId: String(q?.quoteId ?? ''),
        };
      } catch {
        setStatus('idle');
        return null;
      }
    },
    [],
  );

  /**
   * Execute the withdrawal: request a bridge address, then send pUSD to it.
   * Resolves only after the send tx is confirmed on Polygon. Throws a
   * BridgeWithdrawError whose `stage` tells the caller what failed:
   *   'api'         — quote/address request failed (nothing sent; safe to fall back)
   *   'balance'     — no pUSD to withdraw
   *   'unsupported' — destination not offered by the bridge (nothing sent)
   *   'send'        — the on-chain send failed (nothing confirmed)
   */
  const bridgeWithdraw = useCallback(
    async ({
      eoa,
      amountUsd,
      toChainId,
      toTokenAddress,
    }: BridgeWithdrawParams): Promise<{ txHash: string; sent: number; bridgeAddress: string }> => {
      const embedded = wallets.find((w) => w.walletClientType === 'privy');
      if (!embedded) throw new BridgeWithdrawError('send', 'No embedded wallet found. Please reconnect.');
      const owner = eoa as Address;

      // 1. Find where the pUSD is and clamp the send to the on-chain balance so
      //    we never attempt to transfer more than the wallet holds.
      setStatus('requesting');
      const { source, isProxy, balance } = await resolvePusdSource(owner);
      if (balance <= 0n) {
        setStatus('idle');
        throw new BridgeWithdrawError('balance', 'No Polymarket pUSD balance to withdraw.');
      }
      const requested = toBaseUnits(amountUsd);
      const sendRaw = requested > balance ? balance : requested;
      if (sendRaw <= 0n) {
        setStatus('idle');
        throw new BridgeWithdrawError('balance', 'Amount is below the withdrawable minimum.');
      }
      // Polymarket's bridge rejects checkouts under $2 (verified live). Stop here
      // with a clear message instead of letting the on-chain send fail downstream.
      if (sendRaw < toBaseUnits(MIN_BRIDGE_USD)) {
        setStatus('idle');
        throw new BridgeWithdrawError(
          'balance',
          `Bridge minimum is $${MIN_BRIDGE_USD.toFixed(2)} — you have $${(Number(balance) / 1e6).toFixed(2)} pUSD. Add at least $${(MIN_BRIDGE_USD - Number(balance) / 1e6).toFixed(2)} more to withdraw to USDC.`,
        );
      }

      // 2. Ask Polymarket for the destination bridge address. `address` is the
      //    Polymarket wallet that will send pUSD; `recipientAddr` is where the
      //    unwrapped USDC lands on the destination chain (the owner EOA).
      let bridgeAddress: string;
      try {
        const res = await fetch('/api/trade/bridge/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: source,
            toChainId,
            toTokenAddress,
            recipientAddr: owner,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setStatus('idle');
          const msg: string = body?.error || `Bridge request failed (${res.status})`;
          // A 4xx that names the chain/token is an unsupported-destination case.
          const stage: BridgeWithdrawStage =
            /unsupported|not supported|invalid.*(chain|token)/i.test(msg) ? 'unsupported' : 'api';
          throw new BridgeWithdrawError(stage, msg);
        }
        const data = await res.json();
        bridgeAddress = data?.address?.evm;
        if (!bridgeAddress) {
          setStatus('idle');
          throw new BridgeWithdrawError('api', 'Bridge did not return a destination address. Try again shortly.');
        }
      } catch (err) {
        if (err instanceof BridgeWithdrawError) throw err;
        setStatus('idle');
        // Network error reaching our proxy route → bridge API unavailable.
        throw new BridgeWithdrawError('api', 'Could not reach the bridge service. Please try again.');
      }

      // 3. Send pUSD to the bridge address. Proxy-held funds go through
      //    ProxyWalletFactory.proxy(); EOA-held funds use a plain transfer.
      const dest = bridgeAddress as Address;
      const tx = isProxy
        ? buildPolymarketProxyWithdraw(dest, [{ address: PUSD, amount: sendRaw }])
        : {
            to: PUSD,
            data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [dest, sendRaw] }),
          };

      try {
        setStatus('signing');
        const receipt = await privySendTransaction(
          { to: tx.to, data: tx.data, chainId: polygon.id },
          { sponsor: true, address: embedded.address },
        );
        const txHash = typeof receipt === 'string' ? receipt : receipt.hash;
        if (!txHash) throw new BridgeWithdrawError('send', 'No transaction hash returned by the wallet.');

        setStatus('confirming');
        const pub = createPublicClient({ chain: polygon, transport: http(POLYGON_RPC) });
        await pub.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
        setStatus('done');
        return { txHash, sent: Number(sendRaw) / 1e6, bridgeAddress };
      } catch (err) {
        setStatus('error');
        if (err instanceof BridgeWithdrawError) throw err;
        const m = err instanceof Error ? err.message : 'Failed to send pUSD to the bridge.';
        throw new BridgeWithdrawError('send', m);
      }
    },
    [wallets, privySendTransaction],
  );

  return { getQuote, bridgeWithdraw, status };
}
