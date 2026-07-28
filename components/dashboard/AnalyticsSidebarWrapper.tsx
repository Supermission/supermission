import { useEffect } from 'react';
import { useBalance } from 'wagmi';
import { AnalyticsSidebar } from './AnalyticsSidebar';
import { USDC_ADDRESS } from '@/lib/utils/dashboard/constants';
import { PolymarketPosition } from '@/lib/hooks/dashboard/usePolymarketPositions';
import { usePolymarketAnalytics } from '@/lib/hooks/dashboard/usePolymarketAnalytics';

interface AnalyticsSidebarWrapperProps {
  address: string;
  positions: PolymarketPosition[];
  isLoading: boolean;
}

export function AnalyticsSidebarWrapper({ address, positions, isLoading }: AnalyticsSidebarWrapperProps) {
  const { analytics, isLoading: isLoadingAnalytics, fetchAnalytics } = usePolymarketAnalytics();

  useEffect(() => {
    if (address) {
      fetchAnalytics(address, positions);
    }
  }, [address]);

  const { data: balanceData } = useBalance({
    address: address as `0x${string}`,
    token: USDC_ADDRESS as `0x${string}`,
  });

  const walletBalance = balanceData
    ? parseFloat(balanceData.formatted).toFixed(2)
    : '0.00';

  return (
    <AnalyticsSidebar
      analytics={analytics}
      walletBalance={walletBalance}
      isLoading={isLoading || isLoadingAnalytics}
    />
  );
}
