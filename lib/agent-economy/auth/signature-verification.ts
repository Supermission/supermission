/**
 * Wallet Signature Verification for API Key Creation
 * Ensures only the wallet owner can create API keys
 */

import { verifyMessage, recoverMessageAddress, type Address } from 'viem';

export interface SignatureVerificationRequest {
  ownerAddress: string;
  message: string;
  signature: string;
}

export interface SignatureVerificationResult {
  success: boolean;
  error?: string;
  recoveredAddress?: string;
}

/**
 * Verify that a signature was created by the claimed owner address
 * 
 * @param ownerAddress - The claimed owner's wallet address
 * @param message - The message that was signed
 * @param signature - The signature to verify
 * @returns Verification result with recovered address
 */
export async function verifyWalletSignature({
  ownerAddress,
  message,
  signature,
}: SignatureVerificationRequest): Promise<SignatureVerificationResult> {
  try {
    // Normalize addresses for comparison
    const normalizedOwner = ownerAddress.toLowerCase();

    // Recover the address that created this signature
    const recoveredAddress = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });

    const normalizedRecovered = recoveredAddress.toLowerCase();

    // Verify the recovered address matches the claimed owner
    if (normalizedRecovered !== normalizedOwner) {
      return {
        success: false,
        error: `Signature verification failed. Expected ${normalizedOwner}, got ${normalizedRecovered}`,
        recoveredAddress: normalizedRecovered,
      };
    }

    return {
      success: true,
      recoveredAddress: normalizedRecovered,
    };
  } catch (error) {
    console.error('[Signature Verification] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Signature verification failed',
    };
  }
}

/**
 * Generate a standard message for signing to create an API key
 * This prevents signature replay across different contexts
 * 
 * @param ownerAddress - The wallet address requesting the key
 * @param timestamp - Unix timestamp (seconds) when the request was created
 * @returns The message to sign
 */
export function generateApiKeySigningMessage(
  ownerAddress: string,
  timestamp: number
): string {
  return `Sign this message to create an API key for Supermission.

Address: ${ownerAddress}
Timestamp: ${timestamp}

This signature will be used only for API key creation and cannot be replayed.`;
}

/**
 * Validate that the timestamp is recent (within 5 minutes)
 * Prevents replay attacks with old signatures
 * 
 * @param timestamp - Unix timestamp (seconds) to validate
 * @returns true if timestamp is recent, false otherwise
 */
export function validateTimestamp(timestamp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const maxAge = 5 * 60; // 5 minutes in seconds
  
  // Check if timestamp is not in the future
  if (timestamp > now + 60) {
    return false;
  }
  
  // Check if timestamp is not too old
  if (now - timestamp > maxAge) {
    return false;
  }
  
  return true;
}
