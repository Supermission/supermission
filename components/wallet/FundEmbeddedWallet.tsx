'use client';

import { useFundWallet } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { base } from 'wagmi/chains';

interface FundEmbeddedWalletProps {
  className?: string;
}

export function FundEmbeddedWallet({ className }: FundEmbeddedWalletProps) {
  const { address } = useAccount();
  const { fundWallet } = useFundWallet();

  if (!address) return null;

  const handleFund = async () => {
    try {
      await fundWallet({
        address,
        options: {
          chain: base,
          amount: '10',
          asset: 'USDC',
        },
      });
    } catch (error) {
      console.error('[FundWallet] Error:', error);
    }
  };

  return (
    <button
      onClick={handleFund}
      className={className || 'text-sm font-medium text-neutral-600 hover:text-black transition-colors'}
    >
      Add Funds
    </button>
  );
}
