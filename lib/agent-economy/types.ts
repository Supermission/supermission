/**
 * Agent Economy Platform - Core Types
 * Defines all types for the agent economy ecosystem
 */

import { Address } from 'viem';

// ==========================================
// Common Types
// ==========================================

export type AgentStatus = 'active' | 'inactive' | 'suspended' | 'pending';
export type AgentType = 'ai';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type MissionStatus = 'active' | 'in_progress' | 'completed' | 'cancelled';
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'submitted' | 'approved' | 'rejected';
export type CompetitionStatus = 'upcoming' | 'active' | 'judging' | 'completed' | 'cancelled';
export type MandateType = 'intent' | 'cart' | 'payment';

// ==========================================
// Server Wallet Types (re-exported from wallet/types.ts)
// ==========================================

export type {
  AgentKey,
  EncryptedAccountKey,
  AgentWallet,
  AgentPolicy,
  SpendingHistory,
  SpendingRecord,
  PolicyResult,
  SignRequest,
  SignResponse,
  CreateWalletRequest,
  CreateWalletResponse,
} from './wallet/types';

// ==========================================
// x402 Payment Types (re-exported from x402/types.ts)
// ==========================================

export type {
  EIP3009Authorization,
  PaymentRequirements,
  PaymentPayload,
  PaymentReceipt,
  X402Message,
} from './x402/types';
import type { EIP3009Authorization, PaymentRequirements } from './x402/types';

// ==========================================
// AP2 Mandate Types
// ==========================================

export interface IntentMandate {
  id: string;
  userCartConfirmationRequired: boolean;
  naturalLanguageDescription: string;
  merchants: Address[] | null;
  skus: string[] | null;
  requiresRefundability: boolean;
  intentExpiry: Date;
  userAddress: Address;
  userSignature: string;
  createdAt: Date;
}

export interface CartItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: bigint;
  currency: string;
}

export interface CartMandate {
  id: string;
  cartId: string;
  items: CartItem[];
  totalAmount: bigint;
  currency: string;
  merchantAddress: Address;
  merchantSignature: string;
  userAddress: Address;
  userSignature: string;
  expiry: Date;
  createdAt: Date;
}

export interface PaymentMandate {
  id: string;
  aiAgentPresent: boolean;
  transactionModality: 'human-present' | 'human-not-present';
  paymentDetailsId: string;
  totalAmount: bigint;
  merchantAgentId: string;
  userAuthorization: string;
  timestamp: Date;
  linkedMandates: {
    intentMandateId?: string;
    cartMandateId?: string;
  };
}

export interface MandateVerification {
  valid: boolean;
  mandateId: string;
  type: MandateType;
  signatureValid: boolean;
  notExpired: boolean;
  errors: string[];
}

// ==========================================
// ERC-8004 Types
// ==========================================

export interface ERC8004Agent {
  agentId: string; // On-chain ID (bytes32)
  owner: Address;
  agentType: AgentType;
  status: AgentStatus;
  agentCardURI: string;
  capabilities: string[];
  registeredAt: Date;
  lastUpdated: Date;
  verified: boolean;
}

export interface ERC8004Reputation {
  agentId: string;
  reputationScore: number;
  totalReviews: number;
  successfulTasks: number;
  failedTasks: number;
  totalEarnings: bigint;
  tier: ReputationTier;
}

export interface ReputationTier {
  tier: 'New' | 'Average' | 'Good' | 'Great' | 'Excellent' | 'Elite';
  symbol: string;
  color: string;
  minScore: number;
}

export interface AgentMetadata {
  name: string;
  description: string;
  avatar?: string;
  website?: string;
  capabilities: string[];
  pricing: AgentPricing;
  contactInfo?: {
    email?: string;
    discord?: string;
    twitter?: string;
  };
}

export interface AgentPricing {
  perTask: bigint;
  perHour?: bigint;
  customPricing?: Record<string, bigint>;
  currency: 'USDC';
}

// ==========================================
// Marketplace Types
// ==========================================

export interface MarketplaceAgent {
  id: string;
  erc8004AgentId: string | null;
  verifiedOnChain: boolean;
  name: string;
  description: string;
  walletAddress: Address;
  cdpWalletAddress: Address | null;
  capabilities: string[];
  agentType: 'ai' | 'human' | 'hybrid';
  status: 'active' | 'inactive' | 'suspended';
  pricePerTask: bigint;
  reputationScore: number;
  totalReviews: number;
  totalTasksCompleted: number;
  totalEarnings: bigint;
  avatarUrl: string | null;
  endpointUrl: string | null;
  createdAt: Date;
}

export interface RegisterAgentRequest {
  name: string;
  description: string;
  walletAddress: Address;
  capabilities: string[];
  agentType: 'ai' | 'human' | 'hybrid';
  pricePerTask: string;
  avatarUrl?: string;
  endpointUrl?: string;
  erc8004AgentId?: string;
}

export interface MarketplaceListing {
  id: string;
  agentId: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  price: bigint;
  deliveryTimeHours: number;
  isActive: boolean;
  createdAt: Date;
}

export interface HireRequest {
  agentId: string;
  clientAddress: Address;
  taskDescription: string;
  budget: bigint;
  deadline?: Date;
  requirements?: string[];
}

export interface HireResponse {
  success: boolean;
  contractId?: string;
  paymentRequired?: PaymentRequirements;
  error?: string;
}

export interface AgentReview {
  id: string;
  agentId: string;
  reviewerAddress: Address;
  taskId: string;
  rating: number; // 1-5
  comment: string;
  createdAt: Date;
}

// ==========================================
// Collaboration Types
// ==========================================

export interface Mission {
  id: string;
  title: string;
  description: string;
  clientAddress: Address;
  leadAgentId: string | null;
  status: MissionStatus;
  category: string;
  budget: bigint;
  requiredAgents: number;
  currentAgents: number;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MissionTask {
  id: string;
  missionId: string;
  title: string;
  description: string;
  assignedAgentId: string | null;
  status: TaskStatus;
  budget: bigint;
  dependencies: string[];
  submissionData: Record<string, unknown> | null;
  completedAt: Date | null;
}

export interface TeamMember {
  agentId: string;
  agentName: string;
  role: 'lead' | 'contributor';
  contribution: number; // Percentage 0-100
  joinedAt: Date;
}

export interface CreateMissionRequest {
  title: string;
  description: string;
  clientAddress: Address;
  budget: string;
  category?: string;
  deadline?: Date;
  tasks?: Array<{
    title: string;
    description?: string;
    budget?: string;
    reward?: string;
    dependencies?: string[];
  }>;
  requiredCapabilities?: string[];
  niceToHaveCapabilities?: string[];
  excludedCapabilities?: string[];
  minReputation?: number;
  autoAssign?: boolean;
}

export interface RewardDistribution {
  agentId: string;
  percentage: number;
  amount: bigint;
  status: PaymentStatus;
  paidAt: Date | null;
}

export interface DelegationRequest {
  missionId: string;
  taskId: string;
  fromAgentId: string;
  toAgentId: string;
  budget: bigint;
  deadline?: Date;
}

// ==========================================
// Competition Types
// ==========================================

export interface Competition {
  id: string;
  title: string;
  description: string;
  category: string;
  sponsorAddress: Address;
  prizePool: bigint;
  prizes: Prize[];
  rules: string;
  judgingCriteria: JudgingCriteria[];
  status: CompetitionStatus;
  entryFee: bigint;
  maxEntries: number;
  currentEntries: number;
  startsAt: Date;
  endsAt: Date;
  judgingEndsAt: Date;
  createdAt: Date;
}

export interface Prize {
  rank: number;
  amount: bigint;
  description?: string;
}

export interface JudgingCriteria {
  name: string;
  description: string;
  weight: number; // Percentage 0-100
}

export interface CompetitionEntry {
  id: string;
  competitionId: string;
  agentId: string;
  agentName: string;
  submissionUrl: string | null;
  submissionData: Record<string, unknown>;
  score: number | null;
  rank: number | null;
  submittedAt: Date;
}

export interface CreateCompetitionRequest {
  title: string;
  description: string;
  category: string;
  sponsorAddress: Address;
  prizePool: string;
  prizes: Array<{ rank: number; amount: string; description?: string }>;
  rules: string;
  judgingCriteria: JudgingCriteria[];
  entryFee?: string;
  maxEntries?: number;
  startsAt: Date;
  endsAt: Date;
  judgingEndsAt: Date;
}

export interface JudgingResult {
  judgeAddress: Address;
  criteriaScores: Record<string, number>;
  totalScore: number;
  comments: string;
  submittedAt: Date;
}

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  agentName: string;
  score: number;
  prizeAmount: bigint;
}

// ==========================================
// ERC-8004 Registration Types
// ==========================================

export interface ERC8004RegisterAgentRequest {
  name: string;
  description: string;
  capabilities: string[];
  walletAddress: Address;
}

export interface RegisterAgentResponse {
  success: boolean;
  agentId?: string;
  globalAgentId?: string;
  txHash?: string;
  error?: string;
}

export interface ERC8004OnChainAgent {
  agentId: string;
  owner: Address;
  agentURI: string;
}

// ==========================================
// Platform Stats Types
// ==========================================

export interface PlatformStats {
  totalAgents: number;
  activeAgents: number;
  totalTransactions: number;
  totalVolume: bigint;
  totalMissions: number;
  activeMissions: number;
  totalCompetitions: number;
  activeCompetitions: number;
  avgAgentRating: number;
}

// ==========================================
// API Response Types
// ==========================================

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
