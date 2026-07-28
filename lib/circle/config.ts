// lib/circle/config.ts

/**
 * Circle Platform Configuration
 * All features are gated behind flags — app works identically when Circle is not configured.
 */

export const CIRCLE_CONFIG = {
  enabled: process.env.NEXT_PUBLIC_CIRCLE_ENABLED === 'true',
  apiKey: process.env.CIRCLE_API_KEY || '',

  nanopayments: {
    enabled: process.env.CIRCLE_NANOPAYMENTS_ENABLED === 'true',
    settlementAddress: process.env.CIRCLE_SETTLEMENT_ADDRESS || '',
  },

  bridge: {
    enabled: process.env.CIRCLE_BRIDGE_ENABLED === 'true',
  },

  compliance: {
    enabled: process.env.CIRCLE_COMPLIANCE_ENABLED === 'true',
  },

  gasStation: {
    enabled: process.env.CIRCLE_GAS_STATION_ENABLED === 'true',
    policyId: process.env.CIRCLE_GAS_POLICY_ID || '',
  },

  gateway: {
    enabled: process.env.CIRCLE_GATEWAY_ENABLED === 'true',
  },

  webhooks: {
    secret: process.env.CIRCLE_WEBHOOK_SECRET || '',
  },

  usyc: {
    enabled: process.env.CIRCLE_USYC_ENABLED === 'true',
  },
} as const;

/** Check if a specific Circle feature is available */
export function isCircleFeatureEnabled(
  feature: 'nanopayments' | 'bridge' | 'compliance' | 'gasStation' | 'gateway' | 'usyc'
): boolean {
  if (!CIRCLE_CONFIG.enabled || !CIRCLE_CONFIG.apiKey) return false;
  return CIRCLE_CONFIG[feature].enabled;
}
