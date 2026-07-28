import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// Main categories to show (curated list of broad categories)
const MAIN_CATEGORIES = [
  'Politics',
  'Finance',
  'Tech',
  'Crypto',
  'Sports',
  'Business',
  'Geopolitics',
  'AI',
];

/**
 * GET /api/prediction-market/categories
 * Fetches distinct categories from market_catalog table
 * Returns only main categories that have markets with AI predictions
 */
export async function GET() {
  try {
    // Query distinct categories from active markets with AI predictions
    const { data, error } = await supabase
      .from('market_catalog')
      .select('categories')
      .eq('is_active', true)
      .not('ai_confidence', 'is', null)
      .gte('end_date', new Date().toISOString());

    if (error) {
      console.error('[Categories API] Error:', error);
      return NextResponse.json({ categories: [] }, { status: 200 });
    }

    // Count occurrences of each category
    const categoryCounts = new Map<string, number>();
    data?.forEach((row) => {
      if (Array.isArray(row.categories)) {
        row.categories.forEach((cat: string) => {
          // Normalize category names (capitalize first letter)
          const normalized = cat.charAt(0).toUpperCase() + cat.slice(1);
          categoryCounts.set(normalized, (categoryCounts.get(normalized) || 0) + 1);
        });
      }
    });

    // Filter to only include main categories that exist in the data
    const availableMainCategories = MAIN_CATEGORIES.filter(cat =>
      categoryCounts.has(cat)
    );

    // If we have main categories, return them; otherwise return top 8 by count
    const cacheHeaders = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' };

    if (availableMainCategories.length >= 3) {
      return NextResponse.json({ categories: availableMainCategories }, { headers: cacheHeaders });
    }

    // Fallback: get top 8 categories by count
    const sortedCategories = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([cat]) => cat);

    return NextResponse.json({ categories: sortedCategories }, { headers: cacheHeaders });
  } catch (error) {
    console.error('[Categories API] Error:', error);
    return NextResponse.json({ categories: [] }, { status: 200 });
  }
}
