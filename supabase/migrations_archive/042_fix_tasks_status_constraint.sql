-- Fix collaborate_tasks status CHECK constraint.
-- The constraint was incorrectly set to mission statuses ('recruiting', 'in_progress', 'completed', 'cancelled').
-- Task statuses are: pending → assigned → in_progress → submitted → approved/rejected.
ALTER TABLE collaborate_tasks
  DROP CONSTRAINT IF EXISTS collaborate_tasks_status_check;

ALTER TABLE collaborate_tasks
  ADD CONSTRAINT collaborate_tasks_status_check
  CHECK (status IN ('pending', 'assigned', 'in_progress', 'submitted', 'approved', 'rejected'));
