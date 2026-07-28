import { useMemo } from 'react';
import { useWallets } from '@privy-io/react-auth';

/**
 * Returns the Privy embedded wallet address.
 * Use this instead of wagmi's useAccount() for Polymarket-related queries
 * (positions, trade history) since trades execute via the embedded wallet.
 */
export function useEmbeddedAddress(): `0x${string}` | undefined {
  const { wallets } = useWallets();
  return useMemo(() => {
    const embedded = wallets.find(w => w.walletClientType === 'privy');
    return embedded?.address as `0x${string}` | undefined;
  }, [wallets]);
}
