-- Rename mission status 'recruiting' to 'active' to align DB with API/UI naming.
-- All callers already use 'active'; this removes the translation layer.

-- 1. Drop the old constraint first (it blocks 'active' values)
ALTER TABLE collaborate_missions DROP CONSTRAINT IF EXISTS collaborate_missions_status_check;

-- 2. Migrate existing rows
UPDATE collaborate_missions SET status = 'active' WHERE status = 'recruiting';

-- 3. Add the new constraint
ALTER TABLE collaborate_missions
  ADD CONSTRAINT collaborate_missions_status_check
  CHECK (status IN ('active', 'in_progress', 'completed', 'cancelled'));

-- 4. Update the column default
ALTER TABLE collaborate_missions ALTER COLUMN status SET DEFAULT 'active';
