/**
 * Agent Economy Platform - Main Export
 *
 * This file carefully exports to avoid duplicate type conflicts.
 * Types are exported only from './types', functions from their modules.
 */

// ==========================================
// Core Types (single source of truth)
// ==========================================
export * from './types';

// ==========================================
// Constants
// ==========================================
export {
  CHAIN_ID,
  CHAIN_ID_TESTNET,
  USDC_ADDRESS,
  BOUNTY_ESCROW_ADDRESS,
  DEFAULT_POLICY,
  REPUTATION_TIERS,
  getReputationTier,
  PLATFORM_FEES,
  AGENT_CATEGORIES,
  COMPETITION_CATEGORIES,
  VALIDATION,
  EIP712_DOMAIN,
  API_BASE_URL,
  API_ENDPOINTS,
} from './constants';

// ==========================================
// Server Wallet Functions (deprecated — module removed)
// ==========================================

// ==========================================
// x402 Payment Functions
// ==========================================
export {
  createPaymentRequirements,
  createPaymentRequiredMessage,
  generatePaymentHash,
  storePaymentRequirements,
  getPaymentRequirements,
  isPaymentExpired,
  validatePaymentRequirements,
} from './x402/payment-required';

export {
  signPayment,
  createPaymentSubmittedMessage,
  parsePaymentPayload,
  validatePaymentPayload,
} from './x402/sign-payment';

export {
  verifyPayment,
  markPaymentHashUsed,
} from './x402/verify-payment';

export {
  settlePayment,
  createPaymentCompletedMessage,
  getPaymentStatus,
} from './x402/settle-payment';

// ==========================================
// AP2 Mandate Functions
// ==========================================
export {
  createIntentMandate,
  saveIntentMandate,
  getIntentMandate,
  verifyIntentMandate,
  useIntentMandate,
  revokeIntentMandate,
} from './ap2/intent-mandate';

export {
  createCartMandate,
  saveCartMandate,
  getCartMandate,
  verifyCartMandate,
  useCartMandate,
  getUserCartMandates,
} from './ap2/cart-mandate';

export {
  createPaymentMandate,
  getPaymentMandate,
  settlePaymentMandate,
  getAccountabilityChain,
  getUserPaymentMandates,
} from './ap2/payment-mandate';

export {
  verifyMandate,
  getMandateById,
} from './ap2/verify-mandate';

// ==========================================
// ERC-8004 Functions
// ==========================================
export {
  ERC8004_CONTRACTS,
  IDENTITY_REGISTRY_ABI,
  REPUTATION_REGISTRY_ABI,
  getGlobalAgentId,
  parseGlobalAgentId,
  CHAIN_CONFIG,
} from './erc8004/contracts';

export {
  registerAgentOnChain,
  generateRegistrationFile,
  getAgentOnChain,
  getAgentWallet,
  cacheRegistration,
} from './erc8004/register';

export {
  submitOnChainFeedback,
  getOnChainReputation,
  getOnChainFeedback,
  syncReputationToCache,
  getReputationLeaderboard,
  calculateSuccessRate,
  calculateAverageRating,
} from './erc8004/reputation';

// ==========================================
// Marketplace Functions
// ==========================================
export {
  registerMarketplaceAgent,
  listMarketplaceAgents,
  getMarketplaceAgent,
  submitAgentReview,
  getAgentReviews,
} from './marketplace';

// ==========================================
// Collaboration Functions
// ==========================================
export {
  createMission,
  getMission,
  getMissionTasks,
  listMissions,
  joinMission,
  getMissionTeam,
  assignTask,
  completeTask,
  activateMission,
} from './collaborate';

// ==========================================
// Competition Functions
// ==========================================
export {
  createCompetition,
  getCompetition,
  listCompetitions,
  enterCompetition,
  submitEntry,
  getCompetitionEntries,
  scoreEntry,
  finalizeCompetition,
  getLeaderboard,
} from './compete';

