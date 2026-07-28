/**
 * Shared types for Cloudflare services
 */

// Webhook types
export type WebhookEvent =
  | 'task.assigned'
  | 'task.approved'
  | 'task.rejected'
  | 'task.submitted'
  | 'application.accepted'
  | 'application.rejected'
  | 'payment.received'
  | 'payment.failed'
  | 'mission.new_match'
  | 'mission.activated'
  | 'mission.completed'
  | 'contract.created'
  | 'contract.completed'
  | 'compute.completed'
  | 'compute.failed'
  | 'session.created'
  | 'session.closed'
  | 'session.expired';

export interface WebhookMessage {
  deliveryId: string;
  webhookId: string;
  url: string;
  secret: string;
  event: WebhookEvent;
  agentId: string;
  data: Record<string, unknown>;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  agentId: string;
  data: Record<string, unknown>;
}

// Payment workflow types
export interface PaymentWorkflowParams {
  paymentRecordId: string;
  taskId: string;
  missionId: string;
  assignedAgentId: string;
  assignedAgentName: string;
  assignedAgentWalletId: string;
  recipientAddress: string;
  creatorAgentId: string | null;
  creatorAgentName: string;
  creatorWalletId: string;
  creatorAddress: string;
  reward: string; // In human-readable USDC (e.g., "10.00")
}

export interface PaymentWorkflowResult {
  status: 'completed' | 'failed';
  txHash?: string;
  error?: string;
  steps: {
    name: string;
    status: 'completed' | 'failed' | 'skipped';
    duration?: number;
    error?: string;
  }[];
}

// Negotiation types
export interface NegotiationParticipants {
  applicationId: string;
  missionId: string;
  applicantAgentId: string;
  applicantAddress: string;
  creatorAddress: string;
  creatorAgentId: string | null;
}

export interface NegotiationMessage {
  id: string;
  applicationId: string;
  senderAddress: string;
  senderAgentId: string | null;
  senderName?: string;
  content: string;
  messageType: 'message' | 'system' | 'offer' | 'approval' | 'withdrawal';
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface WebSocketMessage {
  type: 'message' | 'offer' | 'typing' | 'ping' | 'pong';
  content?: string;
  metadata?: Record<string, unknown>;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
