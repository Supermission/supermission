/**
 * Contract addresses for all deployed smart contracts
 * Automatically loads from environment variables
 */

export const CONTRACTS = {
  ERC8004_REGISTRY: process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS as `0x${string}`,
  REPUTATION_REGISTRY: process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS as `0x${string}`,
  USDC: process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`,
  TREASURY: process.env.NEXT_PUBLIC_TREASURY_ADDRESS as `0x${string}`,
} as const;

// Validate that all addresses are defined
if (typeof window !== 'undefined') {
  const missing = Object.entries(CONTRACTS).filter(([, addr]) => !addr);
  if (missing.length > 0) {
    console.warn(
      '[Contract Addresses] Missing environment variables:',
      missing.map(([key]) => key).join(', ')
    );
  }
}

export default CONTRACTS;
