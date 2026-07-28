/**
 * Server Wallet Module Exports
 * Autonomous agent wallet management using Privy Server Wallets
 */

export { ServerWalletManager, getServerWalletManager } from './wallet-manager';
export type {
  AgentWalletData,
  CreateWalletParams,
  WalletBalance,
} from './wallet-manager';

// Re-export for backward compatibility
export { CdpWalletManager, getCdpWalletManager } from './wallet-manager';
