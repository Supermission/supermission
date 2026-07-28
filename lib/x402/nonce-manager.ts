import { keccak256, encodePacked, type Address } from 'viem';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/client';


/**
 * Generates a unique cryptographic nonce for EIP-3009 authorization
 *
 * The nonce ensures that each authorization is unique and prevents replay attacks.
 * Format: keccak256(userAddress + timestamp + cryptoRandom)
 *
 * @param userAddress - The address of the user creating the authorization
 * @returns A unique 32-byte nonce as a hex string
 */
export function generateNonce(userAddress: Address): `0x${string}` {
  const timestamp = BigInt(Date.now());
  const randomValue = BigInt('0x' + randomBytes(16).toString('hex'));

  return keccak256(
    encodePacked(
      ['address', 'uint256', 'uint256'],
      [userAddress, timestamp, randomValue]
    )
  );
}

/**
 * Marks a nonce as used in the database to prevent replay attacks
 * This replaces the old in-memory Set with persistent database storage
 *
 * @param nonce - The nonce to mark as used
 * @param userAddress - The address that used this nonce
 * @returns true if successfully marked, false if nonce was already used
 */
export async function markNonceUsed(
  nonce: string,
  userAddress: string
): Promise<boolean> {
  try {
    const normalizedNonce = nonce.toLowerCase();
    const normalizedAddress = userAddress.toLowerCase();

    // Insert nonce into database
    // If nonce already exists, this will fail due to UNIQUE constraint
    const { error } = await supabaseAdmin
      .from('x402_nonces')
      .insert({
        nonce: normalizedNonce,
        user_address: normalizedAddress,
      });

    if (error) {
      // Check if error is due to duplicate nonce
      if (error.code === '23505') {
        // PostgreSQL unique violation error code
        console.warn(`[Nonce Manager] Duplicate nonce detected: ${normalizedNonce}`);
        return false;
      }
      console.error('[Nonce Manager] Error marking nonce as used:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Nonce Manager] Exception marking nonce as used:', error);
    return false;
  }
}

/**
 * Checks if a nonce has been used (exists in database)
 *
 * @param nonce - The nonce to check
 * @returns true if the nonce has been used, false otherwise
 */
export async function isNonceUsed(nonce: string): Promise<boolean> {
  try {
    const normalizedNonce = nonce.toLowerCase();

    const { data, error } = await supabaseAdmin
      .from('x402_nonces')
      .select('nonce')
      .eq('nonce', normalizedNonce)
      .single();

    if (error) {
      // If no row found, nonce is not used
      if (error.code === 'PGRST116') {
        return false;
      }
      console.error('[Nonce Manager] Error checking nonce:', error);
      return false; // Assume not used on error (fail open for availability)
    }

    return !!data;
  } catch (error) {
    console.error('[Nonce Manager] Exception checking nonce:', error);
    return false; // Assume not used on error
  }
}

/**
 * Clears old nonces from the database (cleanup utility)
 * Removes nonces older than the specified number of days
 * 
 * @param daysOld - Number of days to keep (default: 30)
 * @returns Number of nonces deleted
 */
export async function cleanupOldNonces(daysOld: number = 30): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { data, error } = await supabaseAdmin
      .from('x402_nonces')
      .delete()
      .lt('used_at', cutoffDate.toISOString())
      .select('nonce');

    if (error) {
      console.error('[Nonce Manager] Error cleaning up old nonces:', error);
      return 0;
    }

    const deletedCount = data?.length || 0;
    console.log(`[Nonce Manager] Cleaned up ${deletedCount} old nonces`);
    return deletedCount;
  } catch (error) {
    console.error('[Nonce Manager] Exception cleaning up old nonces:', error);
    return 0;
  }
}

/**
 * Get statistics about nonce usage
 * Useful for monitoring and debugging
 */
export async function getNonceStats(): Promise<{
  total: number;
  last24Hours: number;
  uniqueAddresses: number;
}> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Get total count
    const { count: total } = await supabaseAdmin
      .from('x402_nonces')
      .select('*', { count: 'exact', head: true });

    // Get count from last 24 hours
    const { count: last24Hours } = await supabaseAdmin
      .from('x402_nonces')
      .select('*', { count: 'exact', head: true })
      .gte('used_at', yesterday.toISOString());

    // Get unique addresses
    const { data: addresses } = await supabaseAdmin
      .from('x402_nonces')
      .select('user_address')
      .limit(10000); // Reasonable limit for stats

    const uniqueAddresses = new Set(
      addresses?.map((row: { user_address: string }) => row.user_address) || []
    ).size;

    return {
      total: total || 0,
      last24Hours: last24Hours || 0,
      uniqueAddresses,
    };
  } catch (error) {
    console.error('[Nonce Manager] Error getting nonce stats:', error);
    return { total: 0, last24Hours: 0, uniqueAddresses: 0 };
  }
}
