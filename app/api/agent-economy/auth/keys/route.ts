import { NextRequest, NextResponse } from 'next/server';
import {
  generateApiKey,
  revokeApiKey,
  listApiKeys,
  authenticateRequest,
  createAuthErrorResponse,
} from '@/lib/agent-economy/auth';

/**
 * GET /api/agent-economy/auth/keys
 * List API keys for an owner
 *
 * Query params:
 * - ownerAddress: The wallet address to list keys for
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    let ownerAddress = searchParams.get('ownerAddress');

    // Require authentication — the caller must prove they own a key for this address
    const authResult = await authenticateRequest(request, 'read');

    // Derive ownerAddress from auth context if not provided
    if (!ownerAddress && authResult.success && authResult.context?.ownerAddress) {
      ownerAddress = authResult.context.ownerAddress;
    }

    if (!ownerAddress) {
      if (!authResult.success) {
        return createAuthErrorResponse(authResult);
      }
      return NextResponse.json(
        { success: false, error: 'Owner address is required (pass ?ownerAddress= or use auth header)' },
        { status: 400 }
      );
    }

    if (!authResult.success) {
      // Bootstrap fallback: if no keys exist yet for this address, allow listing
      // (will return empty array anyway)
      const existingKeys = await listApiKeys(ownerAddress);
      if (existingKeys.length > 0) {
        return createAuthErrorResponse(authResult);
      }
      // No keys exist — allow unauthenticated access (returns empty list)
      return NextResponse.json({
        success: true,
        keys: [],
        total: 0,
      });
    }

    // Verify the authenticated user is listing their own keys
    if (authResult.context!.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'You can only list your own API keys' },
        { status: 403 }
      );
    }

    const keys = await listApiKeys(ownerAddress);

    // Format keys for response (never include actual key hashes)
    const formattedKeys = keys.map((key) => ({
      id: key.id,
      keyPrefix: key.keyPrefix,
      name: key.name,
      agentId: key.agentId,
      permissions: key.permissions,
      rateLimit: key.rateLimit,
      isActive: key.isActive,
      createdAt: key.createdAt.toISOString(),
      expiresAt: key.expiresAt?.toISOString() || null,
      revokedAt: key.revokedAt?.toISOString() || null,
      lastRequestAt: key.lastRequestAt?.toISOString() || null,
      requestsToday: key.requestsToday,
    }));

    return NextResponse.json({
      success: true,
      keys: formattedKeys,
      total: formattedKeys.length,
    });
  } catch (error) {
    console.error('[Auth Keys GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/agent-economy/auth/keys
 * Rotate an API key — revokes the old key and generates a new one
 *
 * Body:
 * - keyId: The key ID to rotate
 * - ownerAddress: The owner's wallet address
 * - name: Optional new name for the rotated key (defaults to old key name + " (rotated)")
 */
export async function PUT(request: NextRequest) {
  try {
    // Require authentication
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const { keyId, name } = body;
    const ownerAddress = body.ownerAddress || authResult.context!.ownerAddress;

    if (!keyId) {
      return NextResponse.json(
        { success: false, error: 'keyId is required' },
        { status: 400 }
      );
    }

    // Verify the caller owns this key
    if (authResult.context!.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'You can only rotate your own API keys' },
        { status: 403 }
      );
    }

    // Revoke the old key
    const revokeResult = await revokeApiKey(keyId, ownerAddress);
    if (!revokeResult.success) {
      return NextResponse.json(
        { success: false, error: revokeResult.error || 'Failed to revoke old key' },
        { status: 400 }
      );
    }

    // Generate a new key
    const newKeyResult = await generateApiKey({
      ownerAddress,
      name: name || `rotated-${Date.now()}`,
    });

    if (!newKeyResult.success) {
      return NextResponse.json(
        { success: false, error: newKeyResult.error || 'Failed to generate new key' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      keyId: newKeyResult.keyId,
      apiKey: newKeyResult.apiKey,
      keyPrefix: newKeyResult.keyPrefix,
      revokedKeyId: keyId,
      message: 'Key rotated successfully. Save the new key — it cannot be retrieved later!',
    });
  } catch (error) {
    console.error('[Auth Keys PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agent-economy/auth/keys
 * Revoke an API key
 *
 * Body:
 * - keyId: The key ID to revoke
 * - ownerAddress: The owner's wallet address (for verification)
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success || !authResult.context) {
      return createAuthErrorResponse(authResult);
    }

    // Try to parse body, fall back to query params
    let keyId: string | null = null;
    let ownerAddress: string | null = null;

    try {
      const body = await request.json();
      keyId = body.keyId || null;
      ownerAddress = body.ownerAddress || null;
    } catch {
      // Body parsing failed — try query params as fallback
    }

    // Fall back to query params if body didn't provide values
    if (!keyId) {
      keyId = request.nextUrl.searchParams.get('keyId');
    }
    if (!ownerAddress) {
      ownerAddress = request.nextUrl.searchParams.get('ownerAddress');
    }

    // Default to authenticated owner if not provided
    if (!ownerAddress) {
      ownerAddress = authResult.context.ownerAddress;
    }

    if (!keyId) {
      return NextResponse.json(
        { success: false, error: 'keyId is required (in request body or query params)' },
        { status: 400 }
      );
    }

    if (!ownerAddress) {
      return NextResponse.json(
        { success: false, error: 'ownerAddress is required (in request body or query params)' },
        { status: 400 }
      );
    }

    if (ownerAddress.toLowerCase() !== authResult.context.ownerAddress.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to revoke keys for another owner' },
        { status: 403 }
      );
    }

    const result = await revokeApiKey(keyId, ownerAddress);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'API key revoked successfully',
    });
  } catch (error) {
    console.error('[Auth Keys DELETE] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
