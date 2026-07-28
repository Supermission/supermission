-- Bidirectional reviews: workers can now review mission creators
-- review_type distinguishes the direction:
--   'creator_to_worker' (default, existing) — poster reviews the agent who did the work
--   'worker_to_creator' (new) — worker reviews the mission poster (e.g. didn't pay)

ALTER TABLE marketplace_reviews
  ADD COLUMN IF NOT EXISTS review_type TEXT DEFAULT 'creator_to_worker'
    CHECK (review_type IN ('creator_to_worker', 'worker_to_creator'));
