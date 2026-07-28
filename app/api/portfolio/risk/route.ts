import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

interface PolymarketPosition {
  asset: string;
  conditionId: string;
  size: string;
  avgPrice: string;
  currentPrice: string;
  outcome: string;
  market: string;
  // Polymarket may include additional fields
  [key: string]: unknown;
}

interface RiskPosition {
  conditionId: string;
  question: string;
  outcome: string;
  size: number;
  currentPrice: number;
  entryPrice: number;
  pnl: number;
  category: string;
  weight: number;
}

interface CategoryExposure {
  category: string;
  value: number;
  percentage: number;
}

interface CorrelationPair {
  marketA: string;
  marketB: string;
  correlation: number;
}

interface PortfolioRisk {
  totalValue: number;
  positionCount: number;
  categoryExposure: CategoryExposure[];
  correlationMatrix: CorrelationPair[];
  maxDrawdown: number;
  concentrationIndex: number;
  positions: RiskPosition[];
}

/**
 * GET /api/portfolio/risk?address={address}
 *
 * Computes portfolio risk metrics for a given Polymarket user address.
 */
export async function GET(request: NextRequest) {
  try {
    const address = request.headers.get('x-verified-wallet')?.split(',')[0];
    if (!address) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Fetch positions from Polymarket Data API
    const positionsRes = await fetch(
      `https://data-api.polymarket.com/positions?user=${encodeURIComponent(address)}`,
      { next: { revalidate: 60 } }
    );

    if (!positionsRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch positions from Polymarket (${positionsRes.status})` },
        { status: 502 }
      );
    }

    const rawPositions: PolymarketPosition[] = await positionsRes.json();

    if (!rawPositions || rawPositions.length === 0) {
      const emptyRisk: PortfolioRisk = {
        totalValue: 0,
        positionCount: 0,
        categoryExposure: [],
        correlationMatrix: [],
        maxDrawdown: 0,
        concentrationIndex: 0,
        positions: [],
      };
      return NextResponse.json(emptyRisk);
    }

    // Collect unique condition IDs to look up in market_catalog
    const conditionIds = [...new Set(rawPositions.map((p) => p.conditionId).filter(Boolean))];

    // Fetch market catalog data from Supabase
    const { data: catalogRows, error: dbError } = await (supabaseAdmin as any)
      .from('market_catalog')
      .select('condition_id, question, categories, tags')
      .in('condition_id', conditionIds);

    if (dbError) {
      console.error('[portfolio/risk] Supabase error:', dbError);
    }

    // Build a lookup map: conditionId -> catalog row
    const catalogMap = new Map<string, { question: string; categories: string[]; tags: string[] }>();
    if (catalogRows) {
      for (const row of catalogRows) {
        catalogMap.set(row.condition_id, {
          question: row.question || 'Unknown Market',
          categories: Array.isArray(row.categories) ? row.categories : [],
          tags: Array.isArray(row.tags) ? row.tags : [],
        });
      }
    }

    // Build risk positions
    const positions: RiskPosition[] = [];
    let totalValue = 0;

    for (const pos of rawPositions) {
      const size = parseFloat(pos.size) || 0;
      const currentPrice = parseFloat(pos.currentPrice) || 0;
      const entryPrice = parseFloat(pos.avgPrice) || 0;
      const positionValue = size * currentPrice;
      const pnl = size * (currentPrice - entryPrice);

      const catalog = catalogMap.get(pos.conditionId);
      const question = catalog?.question || pos.market || 'Unknown Market';
      const categories = catalog?.categories || [];
      const primaryCategory = categories.length > 0 ? categories[0] : 'Uncategorized';

      totalValue += positionValue;

      positions.push({
        conditionId: pos.conditionId,
        question,
        outcome: pos.outcome || 'Yes',
        size,
        currentPrice,
        entryPrice,
        pnl,
        category: primaryCategory,
        weight: 0, // will compute after we know totalValue
      });
    }

    // Compute weights
    for (const pos of positions) {
      pos.weight = totalValue > 0 ? (pos.size * pos.currentPrice) / totalValue : 0;
    }

    // Sort positions by weight descending
    positions.sort((a, b) => b.weight - a.weight);

    // Category exposure
    const categoryMap = new Map<string, number>();
    for (const pos of positions) {
      const val = pos.size * pos.currentPrice;
      categoryMap.set(pos.category, (categoryMap.get(pos.category) || 0) + val);
    }

    const categoryExposure: CategoryExposure[] = Array.from(categoryMap.entries())
      .map(([category, value]) => ({
        category,
        value,
        percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    // Concentration Index (HHI): sum of (weight_i)^2
    const concentrationIndex = positions.reduce((sum, pos) => sum + pos.weight * pos.weight, 0);

    // Max drawdown: worst case if all positions go to 0
    const maxDrawdown = totalValue;

    // Correlation estimates (heuristic based on shared categories/tags)
    const correlationMatrix: CorrelationPair[] = [];

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const posA = positions[i];
        const posB = positions[j];

        const catalogA = catalogMap.get(posA.conditionId);
        const catalogB = catalogMap.get(posB.conditionId);

        const catsA = catalogA?.categories || [];
        const catsB = catalogB?.categories || [];
        const tagsA = catalogA?.tags || [];
        const tagsB = catalogB?.tags || [];

        // Determine correlation heuristic
        const sharedCategory = catsA.some((c: string) => catsB.includes(c));
        const sharedTag = tagsA.some((t: string) => tagsB.includes(t));

        let correlation = 0.1; // default: low correlation
        if (sharedCategory) {
          correlation = 0.6;
        } else if (sharedTag) {
          correlation = 0.3;
        }

        correlationMatrix.push({
          marketA: posA.conditionId,
          marketB: posB.conditionId,
          correlation,
        });
      }
    }

    const riskData: PortfolioRisk = {
      totalValue,
      positionCount: positions.length,
      categoryExposure,
      correlationMatrix,
      maxDrawdown,
      concentrationIndex,
      positions,
    };

    return NextResponse.json(riskData);
  } catch (error) {
    console.error('[portfolio/risk] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error computing portfolio risk' },
      { status: 500 }
    );
  }
}
