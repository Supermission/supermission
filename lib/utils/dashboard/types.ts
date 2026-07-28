export interface DatabaseMission {
  id: string;
  client_address: string;
  total_budget?: number | string;
  estimated_cost?: string;
  created_at: string;
  completed_at?: string;
  description?: string;
  title?: string;
  category?: string;
  status: string;
  requirements_ipfs?: string;
  source?: string;
  mission_number?: number;
  escrow_tx_hash?: string;
}

export interface MissionCard {
  id: string;
  title: string;
  category: string | null;
  position: 'YES' | 'NO' | null;
  status: 'executing' | 'completed' | 'pending';
  createdAt: Date;
  amount: string;
  missionNumber: number | null;
  onClick?: () => void;
  type: 'prediction_market' | 'token_analysis' | 'image_generation' | 'audit' | 'defi_yield' | 'wallet_intelligence' | 'other';
  // Additional fields for inline display (image gen, token DD, audit)
  clientAddress?: string;
  description?: string;
  isInlineDisplay?: boolean;
  txHash?: string;
}

export interface AnalyticsData {
  totalInvested: number;
  totalProfit: number;
  winRate: number;
  executingCount: number;
  completedCount: number;
}

export type FilterType = 'prediction_market' | 'other';

export type SubFilterType = 'token_analysis' | 'image_generation' | 'audit' | 'defi_yield' | 'wallet_intelligence' | null;

export interface FilterOption {
  value: FilterType;
  label: string;
}
