/**
 * Robinhood Agentic Trading — endpoints + OAuth config.
 *
 * The Trading MCP is a standard remote MCP (streamable HTTP) guarded by OAuth 2.1
 * (PKCE S256, authorization_code + refresh_token). Public client — no secret. The
 * client is created once via Dynamic Client Registration (RFC 7591) and cached.
 *
 * Discovery (verified):
 *   www-authenticate -> /.well-known/oauth-protected-resource/mcp/trading
 *   authorization_endpoint: https://robinhood.com/oauth
 *   token_endpoint:         https://api.robinhood.com/oauth2/token/
 *   registration_endpoint:  https://agent.robinhood.com/oauth/trading/register
 *   scopes_supported:       ["internal"]   token_endpoint_auth_methods: ["none"]
 */

export const ROBINHOOD_TRADING_MCP_URL = 'https://agent.robinhood.com/mcp/trading';
export const ROBINHOOD_OAUTH_AUTHORIZE_URL = 'https://robinhood.com/oauth';
export const ROBINHOOD_OAUTH_TOKEN_URL = 'https://api.robinhood.com/oauth2/token/';
export const ROBINHOOD_OAUTH_REGISTER_URL = 'https://agent.robinhood.com/oauth/trading/register';
export const ROBINHOOD_OAUTH_SCOPE = 'internal';

/**
 * Pre-registered public client_id (DCR, no secret). Env override wins so a
 * different deployment can register its own client with its own redirect URIs.
 * Falls back to lazy DCR in lib/robinhood/oauth.ts when neither is set.
 */
export const ROBINHOOD_CLIENT_ID = process.env.ROBINHOOD_OAUTH_CLIENT_ID || '';

/** Absolute callback URL — MUST exactly match a redirect_uri registered via DCR. */
export function robinhoodRedirectUri(): string {
  const base = (
    process.env.ROBINHOOD_REDIRECT_BASE ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
  return `${base}/api/robinhood/callback`;
}
