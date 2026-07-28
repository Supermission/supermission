/**
 * Shared web research for DELPHI & SECURO agents.
 * Uses Exa REST API directly (no SDK dependency) with Firecrawl fallback.
 * Results cached in Supabase for 1 hour.
 */

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResearchSnippet {
  title: string;
  url: string;
  excerpt: string;
}

export interface ResearchResult {
  query: string;
  oneLiner: string;
  snippets: ResearchSnippet[];
  cached: boolean;
  source?: 'exa' | 'firecrawl';
}

// ---------------------------------------------------------------------------
// Supabase client for cache
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function normalizeCacheKey(query: string): string {
  return query.toLowerCase().trim().slice(0, 200);
}

async function getCached(cacheKey: string): Promise<ResearchResult | null> {
  if (!db) return null;
  try {
    const { data } = await db
      .from('oracle_research_cache')
      .select('result, created_at')
      .eq('cache_key', cacheKey)
      .single();

    if (!data) return null;

    const age = Date.now() - new Date(data.created_at).getTime();
    if (age > CACHE_TTL_MS) return null;

    return { ...(data.result as ResearchResult), cached: true };
  } catch {
    return null;
  }
}

function writeCache(cacheKey: string, query: string, result: ResearchResult): void {
  if (!db) return;
  Promise.resolve(
    db.from('oracle_research_cache')
      .upsert({ cache_key: cacheKey, query, result, created_at: new Date().toISOString() })
  ).catch((err: unknown) => console.warn('[Research] Cache write failed:', err));
}

// ---------------------------------------------------------------------------
// One-liner extractor
// ---------------------------------------------------------------------------

function extractOneLiner(text: string): string {
  if (!text) return 'No relevant context found.';
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
  const take = sentences.slice(0, 2).join('. ').trim();
  return take.length > 150 ? take.slice(0, 147) + '...' : take + '.';
}

// ---------------------------------------------------------------------------
// Exa search via REST API (no SDK needed)
// ---------------------------------------------------------------------------

async function searchExa(query: string): Promise<ResearchResult | null> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query,
        type: 'auto',
        numResults: 3,
        category: 'news',
        contents: {
          highlights: { numSentences: 3, highlightsPerUrl: 3 },
        },
      }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const docs = json.results || [];
    if (docs.length === 0) return null;

    const snippets: ResearchSnippet[] = docs
      .filter((doc: any) => doc.url)
      .map((doc: any) => {
        const highlightText = (doc.highlights || []).join(' ');
        return {
          title: doc.title || doc.url,
          url: doc.url,
          excerpt: (highlightText || doc.text || '').slice(0, 1000),
        };
      });

    const oneLiner = extractOneLiner(snippets[0]?.excerpt || '');
    return { query, oneLiner, snippets, cached: false, source: 'exa' };
  } catch (err) {
    console.warn('[Research] Exa search failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Firecrawl search via REST API (no SDK needed)
// ---------------------------------------------------------------------------

async function searchFirecrawl(query: string): Promise<ResearchResult | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, limit: 2 }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const docs = json.data || [];

    const snippets: ResearchSnippet[] = docs
      .filter((doc: any) => doc.url && (doc.markdown || doc.title))
      .map((doc: any) => ({
        title: doc.title || doc.url,
        url: doc.url,
        excerpt: (doc.markdown || '').slice(0, 1000),
      }));

    if (snippets.length === 0) return null;

    const oneLiner = extractOneLiner(snippets[0]?.excerpt || '');
    return { query, oneLiner, snippets, cached: false, source: 'firecrawl' };
  } catch (err) {
    console.warn('[Research] Firecrawl search failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main research function — Exa first, Firecrawl fallback
// ---------------------------------------------------------------------------

export async function researchTopic(query: string): Promise<ResearchResult> {
  const cacheKey = normalizeCacheKey(query);

  // 1. Check cache
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  // 2. Try Exa (fast, ~1s)
  const exaResult = await searchExa(query);
  if (exaResult && exaResult.snippets.length > 0) {
    writeCache(cacheKey, query, exaResult);
    return exaResult;
  }

  // 3. Fallback to Firecrawl
  const firecrawlResult = await searchFirecrawl(query);
  if (firecrawlResult && firecrawlResult.snippets.length > 0) {
    writeCache(cacheKey, query, firecrawlResult);
    return firecrawlResult;
  }

  // 4. Graceful degradation
  return { query, oneLiner: 'Research unavailable', snippets: [], cached: false };
}
