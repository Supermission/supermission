/**
 * Health Check Endpoint
 * Returns system health status for monitoring and agentic clients
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';


interface ServiceCheck {
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  services: {
    database: ServiceCheck;
    payments: ServiceCheck;
    privy: ServiceCheck;
  };
  timestamp: string;
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const { error } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id')
      .limit(1);

    const latencyMs = Date.now() - start;

    if (error) {
      return { status: 'down', latencyMs, error: error.message };
    }

    // Degraded if latency > 1 second
    if (latencyMs > 1000) {
      return { status: 'degraded', latencyMs };
    }

    return { status: 'up', latencyMs };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Check payment service (x402) availability
 * Just verifies required env vars are present
 */
async function checkPaymentService(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    // Check required env vars for x402 payments
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ];

    const missingVars = requiredEnvVars.filter(v => !process.env[v]);

    if (missingVars.length > 0) {
      return {
        status: 'degraded',
        latencyMs: Date.now() - start,
        error: `Missing env vars: ${missingVars.join(', ')}`,
      };
    }

    // Check if Privy server wallet is configured for on-chain operations
    const hasPrivyServer = Boolean(
      process.env.PRIVY_APP_SECRET && process.env.NEXT_PUBLIC_PRIVY_APP_ID
    );

    return {
      status: hasPrivyServer ? 'up' : 'degraded',
      latencyMs: Date.now() - start,
      error: hasPrivyServer ? undefined : 'PRIVY_APP_SECRET not configured (on-chain payments disabled)',
    };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Check Privy connectivity
 * Lightweight test: verify credentials are configured
 */
async function checkPrivy(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const hasCredentials = Boolean(
      process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.PRIVY_APP_SECRET
    );

    if (!hasCredentials) {
      return {
        status: 'degraded',
        latencyMs: Date.now() - start,
        error: 'Privy credentials not configured',
      };
    }

    // Quick connectivity check via Privy Node SDK
    const { PrivyClient } = await import('@privy-io/node');
    const privy = new PrivyClient({
      appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      appSecret: process.env.PRIVY_APP_SECRET!,
    });

    // Race against a 5s timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Privy health check timed out')), 5000)
    );

    // Try to list wallets as a health check (will return empty or error)
    await Promise.race([
      privy.users().list().catch(() => 'ok'),
      timeoutPromise,
    ]);

    const latencyMs = Date.now() - start;
    return {
      status: latencyMs > 3000 ? 'degraded' : 'up',
      latencyMs,
    };
  } catch (err) {
    return {
      status: 'degraded', // Privy down = degraded, not unhealthy
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * GET /api/agent-economy/health
 * Public endpoint - no authentication required
 */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  const [dbCheck, paymentCheck, privyCheck] = await Promise.all([
    checkDatabase(),
    checkPaymentService(),
    checkPrivy(),
  ]);

  // Determine overall status
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Database is critical
  if (dbCheck.status === 'down') {
    overallStatus = 'unhealthy';
  } else if (
    dbCheck.status === 'degraded' ||
    paymentCheck.status === 'degraded' ||
    privyCheck.status === 'degraded'
  ) {
    overallStatus = 'degraded';
  }

  // Payment service down = degraded (not critical)
  if (paymentCheck.status === 'down') {
    overallStatus = overallStatus === 'unhealthy' ? 'unhealthy' : 'degraded';
  }

  const response: HealthResponse = {
    status: overallStatus,
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: dbCheck,
      payments: paymentCheck,
      privy: privyCheck,
    },
    timestamp: new Date().toISOString(),
  };

  // Return 200 for healthy/degraded, 503 for unhealthy
  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;

  return NextResponse.json(response, { status: httpStatus });
}
