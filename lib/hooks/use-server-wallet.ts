'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';

/**
 * Privy Embedded Wallet Hook
 *
 * Uses Privy's embedded wallet for all users.
 * Returns the embedded wallet address and auth state.
 */
export function useServerWallet() {
    const { ready, authenticated, user } = usePrivy();
    const { wallets } = useWallets();

    // Find the embedded wallet (Privy creates this on login)
    const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
    const address = embeddedWallet?.address;

    return {
        isInitialized: ready,
        isSignedIn: authenticated,
        address: address,
        smartAccount: undefined, // No smart account concept in Privy
        eoaAddress: address, // Privy embedded wallets are EOAs
        currentUser: user,
        isReady: ready && authenticated && !!address,
    };
}

// Legacy alias
export const useCDPWallet = useServerWallet;
