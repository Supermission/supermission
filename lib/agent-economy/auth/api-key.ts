/**
 * API Key Management Functions
 * Generate, revoke, and list API keys for agent authentication
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { randomBytes } from 'crypto';
import { hashApiKey } from './middleware';


// ==========================================
// Types
// ==========================================

export interface ApiKey {
  id: string;
  keyPrefix: string;
  name: string;
  agentId: string | null;
  ownerAddress: string;
  permissions: string[];
  rateLimit: number;
  isActive: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastRequestAt: Date | null;
  requestsToday: number;
}

export interface GenerateApiKeyRequest {
  agentId?: string;
  ownerAddress: string;
  name: string;
  permissions?: string[];
  rateLimit?: number;
  expiresInDays?: number;
}

export interface GenerateApiKeyResult {
  success: boolean;
  keyId?: string;
  apiKey?: string; // Plaintext key - only returned once!
  keyPrefix?: string;
  error?: string;
}

// ==========================================
// Key Generation
// ==========================================

/**
 * Generate a new API key
 * Returns the plaintext key ONCE - it cannot be retrieved later
 */
export async function generateApiKey(
  request: GenerateApiKeyRequest
): Promise<GenerateApiKeyResult> {
  try {
    // Validate required fields
    if (!request.ownerAddress) {
      return { success: false, error: 'Owner address is required' };
    }
    if (!request.name || request.name.length > 50) {
      return { success: false, error: 'Name is required and must be 50 characters or less' };
    }

    // Generate secure random key
    // Format: sk_[32 random hex chars]
    const randomPart = randomBytes(16).toString('hex');
    const apiKey = `sk_${randomPart}`;
    const keyPrefix = `sk_${randomPart.slice(0, 8)}...`;
    const keyHash = hashApiKey(apiKey);

    // Calculate expiry if specified
    let expiresAt: string | null = null;
    if (request.expiresInDays) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + request.expiresInDays);
      expiresAt = expiry.toISOString();
    }

    // Insert key record
    const { data, error } = await supabaseAdmin
      .from('agent_api_keys')
      .insert({
        key_hash: keyHash,
        key_prefix: keyPrefix,
        owner_address: request.ownerAddress.toLowerCase(),
        agent_id: request.agentId || null,
        name: request.name,
        permissions: request.permissions || ['read', 'write'],
        rate_limit: request.rateLimit || 1000,
        requests_today: 0,
        is_active: true,
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('Failed to create API key:', error);
      return { success: false, error: 'Failed to create API key' };
    }

    return {
      success: true,
      keyId: data.id,
      apiKey, // Only time the full key is returned!
      keyPrefix,
    };
  } catch (error) {
    console.error('Error generating API key:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ==========================================
// Key Management
// ==========================================

/**
 * Revoke an API key
 */
export async function revokeApiKey(
  keyId: string,
  ownerAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify ownership
    const { data: keyRecord, error: fetchError } = await supabaseAdmin
      .from('agent_api_keys')
      .select('owner_address')
      .eq('id', keyId)
      .single();

    if (fetchError || !keyRecord) {
      return { success: false, error: 'API key not found' };
    }

    if (keyRecord.owner_address.toLowerCase() !== ownerAddress.toLowerCase()) {
      return { success: false, error: 'Not authorized to revoke this key' };
    }

    // Revoke the key
    const { error } = await supabaseAdmin
      .from('agent_api_keys')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', keyId);

    if (error) {
      return { success: false, error: 'Failed to revoke API key' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error revoking API key:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * List API keys for an owner
 * Does NOT return the actual keys (they're hashed and unrecoverable)
 */
export async function listApiKeys(ownerAddress: string): Promise<ApiKey[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('agent_api_keys')
      .select('*')
      .eq('owner_address', ownerAddress)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) {
      return [];
    }

    return data.map((record) => ({
      id: record.id,
      keyPrefix: record.key_prefix,
      name: record.name,
      agentId: record.agent_id,
      ownerAddress: record.owner_address,
      permissions: record.permissions || ['read', 'write'],
      rateLimit: record.rate_limit,
      isActive: record.is_active,
      createdAt: new Date(record.created_at),
      expiresAt: record.expires_at ? new Date(record.expires_at) : null,
      revokedAt: record.revoked_at ? new Date(record.revoked_at) : null,
      lastRequestAt: record.last_request_at ? new Date(record.last_request_at) : null,
      requestsToday: record.requests_today || 0,
    }));
  } catch (error) {
    console.error('Error listing API keys:', error);
    return [];
  }
}

/**
 * Get a single API key by ID (for owner verification)
 */
export async function getApiKey(keyId: string, ownerAddress: string): Promise<ApiKey | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('agent_api_keys')
      .select('*')
      .eq('id', keyId)
      .eq('owner_address', ownerAddress)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      keyPrefix: data.key_prefix,
      name: data.name,
      agentId: data.agent_id,
      ownerAddress: data.owner_address,
      permissions: data.permissions || ['read', 'write'],
      rateLimit: data.rate_limit,
      isActive: data.is_active,
      createdAt: new Date(data.created_at),
      expiresAt: data.expires_at ? new Date(data.expires_at) : null,
      revokedAt: data.revoked_at ? new Date(data.revoked_at) : null,
      lastRequestAt: data.last_request_at ? new Date(data.last_request_at) : null,
      requestsToday: data.requests_today || 0,
    };
  } catch (error) {
    console.error('Error getting API key:', error);
    return null;
  }
}

/**
 * Update API key settings
 */
export async function updateApiKey(
  keyId: string,
  ownerAddress: string,
  updates: {
    name?: string;
    permissions?: string[];
    rateLimit?: number;
    isActive?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify ownership
    const { data: keyRecord, error: fetchError } = await supabaseAdmin
      .from('agent_api_keys')
      .select('owner_address')
      .eq('id', keyId)
      .single();

    if (fetchError || !keyRecord) {
      return { success: false, error: 'API key not found' };
    }

    if (keyRecord.owner_address.toLowerCase() !== ownerAddress.toLowerCase()) {
      return { success: false, error: 'Not authorized to update this key' };
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.permissions !== undefined) updateData.permissions = updates.permissions;
    if (updates.rateLimit !== undefined) updateData.rate_limit = updates.rateLimit;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

    const { error } = await supabaseAdmin
      .from('agent_api_keys')
      .update(updateData)
      .eq('id', keyId);

    if (error) {
      return { success: false, error: 'Failed to update API key' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating API key:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
