/**
 * Robinhood connection store — server-only.
 *
 * - PKCE/CSRF state: short-lived in Redis (10 min TTL).
 * - Per-user tokens: encrypted at rest (AES-256-GCM via the wallet crypto helper)
 *   in Supabase `robinhood_connections`, keyed by owner wallet address.
 * - getValidAccessToken() transparently refreshes an expiring access token.
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { redis } from '@/lib/redis/client';
import { encryptPrivateKey, decryptPrivateKey } from '@/lib/agent-economy/wallet/crypto';
import { refreshTokens, type RobinhoodTokens } from './oauth';

const ENC_KEY = process.env.ROBINHOOD_TOKEN_ENCRYPTION_KEY || '';
const STATE_TTL_SEC = 600; // 10 minutes
const REFRESH_SKEW_MS = 60_000; // refresh if within 60s of expiry

function requireEncKey(): string {
  if (!ENC_KEY || ENC_KEY.length < 16) {
    throw new Error('ROBINHOOD_TOKEN_ENCRYPTION_KEY is not set (min 16 chars) — refusing to store tokens in plaintext');
  }
  return ENC_KEY;
}

// ─── PKCE / CSRF state (Redis) ───────────────────────────────────────────────

export interface OAuthStatePayload {
  owner: string;
  verifier: string;
}

export async function saveOAuthState(state: string, payload: OAuthStatePayload): Promise<void> {
  await redis.set(`rh:oauth:${state}`, JSON.stringify(payload), { ex: STATE_TTL_SEC });
}

/** Fetch-and-delete the state (single use). */
export async function consumeOAuthState(state: string): Promise<OAuthStatePayload | null> {
  const key = `rh:oauth:${state}`;
  const raw = await redis.get<string | OAuthStatePayload>(key);
  if (!raw) return null;
  await redis.del(key);
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as OAuthStatePayload; } catch { return null; }
  }
  return raw as OAuthStatePayload;
}

// ─── Per-user tokens (Supabase, encrypted) ───────────────────────────────────

function enc(plaintext: string) {
  // encryptPrivateKey nominally types its input as `0x${string}` but AES-encrypts
  // any UTF-8 string — safe to reuse for opaque OAuth tokens.
  const { encryptedKey, iv, salt } = encryptPrivateKey(plaintext as `0x${string}`, requireEncKey());
  return { ciphertext: encryptedKey, iv, salt };
}
function dec(ciphertext: string, iv: string, salt: string): string {
  return decryptPrivateKey(ciphertext, iv, salt, requireEncKey());
}

export async function saveConnection(owner: string, tokens: RobinhoodTokens): Promise<void> {
  const a = enc(tokens.accessToken);
  const r = enc(tokens.refreshToken);
  const row = {
    owner_address: owner.toLowerCase(),
    access_token_ciphertext: a.ciphertext,
    access_token_iv: a.iv,
    access_token_salt: a.salt,
    refresh_token_ciphertext: r.ciphertext,
    refresh_token_iv: r.iv,
    refresh_token_salt: r.salt,
    access_token_expires_at: new Date(tokens.expiresAt).toISOString(),
    scopes: tokens.scope || null,
    is_active: true,
    revoked_at: null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await (supabaseAdmin as any)
    .from('robinhood_connections')
    .upsert(row, { onConflict: 'owner_address' });
  if (error) throw new Error(`Failed to save Robinhood connection: ${error.message}`);
}

async function readRow(owner: string): Promise<any | null> {
  const { data, error } = await (supabaseAdmin as any)
    .from('robinhood_connections')
    .select('*')
    .eq('owner_address', owner.toLowerCase())
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`Failed to read Robinhood connection: ${error.message}`);
  return data || null;
}

export async function isConnected(owner: string): Promise<boolean> {
  const row = await readRow(owner);
  return !!row;
}

export async function deleteConnection(owner: string): Promise<void> {
  await (supabaseAdmin as any)
    .from('robinhood_connections')
    .update({ is_active: false, revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('owner_address', owner.toLowerCase());
}

/**
 * Return a valid access token for the user, refreshing transparently when it's
 * within the skew window of expiry. Returns null if the user isn't connected.
 * On a hard refresh failure the connection is deactivated (user must reconnect).
 */
export async function getValidAccessToken(owner: string): Promise<string | null> {
  const row = await readRow(owner);
  if (!row) return null;

  const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  const access = dec(row.access_token_ciphertext, row.access_token_iv, row.access_token_salt);

  if (expiresAt - Date.now() > REFRESH_SKEW_MS) return access;

  // Refresh
  try {
    const refresh = dec(row.refresh_token_ciphertext, row.refresh_token_iv, row.refresh_token_salt);
    const next = await refreshTokens(refresh);
    await saveConnection(owner, next);
    return next.accessToken;
  } catch (err) {
    console.error('[robinhood] token refresh failed, deactivating connection:', (err as Error).message);
    await deleteConnection(owner);
    return null;
  }
}
