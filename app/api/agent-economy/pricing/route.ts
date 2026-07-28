/**
 * Pricing Oracle API
 * Returns market pricing data based on capability and agent statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  authenticateRequest,
  createAuthErrorResponse,
  addAgenticHeaders,
} from '@/lib/agent-economy/auth';


interface PricingStats {
  low: number;
  median: number;
  high: number;
  average: number;
  agentCount: number;
}

interface ReputationTier {
  minReputation: number;
  maxReputation: number;
  suggested: number;
  agentCount: number;
}

/**
 * Calculate median of an array of numbers
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate percentile of an array
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * GET /api/agent-economy/pricing
 * Get market pricing data
 *
 * Query params:
 * - capability: Filter by capability (optional)
 * - category: Filter by task category (optional)
 */
export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'read');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;
  const searchParams = request.nextUrl.searchParams;

  const capability = searchParams.get('capability');
  const category = searchParams.get('category');

  try {
    // Build query for agents
    let query = supabaseAdmin
      .from('marketplace_agents')
      .select('hourly_rate, rating, jobs_completed, capabilities')
      .eq('is_available', true);

    if (capability) {
      query = query.contains('capabilities', [capability]);
    }

    const { data: agents, error: agentsError } = await query;

    if (agentsError) {
      console.error('[Pricing API] Agents query error:', agentsError);
      const response = NextResponse.json(
        { success: false, error: 'Failed to fetch pricing data', requestId: context.requestId },
        { status: 500 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    // Extract prices (convert to numbers)
    const prices = (agents || [])
      .map(a => parseFloat(String(a.hourly_rate ?? 0)))
      .filter(p => p > 0);

    if (prices.length === 0) {
      const response = NextResponse.json({
        success: true,
        market: {
          low: 0,
          median: 0,
          high: 0,
          average: 0,
          agentCount: 0,
        },
        byReputation: [],
        message: capability
          ? `No agents found with capability: ${capability}`
          : 'No agents found',
        requestId: context.requestId,
      });
      return addAgenticHeaders(response, context, rateLimit);
    }

    // Calculate market stats
    const market: PricingStats = {
      low: Math.min(...prices),
      median: median(prices),
      high: Math.max(...prices),
      average: prices.reduce((a, b) => a + b, 0) / prices.length,
      agentCount: prices.length,
    };

    // Calculate pricing by reputation tier
    const reputationTiers: ReputationTier[] = [];

    const tierBounds = [
      { min: 0, max: 25, label: 'newcomer' },
      { min: 25, max: 50, label: 'established' },
      { min: 50, max: 75, label: 'experienced' },
      { min: 75, max: 100, label: 'expert' },
    ];

    for (const tier of tierBounds) {
      const tierAgents = (agents || []).filter(a => {
        const rep = (a.rating || 0) * 20;
        return rep >= tier.min && rep < tier.max;
      });

      const tierPrices = tierAgents
        .map(a => parseFloat(String(a.hourly_rate ?? 0)))
        .filter(p => p > 0);

      if (tierPrices.length > 0) {
        reputationTiers.push({
          minReputation: tier.min,
          maxReputation: tier.max,
          suggested: Math.round(median(tierPrices) * 100) / 100,
          agentCount: tierPrices.length,
        });
      }
    }

    // Get historical task pricing if category specified
    let categoryStats = null;
    if (category) {
      const { data: tasks } = await supabaseAdmin
        .from('collaborate_tasks')
        .select('reward, collaborate_missions!inner(category)')
        .eq('collaborate_missions.category', category)
        .eq('status', 'approved')
        .limit(100);

      if (tasks && tasks.length > 0) {
        const taskRewards = tasks
          .map(t => parseFloat(String(t.reward ?? 0)))
          .filter(r => r > 0);

        if (taskRewards.length > 0) {
          categoryStats = {
            category,
            completedTasks: taskRewards.length,
            low: Math.min(...taskRewards),
            median: median(taskRewards),
            high: Math.max(...taskRewards),
            average: taskRewards.reduce((a, b) => a + b, 0) / taskRewards.length,
          };
        }
      }
    }

    // Suggested pricing formulas
    const suggested = {
      forNewcomer: Math.round(percentile(prices, 25) * 100) / 100,
      forEstablished: Math.round(median(prices) * 100) / 100,
      forExperienced: Math.round(percentile(prices, 75) * 100) / 100,
      forExpert: Math.round(percentile(prices, 90) * 100) / 100,
    };

    const response = NextResponse.json({
      success: true,
      market: {
        ...market,
        low: Math.round(market.low * 100) / 100,
        median: Math.round(market.median * 100) / 100,
        high: Math.round(market.high * 100) / 100,
        average: Math.round(market.average * 100) / 100,
      },
      byReputation: reputationTiers,
      suggested,
      categoryStats,
      filters: {
        capability: capability || null,
        category: category || null,
      },
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Pricing API] Error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}
