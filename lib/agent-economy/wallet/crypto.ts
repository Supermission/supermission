/**
 * Server Wallet - Cryptographic Utilities
 * Handles encryption/decryption of account keys and password hashing
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { Address } from 'viem';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Generate a new Ethereum account (private key + address)
 */
export function generateAccount(): {
  privateKey: `0x${string}`;
  address: Address;
} {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    privateKey,
    address: account.address,
  };
}

/**
 * Generate a secure random agent key (used for authentication)
 */
export function generateAgentKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash an agent key for storage (using scrypt)
 */
export function hashAgentKey(agentKey: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(agentKey, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify an agent key against its hash
 */
export function verifyAgentKey(agentKey: string, storedHash: string): boolean {
  try {
    const [saltHex, hashHex] = storedHash.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const storedHashBuffer = Buffer.from(hashHex, 'hex');
    const hash = scryptSync(agentKey, salt, 64);
    return hash.equals(storedHashBuffer);
  } catch {
    return false;
  }
}

/**
 * Derive encryption key from agent key
 */
function deriveKey(agentKey: string, salt: Buffer): Buffer {
  return scryptSync(agentKey, salt, KEY_LENGTH);
}

/**
 * Encrypt a private key with the agent key
 */
export function encryptPrivateKey(
  privateKey: `0x${string}`,
  agentKey: string
): { encryptedKey: string; iv: string; salt: string } {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(agentKey, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedKey: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
  };
}

/**
 * Decrypt a private key with the agent key
 */
export function decryptPrivateKey(
  encryptedKey: string,
  iv: string,
  salt: string,
  agentKey: string
): `0x${string}` {
  const ivBuffer = Buffer.from(iv, 'hex');
  const saltBuffer = Buffer.from(salt, 'hex');
  const key = deriveKey(agentKey, saltBuffer);

  const encryptedBuffer = Buffer.from(encryptedKey, 'base64');
  const authTag = encryptedBuffer.subarray(-AUTH_TAG_LENGTH);
  const ciphertext = encryptedBuffer.subarray(0, -AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8') as `0x${string}`;
}

/**
 * Generate a random nonce for EIP-3009
 */
export function generateNonce(): `0x${string}` {
  return `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
}

/**
 * Sanitize sensitive data from memory (best effort)
 */
export function clearSensitiveData(data: unknown): void {
  if (typeof data === 'string') {
    // In JavaScript, strings are immutable and we can't truly clear them
    // This is a best-effort approach
    return;
  }
  if (Buffer.isBuffer(data)) {
    data.fill(0);
  }
  if (typeof data === 'object' && data !== null) {
    for (const key of Object.keys(data)) {
      clearSensitiveData((data as Record<string, unknown>)[key]);
      delete (data as Record<string, unknown>)[key];
    }
  }
}
