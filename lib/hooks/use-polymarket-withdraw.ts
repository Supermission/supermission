'use client';

import { useCallback, useState } from 'react';
import { useWallets, useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth';
import { createPublicClient, http, erc20Abi, type Address } from 'viem';
import { polygon } from 'viem/chains';
import { deriveMagicProxyAddress } from '@/lib/polymarket/proxy';
import { POLYGON_PUSD, POLYGON_USDC, POLYGON_RPC } from '@/lib/polymarket/trade-utils';
import { buildPolymarketProxyWithdraw } from '@/lib/polymarket/withdraw';

type Status = 'idle' | 'reading' | 'signing' | 'confirming' | 'done' | 'error';

/**
 * Withdraw a user's Polymarket proxy balance (USDC.e + pUSD) back to their EOA.
 * One gasless (sponsored) Polygon tx: the EOA calls ProxyWalletFactory.proxy(),
 * which runs an ERC-20 transfer from the caller's proxy wallet to the EOA.
 */
export function usePolymarketWithdraw() {
  const { wallets } = useWallets();
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();
  const [status, setStatus] = useState<Status>('idle');

  const withdraw = useCallback(
    async (eoa: string): Promise<{ txHash: string; withdrawn: number }> => {
      const embedded = wallets.find((w) => w.walletClientType === 'privy');
      if (!embedded) throw new Error('No embedded wallet found. Please reconnect.');
      const owner = eoa as Address;

      setStatus('reading');
      const pub = createPublicClient({ chain: polygon, transport: http(POLYGON_RPC) });
      const proxy = deriveMagicProxyAddress(owner);
      const [usdcE, pusd] = await Promise.all([
        pub.readContract({ address: POLYGON_USDC as Address, abi: erc20Abi, functionName: 'balanceOf', args: [proxy] }) as Promise<bigint>,
        pub.readContract({ address: POLYGON_PUSD as Address, abi: erc20Abi, functionName: 'balanceOf', args: [proxy] }) as Promise<bigint>,
      ]);

      const tokens = [
        { address: POLYGON_USDC as Address, amount: usdcE },
        { address: POLYGON_PUSD as Address, amount: pusd },
      ].filter((t) => t.amount > 0n);

      if (tokens.length === 0) {
        setStatus('idle');
        throw new Error('No Polymarket proxy balance to withdraw.');
      }
      const withdrawn = Number(usdcE + pusd) / 1e6;

      const { to, data } = buildPolymarketProxyWithdraw(owner, tokens);

      try {
        setStatus('signing');
        const receipt = await privySendTransaction(
          { to, data, chainId: polygon.id },
          { sponsor: true, address: embedded.address },
        );
        const txHash = receipt.hash;
        setStatus('confirming');
        await pub.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
        setStatus('done');
        return { txHash, withdrawn };
      } catch (err) {
        setStatus('error');
        throw err;
      }
    },
    [wallets, privySendTransaction],
  );

  return { withdraw, status };
}
