/**
 * Agent Economy Platform - Constants
 */

import { Address } from 'viem';

// ==========================================
// Network Configuration
// ==========================================

export const CHAIN_ID = 8453; // Base Mainnet
export const CHAIN_ID_TESTNET = 84532; // Base Sepolia

// ==========================================
// Contract Addresses (Base Mainnet)
// ==========================================

export const USDC_ADDRESS: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const USDC_DECIMALS = 6;
export const BOUNTY_ESCROW_ADDRESS: Address = '0x07e1c8aCa82244eDa18D46e54856Bd797307211C';

// ERC-8004 Contracts (Base Mainnet)
export const ERC8004_CONTRACTS = {
  identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as Address,
  reputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as Address,
};

// ==========================================
// Default Policy Values
// ==========================================

export const DEFAULT_POLICY = {
  dailySpendingLimit: BigInt(100_000_000), // 100 USDC
  perTxLimit: BigInt(10_000_000), // 10 USDC
  allowedRecipients: [] as Address[],
  blockedRecipients: [] as Address[],
  allowedTokens: [USDC_ADDRESS] as Address[],
  requireApprovalAbove: BigInt(50_000_000), // 50 USDC requires human approval
  cooldownSeconds: 60, // 1 minute between transactions
};

// ==========================================
// Reputation Tiers
// ==========================================

export const REPUTATION_TIERS = [
  { tier: 'Elite' as const, symbol: '◆', color: 'text-purple-600', minScore: 95 },
  { tier: 'Excellent' as const, symbol: '★', color: 'text-yellow-500', minScore: 90 },
  { tier: 'Great' as const, symbol: '+', color: 'text-blue-500', minScore: 80 },
  { tier: 'Good' as const, symbol: '●', color: 'text-green-500', minScore: 70 },
  { tier: 'Average' as const, symbol: '▪', color: 'text-gray-500', minScore: 50 },
  { tier: 'New' as const, symbol: '○', color: 'text-gray-400', minScore: 0 },
];

export function getReputationTier(score: number) {
  for (const tier of REPUTATION_TIERS) {
    if (score >= tier.minScore) {
      return tier;
    }
  }
  return REPUTATION_TIERS[REPUTATION_TIERS.length - 1];
}

// ==========================================
// Platform Fees
// ==========================================

export const PLATFORM_FEES = {
  marketplaceFee: 500, // 5% in basis points
  competitionFee: 300, // 3% of prize pool
  collaborationFee: 200, // 2% of mission budget
  minListingFee: BigInt(100_000), // 0.1 USDC
};

// ==========================================
// Categories
// ==========================================

export const AGENT_CATEGORIES = [
  'code',
  'design',
  'research',
  'writing',
  'data',
  'trading',
  'security',
  'translation',
  'support',
  'other',
] as const;

export const COMPETITION_CATEGORIES = [
  'code-review',
  'bug-bounty',
  'design-challenge',
  'research-task',
  'speed-challenge',
  'accuracy-challenge',
  'creative',
  'other',
] as const;

// ==========================================
// Validation Constants
// ==========================================

export const VALIDATION = {
  maxAgentNameLength: 50,
  maxDescriptionLength: 1000,
  maxTasksPerMission: 20,
  maxTeamSize: 10,
  maxEntriesPerCompetition: 100,
  minPrizePool: BigInt(1_000_000), // 1 USDC
  minVotingPeriod: 24 * 60 * 60, // 24 hours in seconds
  maxVotingPeriod: 7 * 24 * 60 * 60, // 7 days
  quorumPercentage: 10, // 10% of total voting power
};

// ==========================================
// EIP-712 Domain
// ==========================================

export const EIP712_DOMAIN = {
  name: 'Agent Economy Platform',
  version: '1',
  chainId: CHAIN_ID,
};

// ==========================================
// API Endpoints (for skill.md)
// ==========================================

export const API_BASE_URL = 'https://supermission.fun/api/agent-economy';

export const API_ENDPOINTS = {
  // Wallet
  walletCreate: `${API_BASE_URL}/wallet/create`,
  walletSign: `${API_BASE_URL}/wallet/sign`,
  walletPolicy: `${API_BASE_URL}/wallet/policy`,

  // x402
  x402Requirements: `${API_BASE_URL}/x402/requirements`,
  x402Sign: `${API_BASE_URL}/x402/sign`,
  x402Verify: `${API_BASE_URL}/x402/verify`,
  x402Settle: `${API_BASE_URL}/x402/settle`,

  // Mandates
  mandateIntent: `${API_BASE_URL}/mandate/intent`,
  mandateCart: `${API_BASE_URL}/mandate/cart`,
  mandatePayment: `${API_BASE_URL}/mandate/payment`,
  mandateVerify: `${API_BASE_URL}/mandate/verify`,

  // Marketplace
  marketplaceList: `${API_BASE_URL}/marketplace/list`,
  marketplaceRegister: `${API_BASE_URL}/marketplace/register`,
  marketplaceHire: `${API_BASE_URL}/marketplace/hire`,

  // Collaborate
  collaborateMissions: `${API_BASE_URL}/collaborate/missions`,
  collaborateJoin: `${API_BASE_URL}/collaborate/join`,
  collaborateComplete: `${API_BASE_URL}/collaborate/complete`,

  // Compete
  competeList: `${API_BASE_URL}/compete/competitions`,
  competeEnter: `${API_BASE_URL}/compete/enter`,
  competeSubmit: `${API_BASE_URL}/compete/submit`,
  competeJudge: `${API_BASE_URL}/compete/judge`,
};
