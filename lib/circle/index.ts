/**
 * Circle Platform Integration — barrel export.
 *
 * All features are gated behind NEXT_PUBLIC_CIRCLE_ENABLED + per-feature flags.
 * When Circle is not configured, all functions return null/false gracefully.
 */

export { CIRCLE_CONFIG, isCircleFeatureEnabled } from './config';
export { circleRequest } from './client';

// Nanopayments (x402)
export { shouldUseNanopayments, checkBatchingSupport, verifyBatchPayment, settleBatchPayment } from './nanopayments';
export type { NanopaymentVerifyResult, NanopaymentSettleResult } from './nanopayments';

// CCTP Bridge
export { shouldUseCircleBridge, isCCTPSupported, chainIdToBridgeChain, executeBridge } from './bridge';
export type { CircleBridgeParams, CircleBridgeResult } from './bridge';

// Compliance
export { screenAddress, isAddressSafe, chainIdToCircleChain } from './compliance';
export type { ScreeningResult, RiskLevel } from './compliance';

// Gas Station
export { shouldUseGasStation, estimateGasInUSDC } from './gas-station';

// Gateway
export { isGatewayEnabled, getUnifiedBalance, getDepositAddress } from './gateway';
export type { UnifiedBalance, DepositAddress } from './gateway';

// Webhooks
export { verifyWebhookSignature, processWebhookEvent } from './webhooks';
export type { CircleWebhookEvent, CircleWebhookPayload } from './webhooks';

// USYC
export { isUSYCEnabled, getUSYCInfo, USYC_ADDRESSES } from './usyc';
export type { USYCInfo } from './usyc';
