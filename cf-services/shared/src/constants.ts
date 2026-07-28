/**
 * Shared constants for Cloudflare services
 */

// Webhook delivery settings
export const WEBHOOK_MAX_ATTEMPTS = 5;
export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_BASE_DELAY_SECONDS = 30;

// Payment workflow settings
export const PAYMENT_RPC_TIMEOUT_MS = 60_000;
export const PAYMENT_SIGN_TIMEOUT_MS = 30_000;
export const PAYMENT_MAX_RETRIES = 3;
export const PAYMENT_SETTLE_MAX_RETRIES = 5;

// Negotiation settings
export const NEGOTIATION_MAX_MESSAGE_LENGTH = 5000;
export const NEGOTIATION_MAX_CONNECTIONS_PER_ROOM = 10;

// Base chain config
export const BASE_CHAIN_ID = 8453; 

// USDC contract on Base
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
