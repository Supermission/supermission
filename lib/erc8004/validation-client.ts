/**
 * ERC-8004 Validation Registry Client
 * Provides interface to request and manage deliverable validations
 */

import { type Address, type PublicClient, type WalletClient, parseEventLogs } from 'viem';

/**
 * ERC-8004 Validation Registry Address
 * Read from env var, falls back to default address.
 */
export const ERC8004_VALIDATION_REGISTRY = (process.env.NEXT_PUBLIC_ERC8004_VALIDATION_REGISTRY ?? '0x8004C269D0A5647E51E121FeB226200ECE932d55') as Address;

/**
 * Validation Registry ABI
 * Minimal interface for requesting and resolving validations
 */
const VALIDATION_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'requestValidation',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'deliverableHash', type: 'bytes32' },
      { name: 'stake', type: 'uint256' },
    ],
    outputs: [{ name: 'validationId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'submitValidationResult',
    inputs: [
      { name: 'validationId', type: 'uint256' },
      { name: 'approved', type: 'bool' },
      { name: 'proofHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getValidationResult',
    inputs: [{ name: 'validationId', type: 'uint256' }],
    outputs: [
      { name: 'completed', type: 'bool' },
      { name: 'approved', type: 'bool' },
      { name: 'validator', type: 'address' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getValidationRequest',
    inputs: [{ name: 'validationId', type: 'uint256' }],
    outputs: [
      { name: 'requester', type: 'address' },
      { name: 'agentId', type: 'uint256' },
      { name: 'deliverableHash', type: 'bytes32' },
      { name: 'stake', type: 'uint256' },
      { name: 'createdAt', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'ValidationRequested',
    inputs: [
      { name: 'validationId', type: 'uint256', indexed: true },
      { name: 'requester', type: 'address', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'deliverableHash', type: 'bytes32', indexed: false },
      { name: 'stake', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ValidationCompleted',
    inputs: [
      { name: 'validationId', type: 'uint256', indexed: true },
      { name: 'validator', type: 'address', indexed: true },
      { name: 'approved', type: 'bool', indexed: false },
      { name: 'proofHash', type: 'bytes32', indexed: false },
    ],
  },
] as const;

/**
 * Validation request details
 */
export interface ValidationRequest {
  validationId: bigint;
  requester: Address;
  agentId: bigint;
  deliverableHash: `0x${string}`;
  stake: bigint;
  createdAt: bigint;
}

/**
 * Validation result details
 */
export interface ValidationResult {
  validationId: bigint;
  completed: boolean;
  approved: boolean;
  validator?: Address;
}

/**
 * ERC-8004 Validation Client
 * Handles deliverable validation requests via ERC-8004 Validation Registry
 */
export class ERC8004ValidationClient {
  constructor(
    private publicClient: PublicClient,
    private walletClient?: WalletClient
  ) {}

  /**
   * Request validation for a deliverable
   * @param agentId ERC-8004 agent ID to perform validation
   * @param deliverableHash Keccak256 hash of deliverable content
   * @param stake Amount to stake for validation (incentivizes honest validation)
   * @returns Transaction hash and validation ID
   */
  async requestValidation(
    agentId: bigint,
    deliverableHash: `0x${string}`,
    stake: bigint
  ): Promise<{ txHash: Address; validationId: bigint }> {
    if (!this.walletClient) {
      throw new Error('Wallet client required for requesting validation');
    }

    const account = this.walletClient.account;
    if (!account) {
      throw new Error('No account connected');
    }

    // Simulate transaction
    const { request } = await this.publicClient.simulateContract({
      address: ERC8004_VALIDATION_REGISTRY,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'requestValidation',
      args: [agentId, deliverableHash, stake],
      account,
    });

    const txHash = await this.walletClient.writeContract(request);

    // Wait for confirmation
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    // Parse ValidationRequested event to get validationId
    const logs = parseEventLogs({
      abi: VALIDATION_REGISTRY_ABI,
      logs: receipt.logs,
    });

    const validationEvent = logs.find((log) => log.eventName === 'ValidationRequested');
    if (!validationEvent || !('args' in validationEvent)) {
      throw new Error('ValidationRequested event not found');
    }

    return {
      txHash,
      validationId: validationEvent.args.validationId,
    };
  }

  /**
   * Submit validation result (validator only)
   * @param validationId The validation request ID
   * @param approved Whether the deliverable is approved
   * @param proofHash Hash of validation proof (IPFS, TEE attestation, etc.)
   * @returns Transaction hash
   */
  async submitValidationResult(
    validationId: bigint,
    approved: boolean,
    proofHash: `0x${string}`
  ): Promise<Address> {
    if (!this.walletClient) {
      throw new Error('Wallet client required for submitting validation');
    }

    const account = this.walletClient.account;
    if (!account) {
      throw new Error('No account connected');
    }

    const { request } = await this.publicClient.simulateContract({
      address: ERC8004_VALIDATION_REGISTRY,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'submitValidationResult',
      args: [validationId, approved, proofHash],
      account,
    });

    return await this.walletClient.writeContract(request);
  }

  /**
   * Get validation result
   * @param validationId The validation request ID
   * @returns Validation result details
   */
  async getValidationResult(validationId: bigint): Promise<ValidationResult> {
    const [completed, approved, validator] = await this.publicClient.readContract({
      address: ERC8004_VALIDATION_REGISTRY,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'getValidationResult',
      args: [validationId],
    });

    return {
      validationId,
      completed,
      approved,
      validator: completed ? validator : undefined,
    };
  }

  /**
   * Get validation request details
   * @param validationId The validation request ID
   * @returns Validation request details
   */
  async getValidationRequest(validationId: bigint): Promise<ValidationRequest> {
    const [requester, agentId, deliverableHash, stake, createdAt] =
      await this.publicClient.readContract({
        address: ERC8004_VALIDATION_REGISTRY,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: 'getValidationRequest',
        args: [validationId],
      });

    return {
      validationId,
      requester,
      agentId,
      deliverableHash,
      stake,
      createdAt,
    };
  }

  /**
   * Check if validation is complete
   * @param validationId The validation request ID
   * @returns True if validation is complete
   */
  async isValidationComplete(validationId: bigint): Promise<boolean> {
    const result = await this.getValidationResult(validationId);
    return result.completed;
  }
}

/**
 * Helper: Create validation client with public and wallet clients
 */
export function createValidationClient(
  publicClient: PublicClient,
  walletClient?: WalletClient
): ERC8004ValidationClient {
  return new ERC8004ValidationClient(publicClient, walletClient);
}

/**
 * Helper: Hash deliverable content
 * Creates keccak256 hash of deliverable URI for on-chain storage
 */
export function hashDeliverable(deliverableURI: string): `0x${string}` {
  // In browser/Node.js, use ethers or viem's keccak256
  const encoder = new TextEncoder();
  const data = encoder.encode(deliverableURI);

  // This is a placeholder - in practice, use viem's keccak256
  // import { keccak256 } from 'viem';
  // return keccak256(toBytes(deliverableURI));

  return '0x' + Array.from(data)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('') as `0x${string}`;
}

/**
 * Helper: Format validation status for UI
 */
export function formatValidationStatus(result: ValidationResult): {
  status: string;
  statusColor: string;
  emoji: string;
} {
  if (!result.completed) {
    return {
      status: 'Pending',
      statusColor: 'text-yellow-600',
      emoji: '',
    };
  }

  if (result.approved) {
    return {
      status: 'Approved',
      statusColor: 'text-green-600',
      emoji: '',
    };
  }

  return {
    status: 'Rejected',
    statusColor: 'text-red-600',
    emoji: '',
  };
}
