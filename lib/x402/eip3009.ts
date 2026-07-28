import { encodeFunctionData, getAddress, parseSignature, type Address } from 'viem';
import { generateNonce } from './nonce-manager';

/**
 * EIP-3009 transferWithAuthorization ABI
 * Allows token transfers via signed authorization instead of approve + transferFrom
 */
export const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

/**
 * EIP-712 domain and message types for EIP-3009
 */
export interface EIP3009AuthParams {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: {
    TransferWithAuthorization: Array<{ name: string; type: string }>;
  };
  message: {
    from: Address;
    to: Address;
    value: bigint;
    validAfter: number;
    validBefore: number;
    nonce: `0x${string}`;
  };
  primaryType: 'TransferWithAuthorization';
}

/**
 * Creates EIP-712 typed data for EIP-3009 transferWithAuthorization
 *
 * @param from - Address of the token holder (user's wallet)
 * @param to - Address of the recipient
 * @param value - Amount of tokens to transfer (in wei)
 * @param tokenAddress - Address of the EIP-3009 compliant token contract (default: USDC Base Mainnet)
 * @param chainId - Chain ID (default: 8453 for Base Mainnet)
 * @param validityDuration - How long the authorization is valid in seconds (default: 1 hour)
 * @returns EIP-712 typed data ready for signing
 */
export function createEIP3009Authorization(
  from: Address,
  to: Address,
  value: bigint,
  tokenAddress: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC Base Mainnet
  chainId: number = 8453,
  validityDuration: number = 3600 // 1 hour
): EIP3009AuthParams {
  // Normalize all addresses to checksummed format for consistent EIP-712 hashing
  const normalizedFrom = getAddress(from);
  const normalizedTo = getAddress(to);
  const normalizedToken = getAddress(tokenAddress);

  const nonce = generateNonce(normalizedFrom);
  const validAfter = 0; // Valid immediately
  const validBefore = Math.floor(Date.now() / 1000) + validityDuration;

  return {
    domain: {
      name: 'USD Coin', // USDC's official EIP-712 domain name
      version: '2',
      chainId,
      verifyingContract: normalizedToken,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    message: {
      from: normalizedFrom,
      to: normalizedTo,
      value,
      validAfter,
      validBefore,
      nonce,
    },
    primaryType: 'TransferWithAuthorization',
  };
}

/**
 * Encodes a transferWithAuthorization function call with signature
 *
 * @param authParams - The EIP-712 authorization parameters
 * @param v - ECDSA signature v parameter
 * @param r - ECDSA signature r parameter
 * @param s - ECDSA signature s parameter
 * @returns Encoded function call data ready for transaction
 */
export function encodeTransferWithAuthorization(
  authParams: EIP3009AuthParams,
  v: number,
  r: `0x${string}`,
  s: `0x${string}`
): `0x${string}` {
  return encodeFunctionData({
    abi: TRANSFER_WITH_AUTHORIZATION_ABI,
    functionName: 'transferWithAuthorization',
    args: [
      authParams.message.from,
      authParams.message.to,
      authParams.message.value,
      BigInt(authParams.message.validAfter),
      BigInt(authParams.message.validBefore),
      authParams.message.nonce,
      v,
      r,
      s,
    ],
  });
}

/**
 * Helper to split a hex signature into v, r, s components
 *
 * @param signature - The full signature hex string (0x...)
 * @returns Object containing v, r, s components
 */
export function splitSignature(signature: `0x${string}`): {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
} {
  // Remove 0x prefix if present
  const sig = signature.startsWith('0x') ? signature.slice(2) : signature;

  if (sig.length !== 130) {
    throw new Error(`Invalid signature length: ${sig.length}, expected 130 hex characters`);
  }

  const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
  const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
  let v = parseInt(sig.slice(128, 130), 16);

  // Normalize v value - some wallets return 0/1 instead of 27/28
  if (v < 27) {
    v += 27;
  }

  return { v, r, s };
}

/**
 * Manually recovers the signer address for USDC TransferWithAuthorization
 * 
 * USDC v2 uses an EIP-712 implementation that predates the standard's sorting requirement.
 * It expects the TypeHash and Values to be encoded in Declaration Order (Unsorted),
 * whereas modern libraries (viem, ethers v6) mandate alphabetical sorting.
 */
export async function recoverUSDCAuthorizationSignature(
  authParams: EIP3009AuthParams,
  signature: `0x${string}`
): Promise<Address> {
  const { keccak256, encodeAbiParameters, stringToBytes, concat, recoverAddress } = await import('viem');

  // 1. Calculate Domain Separator manually to ensure exact match
  const domainTypeHash = keccak256(stringToBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'));
  const domainSeparator = keccak256(encodeAbiParameters(
    [
      { name: 'typeHash', type: 'bytes32' },
      { name: 'name', type: 'bytes32' },
      { name: 'version', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    [
      domainTypeHash,
      keccak256(stringToBytes(authParams.domain.name)),
      keccak256(stringToBytes(authParams.domain.version)),
      BigInt(authParams.domain.chainId),
      authParams.domain.verifyingContract,
    ]
  ));

  // 2. Calculate Struct Hash (declaration order matching USDC's on-chain implementation)
  const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(stringToBytes("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"));

  const structHash = keccak256(encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'address' },
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'bytes32' },
    ],
    [
      TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
      authParams.message.from,
      authParams.message.to,
      authParams.message.value,
      BigInt(authParams.message.validAfter),
      BigInt(authParams.message.validBefore),
      authParams.message.nonce,
    ]
  ));

  // 3. Final Digest: keccak256(\x19\x01 || domainSeparator || structHash)
  // Must use raw byte concatenation (packed encoding), NOT ABI encoding
  const digest = keccak256(concat([
    '0x1901' as `0x${string}`,
    domainSeparator,
    structHash,
  ]));

  // 4. Recover Address
  return recoverAddress({ hash: digest, signature });
}
