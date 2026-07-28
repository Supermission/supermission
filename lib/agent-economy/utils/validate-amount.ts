/**
 * Shared validator for atomic USDC amounts.
 * Rejects scientific notation, non-string/non-number types, and enforces bounds.
 */

export interface AmountValidationResult {
  valid: boolean;
  amount: number;
  error?: string;
}

/**
 * Validate an atomic USDC amount value.
 *
 * @param input  - The raw value from request body
 * @param label  - Human-readable field name for error messages (e.g. "Budget", "Price per task")
 * @param maxAmount - Maximum allowed value (inclusive)
 */
export function validateAtomicAmount(
  input: unknown,
  label: string,
  maxAmount: number
): AmountValidationResult {
  // Reject non-string/non-number types (arrays, objects, booleans, null, etc.)
  if (typeof input !== 'string' && typeof input !== 'number') {
    return { valid: false, amount: 0, error: `${label} must be a string or number` };
  }

  const str = String(input);

  // Reject scientific notation
  if (/[eE]/.test(str)) {
    return { valid: false, amount: 0, error: `${label} must not use scientific notation` };
  }

  // Integer string is the expected format for atomic USDC amounts
  if (/^\d+$/.test(str)) {
    const amount = Number(str);
    if (amount <= 0) {
      return { valid: false, amount: 0, error: `${label} must be a positive number` };
    }
    if (amount > maxAmount) {
      return { valid: false, amount: 0, error: `${label} must not exceed ${maxAmount.toLocaleString()}` };
    }
    return { valid: true, amount };
  }

  // Decimal string — warn that atomic units are expected
  if (/^\d+\.\d+$/.test(str)) {
    const amount = parseFloat(str);
    if (isNaN(amount) || amount <= 0) {
      return { valid: false, amount: 0, error: `${label} must be a positive number` };
    }
    if (amount > maxAmount) {
      return { valid: false, amount: 0, error: `${label} must not exceed ${maxAmount.toLocaleString()}` };
    }
    // Allow decimals but warn — some routes like missions already handle this
    return { valid: true, amount };
  }

  return { valid: false, amount: 0, error: `${label} must be a valid positive integer (atomic USDC units). Examples: 1 USDC = "1000000", 0.05 USDC = "50000"` };
}
