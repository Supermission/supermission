-- Oracle chat search acceleration.
--
-- Context: lib/ai/oracle/tools.ts → search_markets currently fetches up to 400
-- rows via ILIKE OR-queries across question/description/event_slug, then
-- JS-filters by match-date (extracted from event_slug). With the existing
-- idx_market_catalog_question_trgm index, keyword matches against `question`
-- are already fast. This migration covers the remaining two cases:
--   1. ILIKE matches on `description` and `event_slug` (currently full-scan).
--   2. Time-window filtering by slug-embedded match date (currently JS-only).

-- pg_trgm is already enabled in 000_baseline; safety guard in case of a
-- non-baseline DB.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ────────────────────────────────────────────────────────────────────────────
-- Trigram GIN indexes for ILIKE matches used by search_markets
-- ────────────────────────────────────────────────────────────────────────────

-- description is queried via ILIKE %keyword% during fuzzy keyword search.
-- Without this index the planner does a sequential scan of ~5K rows per query.
CREATE INDEX IF NOT EXISTS idx_market_catalog_description_trgm
  ON market_catalog USING GIN (description gin_trgm_ops);

-- event_slug is queried via (a) ILIKE %keyword% for fuzzy match and
-- (b) ILIKE 'cricipl-%' / 'uefa-champions-league%' for league-prefix match.
-- The same GIN trigram index accelerates both.
CREATE INDEX IF NOT EXISTS idx_market_catalog_event_slug_trgm
  ON market_catalog USING GIN (event_slug gin_trgm_ops);

-- ────────────────────────────────────────────────────────────────────────────
-- match_date — the actual match-day extracted from slug patterns like
--   cricipl-guj-kol-2026-04-17        → 2026-04-17
--   will-liverpool-win-on-2026-04-23  → 2026-04-23
--   nba-lakers-vs-celtics-2026-04-20  → 2026-04-20
-- Stored (not virtual) so it can be indexed. NULL for long-running futures
-- whose slugs don't embed a date (e.g. uefa-champions-league-winner).
-- ────────────────────────────────────────────────────────────────────────────

-- Helper: extract first YYYY-MM-DD from a text column (returns NULL if absent
-- or invalid). IMMUTABLE so it can power a generated column. Uses plpgsql with
-- an exception handler so garbage regex matches (e.g. 0000-13-45 in a slug
-- fragment) coerce to NULL instead of raising.
CREATE OR REPLACE FUNCTION extract_slug_date(slug_text TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  matched TEXT;
BEGIN
  IF slug_text IS NULL THEN RETURN NULL; END IF;
  matched := substring(slug_text FROM '\d{4}-\d{2}-\d{2}');
  IF matched IS NULL THEN RETURN NULL; END IF;
  RETURN matched::DATE;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

ALTER TABLE market_catalog
  ADD COLUMN IF NOT EXISTS match_date DATE
  GENERATED ALWAYS AS (
    COALESCE(extract_slug_date(event_slug), extract_slug_date(slug))
  ) STORED;

-- Composite index used by search_markets for "happening within N days" queries.
-- Only active markets with a match_date are in scope; partial index keeps it small.
CREATE INDEX IF NOT EXISTS idx_market_catalog_active_match_date
  ON market_catalog (match_date)
  WHERE is_active = true AND match_date IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Hot-path composite: active + end_date. search_markets always filters
-- is_active=true and commonly needs end_date >= now() to drop resolved markets.
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_market_catalog_active_end_date
  ON market_catalog (end_date)
  WHERE is_active = true;

ANALYZE market_catalog;
