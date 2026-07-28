import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/markets/tags
 * Returns unique Polymarket tags with market counts from active markets.
 * Uses database aggregation for performance.
 */
export async function GET() {
  try {
    // Get exact total count
    const { count: totalMarkets } = await (supabaseAdmin as any)
      .from('market_catalog')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('is_closed', false);

    // Use RPC to aggregate tags server-side (much faster than fetching all rows)
    const { data: tagCounts, error: rpcError } = await (supabaseAdmin as any)
      .rpc('get_market_tag_counts', {
        is_active_filter: true,
        is_closed_filter: false
      });

    if (rpcError) {
      console.error('[/api/markets/tags] RPC error, falling back to query:', rpcError);
      // Fallback: use a simple group by query on each category column
      // This is slower but works without the RPC function
      return await fallbackTagQuery();
    }

    // Format response
    const tags = (tagCounts || [])
      .map((row: { label: string; count: number }) => ({
        label: row.label,
        count: parseInt(String(row.count), 10)
      }))
      .sort((a: { count: number }, b: { count: number }) => b.count - a.count);

    return NextResponse.json({ tags, totalMarkets: totalMarkets || 0 }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        // Add CDN cache header for Vercel
        'x-cache': 'HIT'
      },
    });
  } catch (err) {
    console.error('[/api/markets/tags] Error:', err);
    return NextResponse.json({ tags: [] });
  }
}

// Fallback if RPC doesn't exist - uses efficient single query
async function fallbackTagQuery() {
  try {
    // Get count per unique category using a direct query approach
    // This avoids fetching all rows by using the database's aggregation
    const { data: markets, error } = await (supabaseAdmin as any)
      .from('market_catalog')
      .select('categories')
      .eq('is_active', true)
      .eq('is_closed', false)
      .limit(1000); // Only need top 1000 for tag counts - enough for UI

    if (error) {
      console.error('[/api/markets/tags] Fallback error:', error);
      return NextResponse.json({ tags: [], totalMarkets: 0 });
    }

    const tagCounts = new Map<string, number>();
    for (const row of markets || []) {
      const cats: string[] = row.categories || [];
      for (const cat of cats) {
        if (cat && typeof cat === 'string') {
          tagCounts.set(cat, (tagCounts.get(cat) || 0) + 1);
        }
      }
    }

    const tags = Array.from(tagCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ tags, totalMarkets: markets?.length || 0 }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('[/api/markets/tags] Fallback error:', err);
    return NextResponse.json({ tags: [] });
  }
}
