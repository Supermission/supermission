/**
 * ERC-8004 Agent Types and Interfaces
 */

import type { Address } from 'viem';

/**
 * Agent capabilities (common skills)
 */
export const COMMON_CAPABILITIES = [
  'logo-design',
  'copywriting',
  'web-development',
  'smart-contracts',
  'data-analysis',
  'content-writing',
  'video-editing',
  'social-media',
  'seo-optimization',
  'translation',
  'graphic-design',
  'ui-ux-design',
  '3d-modeling',
  'animation',
  'consulting',
  'polymarket',
  'crypto-tokens',
  'defi-yield-analysis',
  'wallet-profiling',
  'nft-valuation',
  'dao-governance-analysis',
  'airdrop-hunting',
  'gas-optimization',
  'bridge-routing',
  'portfolio-analysis',
  'rarity-analysis',
  'whale-detection',
] as const;

export type CommonCapability = (typeof COMMON_CAPABILITIES)[number];

/**
 * Agent Card JSON structure (stored on IPFS)
 */
export interface AgentCardJSON {
  name: string;
  description: string;
  agentType: 'human' | 'ai' | 'hybrid';
  avatar?: string; // IPFS or HTTP URL
  capabilities: string[];
  pricing?: {
    hourlyRate?: number; // In USDC
    perMessage?: number; // For AI agents
    perTask?: number;
  };
  contact?: {
    twitter?: string;
    github?: string;
    email?: string;
    website?: string;
    telegram?: string;
  };
  portfolio?: Array<{
    title: string;
    description: string;
    imageUrl: string;
    url?: string;
    completedAt?: string;
  }>;
  bio?: string;
  languages?: string[];
  timezone?: string;
  availability?: {
    hoursPerWeek?: number;
    daysAvailable?: string[];
  };
  skills?: Array<{
    name: string;
    level: 'beginner' | 'intermediate' | 'expert';
  }>;
}

/**
 * Agent registration parameters
 */
export interface AgentRegistrationParams {
  agentType: 0 | 1 | 2; // Human, AI, Hybrid
  agentCardURI: string; // IPFS URI
  capabilities: string[];
}

/**
 * Agent profile (on-chain + off-chain data combined)
 */
export interface AgentProfile {
  agentId: string;
  owner: Address;
  agentType: 'Human' | 'AI' | 'Hybrid';
  status: 'Active' | 'Paused' | 'Deactivated';
  verified: boolean;
  capabilities: string[];
  registeredAt: Date;
  lastUpdated: Date;
  
  // Off-chain metadata
  metadata: AgentCardJSON;
  
  // Reputation
  reputation: {
    trustScore: number;
    qualityRating: number;
    communicationRating: number;
    timelinessRating: number;
    completedGigs: number;
    successRate: number;
    disputeRate: number;
  };
}

/**
 * Agent search result
 */
export interface AgentSearchResult {
  agents: AgentProfile[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Agent discovery query
 */
export interface AgentDiscoveryQuery {
  capability?: string;
  agentType?: 'Human' | 'AI' | 'Hybrid';
  minTrustScore?: number;
  verifiedOnly?: boolean;
  sortBy?: 'trust' | 'experience' | 'newest' | 'rating';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

