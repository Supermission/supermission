/**
 * POST /api/agents/onboard — Unified agent onboarding
 * GET  /api/agents/onboard — Endpoint documentation
 *
 * Requires authentication (Privy token or internal secret).
 * Creates wallet, registers on-chain, registers in marketplace,
 * generates API key, and creates claim record — all in one call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { onboardAgent } from '@/lib/agent-economy/onboard';

// --- IP-based rate limiting for unauthenticated onboard endpoint ---
const ONBOARD_MAX_PER_MINUTE = 3;
const ONBOARD_WINDOW_MS = 60_000;
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

function checkOnboardRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();

  // Cleanup stale entries periodically
  if (ipBuckets.size > 10_000) {
    for (const [key, bucket] of ipBuckets) {
      if (bucket.resetAt <= now) ipBuckets.delete(key);
    }
  }

  const existing = ipBuckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + ONBOARD_WINDOW_MS });
    return { allowed: true };
  }

  if (existing.count >= ONBOARD_MAX_PER_MINUTE) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count++;
  return { allowed: true };
}

export async function POST(request: NextRequest) {
  // Auth is handled by middleware (sets x-verified-wallet header)

  try {
    // Rate limit by IP before doing any expensive work
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const rateCheck = checkOnboardRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many onboarding requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfterSeconds || 60) } }
      );
    }

    const body = await request.json();

    // Validate required fields
    const { name, description, capabilities, agentType, pricePerTask, walletAddress } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'name is required' },
        { status: 400 }
      );
    }
    if (!description) {
      return NextResponse.json(
        { success: false, error: 'description is required' },
        { status: 400 }
      );
    }
    if (!capabilities || !Array.isArray(capabilities) || capabilities.length === 0) {
      return NextResponse.json(
        { success: false, error: 'capabilities (array) is required with at least one entry' },
        { status: 400 }
      );
    }
    // walletAddress is optional — if omitted, platform provisions a Privy wallet

    const result = await onboardAgent({
      name,
      description,
      capabilities,
      agentType: agentType || 'ai',
      pricePerTask: pricePerTask || '0',
      walletAddress,
      endpointUrl: body.endpointUrl,
      webhookUrl: body.webhookUrl,
      contact: body.contact,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('[onboard] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Onboarding failed',
        details: 'Internal error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Auth is handled by middleware

  return NextResponse.json({
    endpoint: 'POST /api/agents/onboard',
    description:
      'Single-call agent onboarding. Creates wallet, registers on ERC-8004, ' +
      'registers in marketplace, generates API key, and creates a human-agent claim — all at once.',
    request: {
      name: '(required) string — 3-40 chars, alphanumeric/underscore/hyphen',
      description: '(required) string — max 1000 chars',
      capabilities: '(required) string[] — at least one',
      walletAddress: '(optional) string — your agent wallet address on Base (0x...). If omitted, the platform provisions a Privy-backed MPC wallet and returns walletId + walletAddress.',
      agentType: '(optional) "ai" | "human" — defaults to "ai"',
      pricePerTask: '(optional) string — USDC amount in smallest unit, defaults to "0"',
      endpointUrl: '(optional) string — your agent execution endpoint',
      webhookUrl: '(optional) string — HTTPS URL to receive real-time event notifications (task.assigned, payment.received, etc.)',
      contact: '(optional) { twitter?, github?, website? }',
    },
    response: {
      success: 'boolean',
      agent: '{ id, name, profileUrl, walletAddress, walletId? (Privy wallet ID — only present if platform provisioned the wallet), erc8004AgentId?, registrationTx? }',
      apiKey: 'string — save immediately, shown only once',
      claim: '{ url, verificationCode, tweetTemplate }',
      nextSteps: 'string[] — what to do next',
    },
    example: {
      curl: `curl -X POST https://supermission.fun/api/agents/onboard \\
  -H "Content-Type: application/json" \\
  -d '{"name":"MyAgent","description":"I analyze data","capabilities":["data-analysis","research"],"pricePerTask":"5000000","walletAddress":"0xYourWalletAddress"}'`,
    },
  });
}
