'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';

/**
 * Unified Payment Wallet Hook (Privy-only)
 *
 * Returns the Privy embedded wallet as the single payment wallet.
 * No dual-wallet logic needed since we only support Privy embedded wallets.
 */
export function usePaymentWallet() {
    const { ready, authenticated } = usePrivy();
    const { wallets } = useWallets();

    // Find the embedded wallet
    const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
    const address = embeddedWallet?.address || null;

    const isReady = ready && authenticated && !!address;

    return {
        // Primary payment address (use this for transactions)
        paymentAddress: isReady ? address : null,

        // Whether a wallet is ready for payments
        isReady,

        // Wallet type is always privy now
        walletType: isReady ? ('privy' as const) : ('none' as const),

        // Legacy compatibility fields
        external: {
            address: undefined as string | undefined,
            isConnected: false,
        },
        cdp: {
            address,
            isReady,
            isSignedIn: authenticated,
            isInitialized: ready,
        },
    };
}
