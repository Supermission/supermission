/**
 * Generate Feedback Auth API
 * POST /api/reputation/generate-auth
 * Generates a signed feedbackAuth parameter for ERC-8004 feedback submission
 *
 * The feedbackAuth contains:
 * 1. Struct data (224 bytes): agentId, clientAddress, indexLimit, expiry, chainId, identityRegistry, signerAddress
 * 2. Signature (65+ bytes): Agent owner's signature authorizing this client to give feedback
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  toBytes,
  type Address,
  hashMessage,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { supabaseAdmin } from '@/lib/supabase/client';

// NFT Owner Wallet (Deployer)
// ALL ERC-8004 NFTs (agents 2, 3, 4) are owned by this address on-chain
// This wallet MUST sign the feedbackAuth for all agents
const NFT_OWNER_ADDRESS = '0x57E94Af6f45fD9Cda508Ee8E6467B2895F75bBF9' as Address;

// Private key is validated at request time (not module load) so the build doesn't crash
function getNftOwnerPrivateKey(): `0x${string}` {
  if (!process.env.PRIVATE_KEY) {
    throw new Error(
      'PRIVATE_KEY environment variable is required for feedbackAuth signing. ' +
      'Set it in your .env.local file. Never hardcode private keys in source code.'
    );
  }
  return process.env.PRIVATE_KEY as `0x${string}`;
}

// ERC-8004 contracts
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';

interface GenerateAuthRequest {
  agentId: string; // ERC-8004 NFT token ID (any agent)
  clientAddress: string; // Client wallet address
  indexLimit?: number; // Max feedback count (default: 10)
  expiryHours?: number; // Hours until expiry (default: 24)
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Generate Auth] Received request');
    const body: GenerateAuthRequest = await request.json();

    // Validate request
    if (!body.agentId || !body.clientAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId, clientAddress' },
        { status: 400 }
      );
    }

    // Lookup agent from database by ERC-8004 NFT ID
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name, erc8004_agent_id, owner_address')
      .eq('erc8004_agent_id', body.agentId)
      .single();

    if (agentError || !agent) {
      console.error('[Generate Auth] Agent not found:', body.agentId, agentError);
      return NextResponse.json(
        { error: `Agent with ERC-8004 ID ${body.agentId} not found in database` },
        { status: 404 }
      );
    }

    console.log('[Generate Auth] Generating auth for:', {
      agentId: body.agentId,
      agentName: agent.agent_name,
      nftOwner: NFT_OWNER_ADDRESS,
      clientAddress: body.clientAddress,
    });

    // Create account from NFT owner's private key
    // ALL NFTs are owned by the deployer wallet
    const account = privateKeyToAccount(getNftOwnerPrivateKey());

    console.log('[Generate Auth] NFT Owner Account:', account.address);
    console.log('[Generate Auth] Expected:', NFT_OWNER_ADDRESS);

    // Build FeedbackAuth struct
    const indexLimit = body.indexLimit || 10; // Allow up to 10 feedback submissions
    const expiryHours = body.expiryHours || 24; // Valid for 24 hours
    const expiry = Math.floor(Date.now() / 1000) + (expiryHours * 3600);
    const chainId = 8453; // Base Mainnet
    const signerAddress = NFT_OWNER_ADDRESS; // Must be the NFT owner

    console.log('[Generate Auth] Auth parameters:', {
      agentId: body.agentId,
      clientAddress: body.clientAddress,
      indexLimit,
      expiry: new Date(expiry * 1000).toISOString(),
      chainId,
      identityRegistry: IDENTITY_REGISTRY,
      signerAddress,
    });

    // Encode struct (first 224 bytes)
    let agentIdBigInt: bigint;
    try {
      agentIdBigInt = BigInt(body.agentId);
    } catch {
      return NextResponse.json(
        { error: 'agentId must be a numeric string' },
        { status: 400 }
      );
    }
    const encodedStruct = encodeAbiParameters(
      parseAbiParameters('uint256, address, uint64, uint256, uint256, address, address'),
      [
        agentIdBigInt,
        body.clientAddress as `0x${string}`,
        BigInt(indexLimit),
        BigInt(expiry),
        BigInt(chainId),
        IDENTITY_REGISTRY as `0x${string}`,
        signerAddress,
      ]
    );

    console.log('[Generate Auth] Encoded struct:', encodedStruct);
    console.log('[Generate Auth] Struct length:', encodedStruct.length);

    // Create message to sign - must match contract's verification
    // Contract does: keccak256(abi.encode(...)).toEthSignedMessageHash().recover(signature)

    // Step 1: Hash the encoded struct (same as Solidity's keccak256(abi.encode(...)))
    const structHash = keccak256(encodedStruct);
    console.log('[Generate Auth] Struct hash:', structHash);

    // Step 2: Sign the hash - signMessage will add EIP-191 prefix automatically
    // This matches Solidity's .toEthSignedMessageHash()
    const signature = await account.signMessage({
      message: { raw: toBytes(structHash) },
    });

    console.log('[Generate Auth] Signing with address:', account.address);

    console.log('[Generate Auth] Signature:', signature);
    console.log('[Generate Auth] Signature length:', signature.length);

    // Concatenate struct + signature to create feedbackAuth
    // Remove '0x' prefix from signature before concatenating
    const signatureHex = signature.startsWith('0x') ? signature.slice(2) : signature;
    const feedbackAuth = (encodedStruct + signatureHex) as `0x${string}`;

    console.log('[Generate Auth] Final feedbackAuth:', feedbackAuth);
    console.log('[Generate Auth] Final length:', feedbackAuth.length);
    console.log('[Generate Auth] Final length in bytes:', (feedbackAuth.length - 2) / 2);

    // Verify length is >= 289 bytes (578 hex chars + '0x' = 580 total chars)
    const byteLength = (feedbackAuth.length - 2) / 2;
    if (byteLength < 289) {
      console.error('[Generate Auth] feedbackAuth too short:', byteLength, 'bytes');
      return NextResponse.json(
        { error: `feedbackAuth too short: ${byteLength} bytes (need >= 289)` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      feedbackAuth,
      metadata: {
        agentId: body.agentId,
        agentName: agent.agent_name,
        clientAddress: body.clientAddress,
        indexLimit,
        expiry,
        expiryDate: new Date(expiry * 1000).toISOString(),
        chainId,
        identityRegistry: IDENTITY_REGISTRY,
        signerAddress,
        byteLength,
      },
    });

  } catch (error) {
    console.error('[Generate Auth] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate feedbackAuth',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reputation/generate-auth
 * Returns API documentation
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/reputation/generate-auth',
    method: 'POST',
    description: 'Generate signed feedbackAuth for ERC-8004 feedback submission',
    requiredFields: {
      agentId: 'ERC-8004 NFT token ID (any registered agent)',
      clientAddress: 'Client wallet address',
    },
    optionalFields: {
      indexLimit: 'Max feedback count (default: 10)',
      expiryHours: 'Hours until expiry (default: 24)',
    },
    returns: {
      feedbackAuth: 'Hex-encoded auth data (>= 289 bytes)',
      metadata: 'Auth parameters and expiry info',
    },
  });
}
