/**
 * Robinhood OAuth 2.1 (PKCE) helpers — server-only.
 *
 * Flow: ensureClientId() [DCR, cached] -> buildAuthorizeUrl() -> user authorizes
 * on robinhood.com -> callback with `code` -> exchangeCode() -> {access,refresh}.
 * refreshTokens() renews an expired access token.
 */

import { randomBytes, createHash } from 'crypto';
import {
  ROBINHOOD_CLIENT_ID,
  ROBINHOOD_OAUTH_AUTHORIZE_URL,
  ROBINHOOD_OAUTH_TOKEN_URL,
  ROBINHOOD_OAUTH_REGISTER_URL,
  ROBINHOOD_OAUTH_SCOPE,
  robinhoodRedirectUri,
} from './config';

export interface RobinhoodTokens {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry (epoch ms). */
  expiresAt: number;
  scope?: string;
  tokenType?: string;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PKCE verifier (high-entropy) + S256 challenge. */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48)); // 64 url-safe chars
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/** Opaque anti-CSRF state token. */
export function generateState(): string {
  return base64url(randomBytes(24));
}

// Cache the DCR-issued client_id for the process lifetime.
let cachedClientId: string | null = ROBINHOOD_CLIENT_ID || null;

/**
 * Return a usable client_id: the env-configured one, or register a public client
 * via Dynamic Client Registration (RFC 7591) and cache it. Robinhood's DCR
 * returns no client_secret (public/PKCE client).
 */
export async function ensureClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;

  const res = await fetch(ROBINHOOD_OAUTH_REGISTER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Supermission RORO Agent',
      redirect_uris: [robinhoodRedirectUri()],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: ROBINHOOD_OAUTH_SCOPE,
    }),
  });
  if (!res.ok) {
    throw new Error(`Robinhood DCR failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();
  if (!data.client_id) throw new Error('Robinhood DCR returned no client_id');
  cachedClientId = data.client_id as string;
  return cachedClientId;
}

/** Build the authorization URL the user is redirected to. */
export async function buildAuthorizeUrl(params: {
  state: string;
  codeChallenge: string;
}): Promise<string> {
  const clientId = await ensureClientId();
  const url = new URL(ROBINHOOD_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', robinhoodRedirectUri());
  url.searchParams.set('scope', ROBINHOOD_OAUTH_SCOPE);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

function toTokens(data: any): RobinhoodTokens {
  const expiresInSec = Number(data.expires_in ?? 3600);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Math.max(60, expiresInSec) * 1000,
    scope: data.scope,
    tokenType: data.token_type,
  };
}

/** Exchange an authorization code (+ PKCE verifier) for tokens. */
export async function exchangeCode(params: {
  code: string;
  codeVerifier: string;
}): Promise<RobinhoodTokens> {
  const clientId = await ensureClientId();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: robinhoodRedirectUri(),
    client_id: clientId,
    code_verifier: params.codeVerifier,
  });
  const res = await fetch(ROBINHOOD_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Robinhood token exchange failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('Robinhood token exchange returned no access_token');
  return toTokens(data);
}

/** Renew tokens using a refresh_token. */
export async function refreshTokens(refreshToken: string): Promise<RobinhoodTokens> {
  const clientId = await ensureClientId();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    scope: ROBINHOOD_OAUTH_SCOPE,
  });
  const res = await fetch(ROBINHOOD_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Robinhood token refresh failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('Robinhood token refresh returned no access_token');
  // Robinhood may or may not rotate the refresh token; keep the old one if absent.
  return { ...toTokens(data), refreshToken: data.refresh_token || refreshToken };
}
