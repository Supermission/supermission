/**
 * Transaction Safety Checks
 * Risk management for high-value DeFi operations
 */

export interface TransactionSafetyCheck {
  shouldProceed: boolean;
  warning?: string;
  requiresConfirmation: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface TransactionContext {
  operation: string;
  amount: number;
  amountUSD: number;
  tokenSymbol: string;
  portfolioValueUSD: number;
  recipient?: string;
}

/**
 * Check transaction safety based on amount and portfolio value
 */
export function checkTransactionSafety(context: TransactionContext): TransactionSafetyCheck {
  const { operation, amountUSD, tokenSymbol, portfolioValueUSD } = context;

  // Calculate percentage of portfolio
  const amountPercent = portfolioValueUSD > 0 ? (amountUSD / portfolioValueUSD) * 100 : 0;

  // Critical: >50% of portfolio
  if (amountPercent > 50) {
    return {
      shouldProceed: false,
      warning: `⚠️ CRITICAL: This transaction is ${amountPercent.toFixed(1)}% of your portfolio ($${amountUSD.toFixed(2)} of $${portfolioValueUSD.toFixed(2)}). Please review carefully.`,
      requiresConfirmation: true,
      riskLevel: 'critical',
    };
  }

  // High: >20% of portfolio
  if (amountPercent > 20) {
    return {
      shouldProceed: false,
      warning: `⚠️ HIGH RISK: This transaction is ${amountPercent.toFixed(1)}% of your portfolio. Confirm to proceed.`,
      requiresConfirmation: true,
      riskLevel: 'high',
    };
  }

  // Medium: Swapping large amount of stablecoins to volatile assets
  if (
    operation === 'swap' &&
    isStablecoin(tokenSymbol) &&
    amountPercent > 10
  ) {
    return {
      shouldProceed: false,
      warning: `⚠️ MEDIUM RISK: Swapping ${amountPercent.toFixed(1)}% of portfolio from stablecoins to volatile assets. Confirm to proceed.`,
      requiresConfirmation: true,
      riskLevel: 'medium',
    };
  }

  // Low risk: Normal operations
  return {
    shouldProceed: true,
    requiresConfirmation: false,
    riskLevel: 'low',
  };
}

/**
 * Check if a token is a stablecoin
 */
function isStablecoin(symbol: string): boolean {
  const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'LUSD', 'USDP'];
  return stablecoins.includes(symbol.toUpperCase());
}

/**
 * Spending limits configuration
 */
export const SPENDING_LIMITS = {
  maxPerTransaction: 10000, // $10,000 max per transaction
  maxPerDay: 50000, // $50,000 max per day
  maxPerWeek: 200000, // $200,000 max per week
};

/**
 * Check if transaction exceeds spending limits
 */
export function checkSpendingLimits(
  amountUSD: number,
  dailySpentUSD: number = 0,
  weeklySpentUSD: number = 0
): TransactionSafetyCheck {
  // Check per-transaction limit
  if (amountUSD > SPENDING_LIMITS.maxPerTransaction) {
    return {
      shouldProceed: false,
      warning: `Transaction amount ($${amountUSD.toFixed(2)}) exceeds maximum per-transaction limit ($${SPENDING_LIMITS.maxPerTransaction}).`,
      requiresConfirmation: true,
      riskLevel: 'critical',
    };
  }

  // Check daily limit
  if (dailySpentUSD + amountUSD > SPENDING_LIMITS.maxPerDay) {
    return {
      shouldProceed: false,
      warning: `This transaction would exceed your daily spending limit ($${SPENDING_LIMITS.maxPerDay}). Already spent: $${dailySpentUSD.toFixed(2)}.`,
      requiresConfirmation: true,
      riskLevel: 'high',
    };
  }

  // Check weekly limit
  if (weeklySpentUSD + amountUSD > SPENDING_LIMITS.maxPerWeek) {
    return {
      shouldProceed: false,
      warning: `This transaction would exceed your weekly spending limit ($${SPENDING_LIMITS.maxPerWeek}). Already spent: $${weeklySpentUSD.toFixed(2)}.`,
      requiresConfirmation: true,
      riskLevel: 'high',
    };
  }

  return {
    shouldProceed: true,
    requiresConfirmation: false,
    riskLevel: 'low',
  };
}

/**
 * Validate recipient address for transfers
 */
export function validateRecipient(address: string): TransactionSafetyCheck {
  // Check for zero address
  if (address === '0x0000000000000000000000000000000000000000') {
    return {
      shouldProceed: false,
      warning: '⛔ INVALID: Cannot send to zero address.',
      requiresConfirmation: false,
      riskLevel: 'critical',
    };
  }

  // Check if address is valid format
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    return {
      shouldProceed: false,
      warning: '⛔ INVALID: Recipient address format is invalid.',
      requiresConfirmation: false,
      riskLevel: 'critical',
    };
  }

  return {
    shouldProceed: true,
    requiresConfirmation: false,
    riskLevel: 'low',
  };
}

/**
 * Check slippage tolerance for swaps
 */
export function checkSlippage(slippagePercent: number): TransactionSafetyCheck {
  if (slippagePercent > 5) {
    return {
      shouldProceed: false,
      warning: `⚠️ HIGH SLIPPAGE: ${slippagePercent}% slippage tolerance is very high. You may lose significant value.`,
      requiresConfirmation: true,
      riskLevel: 'high',
    };
  }

  if (slippagePercent > 1) {
    return {
      shouldProceed: false,
      warning: `⚠️ MEDIUM SLIPPAGE: ${slippagePercent}% slippage tolerance. Confirm to proceed.`,
      requiresConfirmation: true,
      riskLevel: 'medium',
    };
  }

  return {
    shouldProceed: true,
    requiresConfirmation: false,
    riskLevel: 'low',
  };
}
