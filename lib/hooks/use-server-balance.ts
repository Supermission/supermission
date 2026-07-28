'use client';

import { useEffect } from 'react';
import { useBalance } from 'wagmi';
import { usePaymentWallet } from './use-payment-wallet';
import { USDC_ADDRESS } from '@/lib/constants';

export function useServerBalance() {
    const { paymentAddress, isReady } = usePaymentWallet();

    // Get USDC balance
    const {
        data: usdcBalance,
        isLoading,
        refetch,
    } = useBalance({
        address: paymentAddress as `0x${string}`,
        token: USDC_ADDRESS as `0x${string}`,
        query: {
            enabled: !!paymentAddress && isReady,
        }
    });

    // Get ETH balance (for gas)
    const { data: ethBalance } = useBalance({
        address: paymentAddress as `0x${string}`,
        query: {
            enabled: !!paymentAddress && isReady,
        }
    });

    // Auto-refresh every 10 seconds
    useEffect(() => {
        if (!isReady) return;

        const interval = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            refetch();
        }, 30_000);

        return () => clearInterval(interval);
    }, [isReady, refetch]);

    return {
        usdcBalance: usdcBalance?.formatted || '0',
        ethBalance: ethBalance?.formatted || '0',
        isLoading,
        refetch,
    };
}

// Legacy alias
export const useCDPBalance = useServerBalance;
