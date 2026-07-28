import { useQuery } from '@tanstack/react-query';

export interface RiskPosition {
  conditionId: string;
  question: string;
  outcome: string;
  size: number;
  currentPrice: number;
  entryPrice: number;
  pnl: number;
  category: string;
  weight: number;
}

export interface PortfolioRisk {
  totalValue: number;
  positionCount: number;
  categoryExposure: { category: string; value: number; percentage: number }[];
  correlationMatrix: { marketA: string; marketB: string; correlation: number }[];
  maxDrawdown: number;
  concentrationIndex: number;
  positions: RiskPosition[];
}

interface UsePortfolioRiskResult {
  riskData: PortfolioRisk | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePortfolioRisk(userAddress: string | undefined): UsePortfolioRiskResult {
  const { data, isLoading, error, refetch } = useQuery<PortfolioRisk, Error>({
    queryKey: ['portfolio-risk', userAddress],
    queryFn: async () => {
      const res = await fetch(`/api/portfolio/risk?address=${encodeURIComponent(userAddress!)}`);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch risk data (${res.status})`);
      }

      const data: PortfolioRisk = await res.json();
      return data;
    },
    enabled: !!userAddress,
  });

  return {
    riskData: data ?? null,
    loading: isLoading,
    error: error ? error.message : null,
    refresh: () => { refetch(); },
  };
}
