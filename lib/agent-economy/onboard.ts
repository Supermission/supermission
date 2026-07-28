/**
 * Unified Agent Onboarding Orchestrator
 *
 * Single-call onboarding: validates name, creates wallet, registers on-chain,
 * registers in marketplace, generates API key, and creates a human-agent claim.
 */

import { Address } from 'viem';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/client';
import { createAgentWallet, createPrivyWallet } from './wallet/create';
import { registerAgentOnChain, cacheRegistration } from './erc8004/register';
import { registerMarketplaceAgent } from './marketplace';
import { generateApiKey } from './auth/api-key';
import { createWebhook, type WebhookEvent } from './webhooks';
import { sanitizeInput } from './utils/sanitize';

/** Critical events auto-subscribed when agent provides a webhookUrl */
const CRITICAL_WEBHOOK_EVENTS: WebhookEvent[] = [
  // Worker-side events
  'task.assigned',
  'task.approved',
  'task.rejected',
  'payment.received',
  'payment.failed',
  'application.accepted',
  'application.rejected',
  // Creator-side events
  'mission.new_match',
  'task.submitted',
  // Both sides
  'mission.completed',
];


// Word list for human-readable verification codes
const CODE_WORDS = [
  'mission', 'agent', 'chain', 'pulse', 'orbit', 'spark', 'forge',
  'nexus', 'craft', 'quest', 'blaze', 'drift', 'surge', 'prime',
  'scout', 'vault', 'sigma', 'omega', 'delta', 'alpha',
];

export interface OnboardRequest {
  name: string;
  description: string;
  capabilities: string[];
  agentType: 'ai' | 'human';
  pricePerTask: string;
  walletAddress?: string; // Optional — if omitted, platform provisions a Privy wallet
  endpointUrl?: string;
  webhookUrl?: string;
  contact?: {
    twitter?: string;
    github?: string;
    website?: string;
  };
}

export interface OnboardResponse {
  success: boolean;
  agent?: {
    id: string;
    name: string;
    profileUrl: string;
    walletAddress: string;
    walletId?: string;       // Privy wallet ID — save this, used to send USDC
    erc8004AgentId?: string;
    registrationTx?: string;
  };
  apiKey?: string;
  claim?: {
    url: string;
    verificationCode: string;
    tweetTemplate: string;
  };
  webhook?: {
    id: string;
    secret: string;
    events: string[];
  };
  nextSteps?: string[];
  error?: string;
}

/**
 * Validate agent name: 3-40 chars, alphanumeric + underscore/hyphen
 */
function validateName(name: string): string | null {
  if (!name || name.trim().length === 0) return 'Agent name is required';
  if (!/^[a-zA-Z0-9_-]{3,40}$/.test(name)) {
    return 'Name must be 3-40 characters (letters, numbers, underscore, hyphen)';
  }
  return null;
}

/**
 * Generate a human-readable verification code: word-XXXX
 */
function generateVerificationCode(): string {
  const word = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)];
  const hex = randomBytes(2).toString('hex').toUpperCase();
  return `${word}-${hex}`;
}

/**
 * Generate a secure claim token: supermission_claim_<32hex>
 */
function generateClaimToken(): string {
  return `supermission_claim_${randomBytes(16).toString('hex')}`;
}

/**
 * Full onboarding orchestration
 */
export async function onboardAgent(request: OnboardRequest): Promise<OnboardResponse> {
  // 1. Validate name
  const nameError = validateName(request.name);
  if (nameError) return { success: false, error: nameError };

  if (!request.description || request.description.length > 1000) {
    return { success: false, error: 'Description is required (max 1000 chars)' };
  }
  if (!request.capabilities || request.capabilities.length === 0) {
    return { success: false, error: 'At least one capability is required' };
  }

  // Sanitize free-text inputs at entry point (defense-in-depth)
  request.description = sanitizeInput(request.description).trim();
  request.capabilities = request.capabilities.map((c) => sanitizeInput(c).trim()).filter(Boolean);

  // Check name uniqueness (case-insensitive)
  const { data: existing } = await supabaseAdmin
    .from('marketplace_agents')
    .select('id')
    .ilike('agent_name', request.name)
    .single();

  if (existing) {
    return { success: false, error: `Agent name "${request.name}" is already taken` };
  }

  // 2. Provision or register wallet
  // If agent provides a walletAddress, use it directly.
  // If not, platform creates a Privy-backed MPC wallet on the agent's behalf.
  let provisionedPrivyWalletId: string | undefined;
  let resolvedWalletAddress: string;

  if (request.walletAddress) {
    // Agent provided their own address — validate format
    if (!/^0x[0-9a-fA-F]{40}$/.test(request.walletAddress)) {
      return { success: false, error: 'walletAddress must be a valid 0x address' };
    }
    resolvedWalletAddress = request.walletAddress;
  } else {
    // No address provided — provision a Privy wallet via platform credentials
    const privyResult = await createPrivyWallet();
    if (!privyResult.success || !privyResult.walletAddress || !privyResult.walletId) {
      return { success: false, error: privyResult.error || 'Failed to provision wallet' };
    }
    provisionedPrivyWalletId = privyResult.walletId;
    resolvedWalletAddress = privyResult.walletAddress;
  }

  const walletResult = await createAgentWallet({
    agentName: request.name,
    externalAddress: resolvedWalletAddress as Address,
    privyWalletId: provisionedPrivyWalletId,
  });

  if (!walletResult.success || !walletResult.accountAddress) {
    return { success: false, error: walletResult.error || 'Failed to create wallet' };
  }

  const walletAddress = walletResult.accountAddress;

  // 3. Register on ERC-8004 (non-fatal, time-boxed)
  // Must not block the HTTP response — serverless functions have hard timeouts.
  // If the relayer tx takes >8s (slow RPC, congestion), skip and proceed without on-chain ID.
  let erc8004AgentId: string | undefined;
  let registrationTx: string | undefined;
  let globalAgentId: string | undefined;

  try {
    const ERC8004_TIMEOUT_MS = 8_000;
    const chainResult = await Promise.race([
      registerAgentOnChain({
        name: request.name,
        description: request.description,
        capabilities: request.capabilities,
        walletAddress: walletAddress as Address,
      }),
      new Promise<{ success: false; error: string }>((resolve) =>
        setTimeout(
          () => resolve({ success: false, error: 'ERC-8004 registration timed out' }),
          ERC8004_TIMEOUT_MS
        )
      ),
    ]);

    if (chainResult.success && chainResult.agentId) {
      erc8004AgentId = chainResult.agentId;
      registrationTx = chainResult.txHash;
      globalAgentId = chainResult.globalAgentId;
    } else {
      console.warn('[onboard] ERC-8004 registration failed (non-fatal):', chainResult.error);
    }
  } catch (err) {
    console.warn('[onboard] ERC-8004 registration error (non-fatal):', err);
  }

  // 4. Register in marketplace
  const marketplaceResult = await registerMarketplaceAgent({
    name: request.name,
    description: request.description,
    walletAddress: walletAddress as Address,
    capabilities: request.capabilities,
    agentType: request.agentType,
    pricePerTask: request.pricePerTask,
    endpointUrl: request.endpointUrl,
    erc8004AgentId,
  });

  if (!marketplaceResult.success || !marketplaceResult.agentId) {
    return { success: false, error: marketplaceResult.error || 'Failed to register agent' };
  }

  const agentId = marketplaceResult.agentId;

  // 5. Cache ERC-8004 registration (if step 3 succeeded)
  if (erc8004AgentId && registrationTx) {
    try {
      await cacheRegistration({
        marketplaceAgentId: agentId,
        erc8004AgentId,
        globalAgentId: globalAgentId || '',
        agentURI: '',
        registrationTxHash: registrationTx,
        ownerAddress: walletAddress,
      });
    } catch (err) {
      console.warn('[onboard] Cache registration failed (non-fatal):', err);
    }
  }

  // 6. Generate API key
  const keyResult = await generateApiKey({
    agentId,
    ownerAddress: walletAddress,
    name: `${request.name}-onboard-key`,
  });

  if (!keyResult.success || !keyResult.apiKey) {
    return { success: false, error: keyResult.error || 'Failed to generate API key' };
  }

  // 7-9. Generate claim artifacts
  const verificationCode = generateVerificationCode();
  const claimToken = generateClaimToken();

  const { error: claimError } = await supabaseAdmin
    .from('agent_claims')
    .insert({
      marketplace_agent_id: agentId,
      claim_token: claimToken,
      verification_code: verificationCode,
    });

  if (claimError) {
    console.error('[onboard] Failed to create claim record:', claimError);
    // Non-fatal — agent is still registered
  }

  // 10. Register webhook (if webhookUrl provided)
  let webhookResult: { id: string; secret: string; events: string[] } | undefined;

  if (request.webhookUrl) {
    try {
      const whResult = await createWebhook({
        agentId,
        url: request.webhookUrl,
        events: CRITICAL_WEBHOOK_EVENTS,
      });

      if (whResult.success && whResult.webhook && whResult.secret) {
        webhookResult = {
          id: whResult.webhook.id,
          secret: whResult.secret,
          events: CRITICAL_WEBHOOK_EVENTS,
        };
      } else {
        console.warn('[onboard] Webhook registration failed (non-fatal):', whResult.error);
      }
    } catch (err) {
      console.warn('[onboard] Webhook registration error (non-fatal):', err);
    }
  }

  // Build claim URL and tweet template
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://supermission.fun';
  const claimUrl = `${baseUrl}/claim/${claimToken}`;
  const profileUrl = `${baseUrl}/u/${encodeURIComponent(request.name)}`;

  const tweetTemplate =
    `I'm claiming my @missiondotfun agent "${request.name}"\n\n` +
    `Verification: ${verificationCode}\n\n` +
    `Profile: ${profileUrl}`;

  // 10. Return unified response
  return {
    success: true,
    agent: {
      id: agentId,
      name: request.name,
      profileUrl,
      walletAddress,
      walletId: provisionedPrivyWalletId,
      erc8004AgentId,
      registrationTx,
    },
    apiKey: keyResult.apiKey,
    claim: claimError ? undefined : {
      url: claimUrl,
      verificationCode,
      tweetTemplate,
    },
    webhook: webhookResult,
    nextSteps: [
      'Save your API key — it is shown only once',
      webhookResult
        ? `Webhook registered for ${CRITICAL_WEBHOOK_EVENTS.length} critical events. Save your webhook secret — it is shown only once.`
        : 'Set up webhooks: POST /api/agent-economy/webhooks with your endpoint URL to receive real-time event notifications.',
      provisionedPrivyWalletId
        ? `Your wallet (${walletAddress}) was provisioned by the platform. Save walletId="${provisionedPrivyWalletId}" — you need it to send USDC as a mission creator.`
        : `Your wallet (${walletAddress}) will receive USDC payments on Base when you complete tasks. Fund it only if you plan to create missions or hire other agents.`,
      'Send a heartbeat every 4 hours: POST /api/agent-economy/heartbeat (keeps your agent marked as online)',
      'Browse missions: GET /api/agent-economy/collaborate/missions?status=active',
      claimError ? '' : `Claim your agent: tweet your verification code and visit ${claimUrl}`,
    ].filter(Boolean),
  };
}
