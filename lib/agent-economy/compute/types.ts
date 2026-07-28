/**
 * Compute Marketplace Types
 * Agents selling LLM inference for USDC via x402
 */

export type ProviderType = 'self_hosted' | 'cloud' | 'decentralized';

export interface ComputeModel {
  id: string;
  providerId: string;
  modelName: string;
  displayName: string | null;
  inputPricePer1k: string;   // atomic USDC per 1K input tokens
  outputPricePer1k: string;  // atomic USDC per 1K output tokens
  maxContextLength: number;
  isActive: boolean;
  metadata: Record<string, unknown>;
}

export interface ComputeProvider {
  id: string;
  agentId: string;
  agentName?: string;
  endpointUrl: string;
  isActive: boolean;
  rateLimitRpm: number;
  minChargeUsdc: string;
  supportedFeatures: string[];
  providerType: ProviderType;
  infraDetails: Record<string, unknown>;
  models: ComputeModel[];
  totalRequests: number;
  totalTokensServed: number;
  totalEarnings: string;
  avgLatencyMs: number | null;
  uptimeScore: number;
  reputationScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterComputeProviderRequest {
  agentId: string;
  endpointUrl: string;
  rateLimitRpm?: number;
  minChargeUsdc?: string;
  supportedFeatures?: string[];
  providerType?: ProviderType;
  infraDetails?: Record<string, unknown>;
  models: {
    modelName: string;
    displayName?: string;
    inputPricePer1k: string;
    outputPricePer1k: string;
    maxContextLength?: number;
    metadata?: Record<string, unknown>;
  }[];
}

export interface UpdateComputeProviderRequest {
  providerId: string;
  endpointUrl?: string;
  rateLimitRpm?: number;
  minChargeUsdc?: string;
  supportedFeatures?: string[];
  isActive?: boolean;
  infraDetails?: Record<string, unknown>;
  models?: {
    modelName: string;
    displayName?: string;
    inputPricePer1k: string;
    outputPricePer1k: string;
    maxContextLength?: number;
    isActive?: boolean;
    metadata?: Record<string, unknown>;
  }[];
}

export interface ListProvidersOptions {
  model?: string;
  feature?: string;
  providerType?: ProviderType;
  maxInputPrice?: string;
  minReputation?: number;
  sortBy?: 'price' | 'reputation' | 'requests' | 'latency';
  limit?: number;
  offset?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferenceRequest {
  model: string;
  messages: ChatMessage[];
  providerId?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface InferenceResponse {
  id: string;
  model: string;
  provider: { id: string; name: string };
  choices: { index: number; message: ChatMessage; finishReason: string }[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: {
    amount: string;
    amountUsd: string;
    txHash: string | null;
  };
  latencyMs: number;
}

export interface ComputeUsage {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsdc: string;
  recentRequests: {
    id: string;
    modelName: string;
    providerName: string | null;
    consumerName: string | null;
    inputTokens: number;
    outputTokens: number;
    costUsdc: string;
    status: string;
    latencyMs: number | null;
    paymentTxHash: string | null;
    createdAt: string;
  }[];
}

export interface AvailableModel {
  modelName: string;
  providerCount: number;
  cheapestInputPricePer1k: string;
  cheapestOutputPricePer1k: string;
  avgReputation: number;
}

// ==========================================
// Compute Sessions Types
// ==========================================

export type SessionStatus = 'pending' | 'provisioning' | 'active' | 'closing' | 'closed' | 'failed' | 'expired';
export type SessionFundingModel = 'byoc' | 'sponsor' | 'pool';
export type SettlementStatus = 'unsettled' | 'settling' | 'settled' | 'failed' | 'partial';
export type ExecutionType = 'inference' | 'code' | 'training' | 'custom';

export interface ResourceSpec {
  gpuType?: string;
  memoryMb?: number;
  cpuCores?: number;
  durationSeconds?: number;
  model?: string;
}

export interface ComputeSession {
  id: string;
  consumerAgentId: string;
  consumerAgentName: string;
  providerId: string | null;
  providerAgentName: string | null;
  missionId: string | null;
  taskId: string | null;
  status: SessionStatus;
  fundingModel: SessionFundingModel;
  resourceSpec: ResourceSpec;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCpuSeconds: number;
  totalGpuSeconds: number;
  totalMemoryMbSeconds: number;
  totalCostUsdc: string;
  executionCount: number;
  maxCostUsdc: string | null;
  maxDurationSeconds: number;
  paymentTxHash: string | null;
  settlementStatus: SettlementStatus;
  escrowId: string | null;
  createdAt: string;
  startedAt: string | null;
  closedAt: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
}

export interface CreateSessionRequest {
  consumerAgentId: string;
  providerId?: string;
  model?: string;
  fundingModel?: SessionFundingModel;
  resourceSpec?: ResourceSpec;
  maxCostUsdc?: string;
  maxDurationSeconds?: number;
  missionId?: string;
  taskId?: string;
  escrowId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionExecuteRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  executionType?: ExecutionType;
}

export interface ExecutionReceipt {
  id: string;
  sessionId: string;
  computeRequestId: string | null;
  executionType: ExecutionType;
  inputHash: string | null;
  outputHash: string | null;
  inputTokens: number;
  outputTokens: number;
  cpuSeconds: number;
  gpuSeconds: number;
  memoryMbSeconds: number;
  costUsdc: string;
  latencyMs: number | null;
  providerSignature: string | null;
  modelName: string | null;
  status: 'pending' | 'completed' | 'failed';
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SessionExecuteResponse {
  receipt: ExecutionReceipt;
  response: InferenceResponse;
}

export interface ComputeEscrow {
  id: string;
  sponsorAgentId: string;
  sponsorAgentName: string;
  missionId: string | null;
  taskId: string | null;
  totalBudgetUsdc: string;
  spentUsdc: string;
  remainingUsdc: string;
  status: 'funded' | 'active' | 'depleted' | 'released' | 'refunded' | 'expired';
  maxPerSessionUsdc: string | null;
  allowedAgentIds: string[];
  fundTxHash: string | null;
  releaseTxHash: string | null;
  refundTxHash: string | null;
  createdAt: string;
  releasedAt: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
}

export interface CreateEscrowRequest {
  sponsorAgentId: string;
  totalBudgetUsdc: string;
  missionId?: string;
  taskId?: string;
  maxPerSessionUsdc?: string;
  allowedAgentIds?: string[];
  expiresInSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface EscrowDraw {
  id: string;
  escrowId: string;
  sessionId: string;
  agentId: string;
  amountUsdc: string;
  receiptId: string | null;
  description: string | null;
  createdAt: string;
}
