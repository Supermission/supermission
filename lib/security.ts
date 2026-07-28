/**
 * Security utilities for input validation and SSRF prevention
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
]);

const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // Loopback
  /^10\./,                           // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./,     // RFC 1918
  /^192\.168\./,                     // RFC 1918
  /^169\.254\./,                     // Link-local / cloud metadata
  /^0\./,                            // Current network
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Carrier-grade NAT
  /^\[?::1\]?$/,                     // IPv6 loopback
  /^\[?fe80:/i,                      // IPv6 link-local
  /^\[?fc00:/i,                      // IPv6 unique local
  /^\[?fd/i,                         // IPv6 unique local
];

/**
 * Validates that a URL is a safe external endpoint (not internal/private).
 * Returns null if valid, or an error message if blocked.
 */
export function validateExternalUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL format';
  }

  // Only allow http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Blocked protocol: ${parsed.protocol} — only http/https allowed`;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known internal hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return `Blocked hostname: ${hostname}`;
  }

  // Block private/internal IP ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return 'Blocked: URL resolves to a private/internal IP address';
    }
  }

  return null; // Valid
}
