/**
 * Server Wallet - Types
 */

import { Address } from 'viem';

export interface AgentKey {
  publicKey: Address;
  hashedSecret: string;
}

export interface EncryptedAccountKey {
  encryptedPrivateKey: string;
  publicAddress: Address;
  iv: string;
}

export interface AgentWallet {
  id: string;
  agentName: string;
  agentKeyPublic: Address;
  agentKeyHash: string;
  encryptedAccountKey: string;
  accountAddress: Address;
  iv: string;
  createdAt: Date;
}

export interface AgentPolicy {
  id: string;
  walletId: string;
  dailySpendingLimit: bigint;
  perTxLimit: bigint;
  allowedRecipients: Address[];
  blockedRecipients: Address[];
  allowedTokens: Address[];
  requireApprovalAbove: bigint | null;
  cooldownSeconds: number;
  updatedAt: Date;
}

export interface SpendingHistory {
  walletId: string;
  last24Hours: bigint;
  lastTxTimestamp: number;
  transactions: SpendingRecord[];
}

export interface SpendingRecord {
  id: string;
  walletId: string;
  amount: bigint;
  recipient: Address;
  token: Address;
  txHash: string | null;
  createdAt: Date;
}

export interface PolicyResult {
  valid: boolean;
  requiresHumanApproval?: boolean;
  errors: string[];
}

export interface SignRequest {
  agentKey: string;
  to: Address;
  amount: bigint;
  token: Address;
  mandateId?: string; // Optional AP2 mandate to verify before signing
}

export interface SignResponse {
  success: boolean;
  signature?: string;
  authorization?: {
    from: Address;
    to: Address;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  };
  error?: string;
}

export interface CreateWalletRequest {
  agentName: string;
  ownerAddress?: Address;
  policy?: Partial<AgentPolicy>;
  externalAddress?: Address;   // The wallet address (from Privy or agent-provided)
  privyWalletId?: string;      // Privy wallet ID — stored so platform can reference it
}

export interface CreateWalletResponse {
  success: boolean;
  walletId?: string;
  agentKey?: string;
  accountAddress?: Address;
  error?: string;
}

export interface WalletDBRecord {
  id: string;
  agent_name: string;
  agent_key_public: string;
  agent_key_hash: string;
  encrypted_account_key: string;
  account_address: string;
  iv: string;
  created_at: string;
}

export interface PolicyDBRecord {
  id: string;
  wallet_id: string;
  daily_spending_limit: string;
  per_tx_limit: string;
  allowed_recipients: string[];
  blocked_recipients: string[];
  allowed_tokens: string[];
  require_approval_above: string | null;
  cooldown_seconds: number;
  updated_at: string;
}

export interface SpendingDBRecord {
  id: string;
  wallet_id: string;
  amount: string;
  recipient: string;
  token: string;
  tx_hash: string | null;
  created_at: string;
}
