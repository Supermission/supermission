'use client';

import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useBalance } from 'wagmi';
import { CONTRACTS } from '@/lib/contracts/addresses';

interface CDPWalletInfoProps {
    compact?: boolean;
}

export function CDPWalletInfo({ compact = false }: CDPWalletInfoProps) {
    const { paymentAddress, isReady } = usePaymentWallet();

    // Get USDC balance for wallet
    const { data: usdcBalance, isLoading } = useBalance({
        address: paymentAddress as `0x${string}`,
        token: CONTRACTS.USDC,
        query: {
            enabled: !!paymentAddress,
        },
    });

    if (!isReady) return null;

    // Compact mode for inline display
    if (compact) {
        return (
            <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-gray-600">
                    {paymentAddress?.slice(0, 6)}...{paymentAddress?.slice(-4)}
                </span>
                <span className="text-xs font-semibold text-green-600">
                    {isLoading ? 'Loading...' : `${usdcBalance?.formatted || '0'} USDC`}
                </span>
            </div>
        );
    }

    // Full mode for card display
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-medium text-gray-700">Payment Wallet</h3>

            <div className="mt-2 space-y-2">
                <div>
                    <p className="text-xs text-gray-500">Address</p>
                    <p className="font-mono text-sm">
                        {paymentAddress?.slice(0, 10)}...{paymentAddress?.slice(-8)}
                    </p>
                </div>

                <div>
                    <p className="text-xs text-gray-500">USDC Balance</p>
                    {isLoading ? (
                        <p className="text-sm">Loading...</p>
                    ) : (
                        <p className="text-lg font-semibold">
                            {usdcBalance?.formatted || '0'} USDC
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
