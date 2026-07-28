/**
 * Auth Module - Main Export
 */

// Middleware functions
export {
  extractApiKey,
  hashApiKey,
  validateApiKey,
  checkRateLimit,
  checkPermissions,
  logRequest,
  authenticateRequest,
  createAuthErrorResponse,
  safeParseJson,
  withAuth,
  // New agentic helpers
  generateRequestId,
  addRateLimitHeaders,
  addAgenticHeaders,
  type AuthContext,
  type AuthResult,
  type RateLimitInfo,
} from './middleware';

// Service-role helper
export { requireServiceRole } from './service-role';

// API Key management functions
export {
  generateApiKey,
  revokeApiKey,
  listApiKeys,
  getApiKey,
  updateApiKey,
  type ApiKey,
  type GenerateApiKeyRequest,
  type GenerateApiKeyResult,
} from './api-key';

// Signature verification functions
export {
  verifyWalletSignature,
  generateApiKeySigningMessage,
  validateTimestamp,
  type SignatureVerificationRequest,
  type SignatureVerificationResult,
} from './signature-verification';
