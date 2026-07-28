/**
 * Webhook Infrastructure
 * Enables agents to receive real-time notifications about platform events
 *
 * Supports two delivery modes:
 * 1. Cloudflare Queue (reliable, with retry) - when ENABLE_CF_WEBHOOK_QUEUE=true
 * 2. Direct delivery (fire-and-forget) - legacy mode
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { createHmac, randomBytes } from 'crypto';
import { promises as dnsPromises } from 'dns';
import { isIP } from 'net';
import { after } from 'next/server';
import { v4 as uuidv4 } from 'uuid';


// Cloudflare Workers configuration
const CF_WEBHOOK_QUEUE_ENABLED = process.env.ENABLE_CF_WEBHOOK_QUEUE === 'true';
const CF_WORKERS_DOMAIN = process.env.CF_WORKERS_DOMAIN || 'workers.supermission.fun';
const CF_INTERNAL_SECRET = process.env.CF_INTERNAL_SECRET || '';

// Circuit breaker: auto-disable webhooks after too many failures
const MAX_CONSECUTIVE_FAILURES = 10;
// After circuit trips, auto-reset after this cooldown (ms). Tunnel bounces, reconnects, etc.
const CIRCUIT_RESET_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
// Direct delivery retry config
const DIRECT_MAX_RETRIES = 3;
const DIRECT_RETRY_BASE_MS = 1000; // 1s, 2s, 4s exponential backoff

// ==========================================
// Types
// ==========================================

export type WebhookEvent =
  | 'task.assigned'
  | 'task.approved'
  | 'task.rejected'
  | 'task.submitted'
  | 'application.accepted'
  | 'application.rejected'
  | 'application.message'
  | 'payment.received'
  | 'payment.failed'
  | 'mission.new_match'
  | 'mission.activated'
  | 'mission.completed'
  | 'contract.created'
  | 'contract.completed'
  | 'compute.completed'
  | 'compute.failed'
  | 'session.created'
  | 'session.closed'
  | 'escrow.created'
  | 'escrow.completed'
  | 'session.expired';

export interface Webhook {
  id: string;
  agentId: string;
  url: string;
  events: WebhookEvent[];
  isActive: boolean;
  failureCount: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  createdAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: WebhookEvent;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  attempts: number;
  responseStatus?: number;
  createdAt: Date;
  deliveredAt?: Date;
}

export interface CreateWebhookRequest {
  agentId: string;
  url: string;
  events: WebhookEvent[];
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  agentId: string;
  deliveryId: string;  // Unique per delivery — use this to deduplicate retries
  data: Record<string, unknown>;
}

// ==========================================
// Webhook Management
// ==========================================

/**
 * Generate a secure webhook secret
 */
function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('hex')}`;
}

// ==========================================
// SSRF Protection
// ==========================================

/**
 * Returns true when an IPv4 address falls inside any private, loopback,
 * link-local, or otherwise reserved range that must never be reachable
 * from a user-supplied webhook URL.
 *
 * Ranges covered (RFC-based):
 *   0.0.0.0/8      — "this" network
 *   10.0.0.0/8     — private
 *   100.64.0.0/10  — shared address space (carrier-grade NAT)
 *   127.0.0.0/8    — loopback
 *   169.254.0.0/16 — link-local / cloud metadata (AWS 169.254.169.254, etc.)
 *   172.16.0.0/12  — private
 *   192.0.0.0/24   — IETF protocol assignments
 *   192.0.2.0/24   — TEST-NET-1
 *   192.168.0.0/16 — private
 *   198.18.0.0/15  — benchmarking
 *   198.51.100.0/24— TEST-NET-2
 *   203.0.113.0/24 — TEST-NET-3
 *   224.0.0.0/4+   — multicast and reserved
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && b >= 18 && b <= 19) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/**
 * Returns true when an IPv6 address is loopback, unspecified, link-local,
 * unique-local, multicast, or an IPv4-mapped address that maps to a private
 * IPv4 range (e.g. ::ffff:127.0.0.1, ::ffff:7f00:1).
 */
function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '');

  if (addr === '::1' || addr === '::') return true; // loopback / unspecified

  // IPv4-mapped — ::ffff:a.b.c.d  or  ::ffff:aabb:ccdd
  if (addr.startsWith('::ffff:')) {
    const rest = addr.slice(7);
    if (rest.includes('.') && isIP(rest) === 4) return isPrivateIPv4(rest);
    // hex-pair form e.g. ::ffff:7f00:1 = 127.0.0.1
    const hx = rest.split(':');
    if (hx.length === 2) {
      const hi = parseInt(hx[0], 16);
      const lo = parseInt(hx[1], 16);
      if (!isNaN(hi) && !isNaN(lo))
        return isPrivateIPv4(
          `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
        );
    }
    return true; // unknown ::ffff: variant — block to be safe
  }

  // Parse first 16-bit group for prefix checks
  const firstGroupHex = addr.startsWith(':') ? '0' : (addr.split(':')[0] || '0');
  const firstWord = parseInt(firstGroupHex, 16);
  if (isNaN(firstWord)) return true; // unparseable — block

  return (
    (firstWord & 0xffc0) === 0xfe80 || // fe80::/10 — link-local
    (firstWord & 0xfe00) === 0xfc00 || // fc00::/7  — unique local (fc/fd)
    (firstWord & 0xff00) === 0xff00    // ff00::/8  — multicast
  );
}

/**
 * Converts alternate IPv4 representations (pure decimal, pure hex, dotted
 * octal/hex parts) to standard dotted-decimal so they can be validated.
 * Returns null when the input is not an alternate format.
 *
 * Examples that would otherwise bypass a naive check:
 *   2130706433         → 127.0.0.1  (decimal)
 *   0x7f000001         → 127.0.0.1  (hex)
 *   0177.0.0.1         → 127.0.0.1  (octal first octet)
 *   0xc0.0xa8.0x01.01  → 192.168.1.1 (hex octets)
 */
function decodeAlternateIPFormat(hostname: string): string | null {
  // Pure hex: 0x7f000001
  if (/^0x[0-9a-f]+$/i.test(hostname)) {
    const n = parseInt(hostname, 16);
    if (n >= 0 && n <= 0xffffffff)
      return `${(n >>> 24)}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
  }

  // Pure decimal (require > 3 digits so we don't misinterpret single octets)
  if (/^\d+$/.test(hostname) && hostname.length > 3) {
    const n = Number(hostname);
    if (Number.isInteger(n) && n >= 0 && n <= 4294967295)
      return `${(n >>> 24)}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
  }

  // Dotted with octal/hex parts: 0177.0.0.1  or  0xc0.0xa8.1.1
  if (hostname.includes('.')) {
    const parts = hostname.split('.');
    if (parts.length === 4) {
      const nums = parts.map(p => {
        if (/^0x[0-9a-f]+$/i.test(p)) return parseInt(p, 16);
        if (/^0[0-7]+$/.test(p)) return parseInt(p, 8); // leading zero → octal
        return parseInt(p, 10);
      });
      if (nums.every(n => Number.isInteger(n) && n >= 0 && n <= 255))
        return nums.join('.');
    }
  }

  return null;
}

/**
 * Validates a webhook URL against SSRF risks and returns the resolved IP
 * address so callers can pin the subsequent HTTP request to it (prevents
 * DNS-rebinding attacks where a hostname resolves to a public IP at
 * registration time but a private IP at delivery time).
 *
 * Enforced rules:
 *   • Protocol must be http or https (no file://, ftp://, gopher://, etc.)
 *   • Hostname must resolve via DNS; unresolvable names are rejected
 *   • Every resolved address (A and AAAA) must clear the private-IP blocklist
 *   • Alternate IP formats (decimal, octal, hex) are normalised before checking
 */
async function validateAndResolveWebhookUrl(
  rawUrl: string
): Promise<{ ip: string; family: 4 | 6 }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid webhook URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use http or https protocol');
  }

  const rawHostname = parsed.hostname.replace(/^\[|\]$/g, '');

  // Normalise alternate IPv4 formats before any check
  const hostname = decodeAlternateIPFormat(rawHostname) ?? rawHostname;

  // If the URL already contains a literal IP, validate without DNS
  const literalFamily = isIP(hostname) as 0 | 4 | 6;
  if (literalFamily === 4) {
    if (isPrivateIPv4(hostname))
      throw new Error('Webhook URL points to a private or reserved IP address');
    return { ip: hostname, family: 4 };
  }
  if (literalFamily === 6) {
    if (isPrivateIPv6(hostname))
      throw new Error('Webhook URL points to a private or reserved IP address');
    return { ip: hostname, family: 6 };
  }

  // DNS resolution — request all address families (A + AAAA)
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dnsPromises.lookup(rawHostname, { all: true });
  } catch {
    throw new Error('Webhook URL hostname could not be resolved');
  }

  if (!addresses?.length) throw new Error('Webhook URL hostname returned no addresses');

  // Every resolved address must pass the blocklist — one bad address blocks all
  for (const { address, family } of addresses) {
    if (family === 4 && isPrivateIPv4(address))
      throw new Error('Webhook URL resolves to a private or reserved IP address');
    if (family === 6 && isPrivateIPv6(address))
      throw new Error('Webhook URL resolves to a private or reserved IP address');
  }

  const first = addresses[0];
  return { ip: first.address, family: first.family as 4 | 6 };
}

/**
 * SSRF-safe drop-in for fetch().
 *
 * On every call it:
 *   1. Re-resolves the hostname and validates all resolved IPs against the
 *      private/reserved blocklist (catches DNS-rebinding between registration
 *      and delivery — the TTL window is the attack surface without this)
 *   2. Fetches the original URL so TLS SNI and certificate validation work
 *      correctly against the hostname (not a raw IP)
 *   3. Sets redirect: 'error' — a redirect could point to an internal target
 *      that was never validated; callers should update URLs instead of
 *      relying on redirects
 *
 * NOTE: We intentionally do NOT pin to the resolved IP in the request URL.
 * Replacing the hostname with a bare IP breaks TLS: the OS sets SNI to the
 * IP literal, the server presents a certificate for the hostname, and
 * certificate validation fails. The Host header is an HTTP header — it has
 * no effect on the TLS handshake. SSRF protection is achieved by the
 * validateAndResolveWebhookUrl check above, not by IP pinning.
 */
async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  // SSRF check: resolve hostname and block any private/reserved IPs
  await validateAndResolveWebhookUrl(url);

  return fetch(url, {
    ...init,
    redirect: 'error', // never follow redirects — target is unvalidated
  });
}

/**
 * Create a webhook for an agent
 */
export async function createWebhook(
  request: CreateWebhookRequest
): Promise<{ success: boolean; webhook?: Webhook; secret?: string; error?: string }> {
  try {
    // Validate URL
    try {
      new URL(request.url);
    } catch {
      return { success: false, error: 'Invalid webhook URL' };
    }

    // Must be HTTPS in production
    if (process.env.NODE_ENV === 'production' && !request.url.startsWith('https://')) {
      return { success: false, error: 'Webhook URL must use HTTPS' };
    }

    // SSRF prevention: resolve hostname and validate against all private/reserved ranges.
    // This also catches alternate IP formats (decimal, octal, hex) and rejects
    // hostnames that resolve to any private address (including via all A/AAAA records).
    try {
      await validateAndResolveWebhookUrl(request.url);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Webhook URL is not allowed',
      };
    }

    // Validate events
    const validEvents: WebhookEvent[] = [
      'task.assigned', 'task.approved', 'task.rejected', 'task.submitted',
      'application.accepted', 'application.rejected', 'application.message',
      'payment.received', 'payment.failed',
      'mission.new_match', 'mission.activated', 'mission.completed',
      'contract.created', 'contract.completed',
      'compute.completed', 'compute.failed',
      'session.created', 'session.closed', 'session.expired',
    ];

    const invalidEvents = request.events.filter(e => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return { success: false, error: `Invalid events: ${invalidEvents.join(', ')}` };
    }

    // Check for existing webhook
    const { data: existing } = await supabaseAdmin
      .from('agent_webhooks')
      .select('id')
      .eq('agent_id', request.agentId)
      .eq('url', request.url)
      .single();

    if (existing) {
      return { success: false, error: 'Webhook already exists for this URL' };
    }

    // Generate secret
    const secret = generateWebhookSecret();

    // Insert webhook
    const { data, error } = await supabaseAdmin
      .from('agent_webhooks')
      .insert({
        agent_id: request.agentId,
        url: request.url,
        secret,
        events: request.events,
        is_active: true,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[Webhook] Create failed:', error);
      return { success: false, error: 'Failed to create webhook' };
    }

    return {
      success: true,
      webhook: mapWebhook(data),
      secret, // Only returned once at creation!
    };
  } catch (error) {
    console.error('[Webhook] Create error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * List webhooks for an agent
 */
export async function listWebhooks(agentId: string): Promise<Webhook[]> {
  const { data, error } = await supabaseAdmin
    .from('agent_webhooks')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data) {
    return [];
  }

  return data.map(mapWebhook);
}

/**
 * Get a specific webhook
 */
export async function getWebhook(webhookId: string): Promise<Webhook | null> {
  const { data, error } = await supabaseAdmin
    .from('agent_webhooks')
    .select('*')
    .eq('id', webhookId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapWebhook(data);
}

/**
 * Update webhook settings
 */
export async function updateWebhook(
  webhookId: string,
  updates: { events?: WebhookEvent[]; isActive?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const updateData: Record<string, unknown> = {};

  if (updates.events !== undefined) {
    updateData.events = updates.events;
  }
  if (updates.isActive !== undefined) {
    updateData.is_active = updates.isActive;
  }

  if (Object.keys(updateData).length === 0) {
    return { success: false, error: 'No updates provided' };
  }

  const { error } = await supabaseAdmin
    .from('agent_webhooks')
    .update(updateData)
    .eq('id', webhookId);

  if (error) {
    return { success: false, error: 'Failed to update webhook' };
  }

  return { success: true };
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(webhookId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from('agent_webhooks')
    .delete()
    .eq('id', webhookId);

  if (error) {
    return { success: false, error: 'Failed to delete webhook' };
  }

  return { success: true };
}

/**
 * Regenerate webhook secret
 */
export async function regenerateWebhookSecret(
  webhookId: string
): Promise<{ success: boolean; secret?: string; error?: string }> {
  const secret = generateWebhookSecret();

  const { error } = await supabaseAdmin
    .from('agent_webhooks')
    .update({ secret })
    .eq('id', webhookId);

  if (error) {
    return { success: false, error: 'Failed to regenerate secret' };
  }

  return { success: true, secret };
}

// ==========================================
// Webhook Triggering
// ==========================================

/**
 * Trigger webhook delivery for an event
 * Non-blocking: creates delivery record and returns immediately
 *
 * When ENABLE_CF_WEBHOOK_QUEUE=true, webhooks are sent to Cloudflare Queue
 * for reliable delivery with retry logic. Otherwise, uses direct fire-and-forget.
 */
export async function triggerWebhook(
  agentId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const deliver = async () => {
    try {
      // Use Cloudflare Queue for reliable delivery if enabled
      if (CF_WEBHOOK_QUEUE_ENABLED && CF_INTERNAL_SECRET) {
        await enqueueToCloudflare(agentId, event, data);
        return;
      }
      // Direct delivery
      await triggerWebhookDirect(agentId, event, data);
    } catch (error) {
      console.error('[Webhook] Trigger error:', error);
      // Never throw - webhooks are non-critical
    }
  };

  try {
    // Schedule delivery after the response is sent so the work is not
    // abandoned when Vercel freezes the serverless function on return.
    after(deliver);
  } catch {
    // after() throws outside a Next.js request context (e.g. Cloudflare
    // Workers, scripts, tests). Fall back to a plain fire-and-forget.
    deliver().catch(err => console.error('[Webhook] Trigger error:', err));
  }
}

/**
 * Enqueue webhook to Cloudflare Queue for reliable delivery
 */
async function enqueueToCloudflare(
  agentId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const url = `${CF_WORKERS_DOMAIN}/enqueue`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CF_INTERNAL_SECRET}`,
      },
      body: JSON.stringify({ agentId, event, data }),
      signal: AbortSignal.timeout(5000), // 5 second timeout for enqueue
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Webhook] CF enqueue failed:', response.status, error);

      // Fallback to direct delivery on CF failure
      console.log('[Webhook] Falling back to direct delivery');
      await triggerWebhookDirect(agentId, event, data);
    } else {
      const result = await response.json() as { success: boolean; data?: { queued: number } };
      if (result.success && result.data) {
        console.log(`[Webhook] Enqueued ${result.data.queued} webhooks to CF for agent ${agentId}, event ${event}`);
      }
    }
  } catch (error) {
    console.error('[Webhook] CF enqueue error:', error);

    // Fallback to direct delivery on network error
    console.log('[Webhook] Falling back to direct delivery');
    await triggerWebhookDirect(agentId, event, data);
  }
}

/**
 * Direct webhook delivery (legacy fire-and-forget mode)
 */
async function triggerWebhookDirect(
  agentId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  // Find active webhooks for this agent and event.
  // Also include circuit-tripped webhooks (is_active=false) whose last failure
  // is older than the cooldown — tunnel recovered, agent shouldn't need to manually re-enable.
  const cooldownThreshold = new Date(Date.now() - CIRCUIT_RESET_COOLDOWN_MS).toISOString();
  const { data: webhooks, error } = await supabaseAdmin
    .from('agent_webhooks')
    .select('id, url, secret, is_active, failure_count')
    .eq('agent_id', agentId)
    .contains('events', [event])
    .or(`is_active.eq.true,and(is_active.eq.false,last_failure_at.lt.${cooldownThreshold})`);

  if (error || !webhooks || webhooks.length === 0) {
    return; // No webhooks to trigger
  }

  // Auto-reset any circuit-tripped webhooks that have cooled down
  const tripped = webhooks.filter(wh => !wh.is_active);
  if (tripped.length > 0) {
    await supabaseAdmin
      .from('agent_webhooks')
      .update({ is_active: true, failure_count: 0 })
      .in('id', tripped.map(wh => wh.id));
    console.log(`[Webhook] Auto-reset ${tripped.length} circuit-tripped webhook(s) for agent ${agentId} after cooldown`);
  }

  // Generate a unique deliveryId per webhook before insert so agents can deduplicate retries
  const timestamp = new Date().toISOString();
  const webhookDeliveries = webhooks.map(wh => {
    const deliveryId = uuidv4();
    const payload: WebhookPayload = {
      event,
      timestamp,
      agentId,
      deliveryId,
      data,
    };
    return { webhookRow: wh, deliveryId, payload };
  });

  await supabaseAdmin.from('webhook_deliveries').insert(
    webhookDeliveries.map(({ webhookRow, deliveryId, payload }) => ({
      id: deliveryId,
      webhook_id: webhookRow.id,
      event_type: event,
      payload,
      status: 'pending',
      attempts: 0,
    }))
  );

  // Fire-and-forget delivery (async, non-blocking)
  for (const { webhookRow, payload } of webhookDeliveries) {
    deliverWebhookAsync(webhookRow.id, webhookRow.url, webhookRow.secret, payload).catch(err => {
      console.error('[Webhook] Async delivery error:', err);
    });
  }
}

/**
 * Deliver webhook with retry logic (exponential backoff)
 */
async function deliverWebhookAsync(
  webhookId: string,
  url: string,
  secret: string,
  payload: WebhookPayload
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', secret).update(body).digest('hex');

  let lastError: string | null = null;
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= DIRECT_MAX_RETRIES; attempt++) {
    try {
      // safeFetch re-resolves the hostname on every attempt (DNS-rebinding prevention)
      // and pins the request to the resolved IP with redirects disabled.
      const response = await safeFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Event': payload.event,
          'X-Webhook-Timestamp': payload.timestamp,
          'X-Delivery-Id': payload.deliveryId,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      lastStatus = response.status;

      if (response.ok) {
        // Success — update delivery record
        await supabaseAdmin
          .from('webhook_deliveries')
          .update({
            status: 'delivered',
            attempts: attempt,
            last_attempt_at: new Date().toISOString(),
            response_status: response.status,
            delivered_at: new Date().toISOString(),
          })
          .eq('webhook_id', webhookId)
          .eq('event_type', payload.event)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1);

        // Reset failure count on success
        await supabaseAdmin
          .from('agent_webhooks')
          .update({
            last_success_at: new Date().toISOString(),
            failure_count: 0,
          })
          .eq('id', webhookId);

        return; // Done
      }

      // Non-2xx: retry if not final attempt
      lastError = `HTTP ${response.status}`;
      if (attempt < DIRECT_MAX_RETRIES) {
        await sleep(DIRECT_RETRY_BASE_MS * Math.pow(2, attempt - 1));
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Delivery failed';
      if (attempt < DIRECT_MAX_RETRIES) {
        await sleep(DIRECT_RETRY_BASE_MS * Math.pow(2, attempt - 1));
      }
    }
  }

  // All retries exhausted — mark failed
  await supabaseAdmin
    .from('webhook_deliveries')
    .update({
      status: 'failed',
      attempts: DIRECT_MAX_RETRIES,
      last_attempt_at: new Date().toISOString(),
      response_status: lastStatus,
      error_message: lastError,
    })
    .eq('webhook_id', webhookId)
    .eq('event_type', payload.event)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);

  // Increment failure count and check circuit breaker
  const { data: webhook } = await supabaseAdmin
    .from('agent_webhooks')
    .select('failure_count')
    .eq('id', webhookId)
    .single();

  const newFailureCount = (webhook?.failure_count || 0) + 1;
  const updates: Record<string, unknown> = {
    failure_count: newFailureCount,
    last_failure_at: new Date().toISOString(),
    last_failure_reason: lastError,
  };

  // Circuit breaker: auto-disable after too many consecutive failures
  if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
    updates.is_active = false;
    console.warn(`[Webhook] Auto-disabled webhook ${webhookId} after ${newFailureCount} consecutive failures`);
  }

  await supabaseAdmin
    .from('agent_webhooks')
    .update(updates)
    .eq('id', webhookId);
}

/**
 * Retry queued webhook deliveries (cron-friendly, single-attempt per run).
 */
export async function retryWebhookDeliveries(options?: {
  limit?: number;
}): Promise<{ processed: number; delivered: number; failed: number; retried: number }> {
  const limit = Math.min(options?.limit || 50, 200);
  const nowIso = new Date().toISOString();

  const { data: deliveries, error } = await supabaseAdmin
    .from('webhook_deliveries')
    .select('id, webhook_id, event_type, payload, attempts, max_attempts, status')
    .in('status', ['failed', 'retrying'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !deliveries || deliveries.length === 0) {
    return { processed: 0, delivered: 0, failed: 0, retried: 0 };
  }

  let delivered = 0;
  let failed = 0;
  let retried = 0;

  for (const delivery of deliveries) {
    const result = await deliverWebhookDelivery(delivery);
    if (result === 'delivered') delivered++;
    else if (result === 'retrying') retried++;
    else failed++;
  }

  return { processed: deliveries.length, delivered, failed, retried };
}

async function deliverWebhookDelivery(delivery: {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number | null;
  max_attempts: number | null;
}): Promise<'delivered' | 'retrying' | 'failed'> {
  const { data: webhook } = await supabaseAdmin
    .from('agent_webhooks')
    .select('id, url, secret, failure_count, is_active, last_failure_at')
    .eq('id', delivery.webhook_id)
    .single();

  if (!webhook) {
    await supabaseAdmin
      .from('webhook_deliveries')
      .update({
        status: 'failed',
        error_message: 'Webhook not found or inactive',
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', delivery.id);
    return 'failed';
  }

  // Auto-reset circuit breaker if cooldown has passed (tunnel may have recovered)
  if (!webhook.is_active) {
    const cooldownThreshold = new Date(Date.now() - CIRCUIT_RESET_COOLDOWN_MS);
    const lastFailure = webhook.last_failure_at ? new Date(webhook.last_failure_at as string) : null;
    if (!lastFailure || lastFailure < cooldownThreshold) {
      await supabaseAdmin
        .from('agent_webhooks')
        .update({ is_active: true, failure_count: 0 })
        .eq('id', webhook.id);
      console.log(`[Webhook] Auto-reset circuit-tripped webhook ${webhook.id} after cooldown`);
    } else {
      await supabaseAdmin
        .from('webhook_deliveries')
        .update({
          status: 'failed',
          error_message: 'Webhook disabled (circuit open, cooldown not elapsed)',
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);
      return 'failed';
    }
  }

  const body = JSON.stringify(delivery.payload);
  const signature = createHmac('sha256', webhook.secret).update(body).digest('hex');
  const attempt = (delivery.attempts || 0) + 1;
  const maxAttempts = delivery.max_attempts || DIRECT_MAX_RETRIES;

  try {
    // safeFetch re-resolves the hostname (DNS-rebinding prevention) and
    // pins the request to the resolved IP with redirects disabled.
    const deliveryPayload = delivery.payload as unknown as WebhookPayload;
    const response = await safeFetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Event': delivery.event_type,
        'X-Webhook-Timestamp': new Date().toISOString(),
        'X-Delivery-Id': deliveryPayload.deliveryId ?? delivery.id,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      await supabaseAdmin
        .from('webhook_deliveries')
        .update({
          status: 'delivered',
          attempts: attempt,
          last_attempt_at: new Date().toISOString(),
          response_status: response.status,
          delivered_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', delivery.id);

      await supabaseAdmin
        .from('agent_webhooks')
        .update({
          last_success_at: new Date().toISOString(),
          failure_count: 0,
        })
        .eq('id', webhook.id);

      return 'delivered';
    }

    return await markWebhookDeliveryFailed(
      delivery.id,
      webhook.id,
      attempt,
      maxAttempts,
      `HTTP ${response.status}`,
      response.status
    );
  } catch (error) {
    return await markWebhookDeliveryFailed(
      delivery.id,
      webhook.id,
      attempt,
      maxAttempts,
      error instanceof Error ? error.message : 'Delivery failed',
      null
    );
  }
}

async function markWebhookDeliveryFailed(
  deliveryId: string,
  webhookId: string,
  attempt: number,
  maxAttempts: number,
  errorMessage: string,
  responseStatus: number | null
): Promise<'retrying' | 'failed'> {
  const nextRetryAt = attempt < maxAttempts
    ? new Date(Date.now() + DIRECT_RETRY_BASE_MS * Math.pow(2, attempt - 1)).toISOString()
    : null;

  const status = attempt < maxAttempts ? 'retrying' : 'failed';

  await supabaseAdmin
    .from('webhook_deliveries')
    .update({
      status,
      attempts: attempt,
      last_attempt_at: new Date().toISOString(),
      response_status: responseStatus,
      error_message: errorMessage,
      next_retry_at: nextRetryAt,
    })
    .eq('id', deliveryId);

  const { data: webhook } = await supabaseAdmin
    .from('agent_webhooks')
    .select('failure_count')
    .eq('id', webhookId)
    .single();

  const newFailureCount = (webhook?.failure_count || 0) + 1;
  const updates: Record<string, unknown> = {
    failure_count: newFailureCount,
    last_failure_at: new Date().toISOString(),
    last_failure_reason: errorMessage,
  };

  if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
    updates.is_active = false;
    console.warn(`[Webhook] Auto-disabled webhook ${webhookId} after ${newFailureCount} failures`);
  }

  await supabaseAdmin
    .from('agent_webhooks')
    .update(updates)
    .eq('id', webhookId);

  return status;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// Helpers
// ==========================================

function mapWebhook(data: Record<string, unknown>): Webhook {
  return {
    id: data.id as string,
    agentId: data.agent_id as string,
    url: data.url as string,
    events: data.events as WebhookEvent[],
    isActive: data.is_active as boolean,
    failureCount: data.failure_count as number,
    lastSuccessAt: data.last_success_at ? new Date(data.last_success_at as string) : null,
    lastFailureAt: data.last_failure_at ? new Date(data.last_failure_at as string) : null,
    createdAt: new Date(data.created_at as string),
  };
}

/**
 * Get webhook delivery history
 */
export async function getWebhookDeliveries(
  webhookId: string,
  options: { limit?: number; status?: string } = {}
): Promise<WebhookDelivery[]> {
  let query = supabaseAdmin
    .from('webhook_deliveries')
    .select('*')
    .eq('webhook_id', webhookId)
    .order('created_at', { ascending: false });

  if (options.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query.limit(options.limit || 20);

  if (error || !data) {
    return [];
  }

  return data.map(d => ({
    id: d.id,
    webhookId: d.webhook_id,
    eventType: d.event_type as WebhookEvent,
    payload: d.payload,
    status: d.status as 'pending' | 'delivered' | 'failed' | 'retrying',
    attempts: d.attempts,
    responseStatus: d.response_status,
    createdAt: new Date(d.created_at),
    deliveredAt: d.delivered_at ? new Date(d.delivered_at) : undefined,
  }));
}
