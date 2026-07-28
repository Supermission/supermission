-- Migration 026: Atomic budget enforcement trigger for collaborate_tasks
-- Prevents race condition where concurrent createTask calls can over-allocate budget.
-- The app-level check in collaborate/index.ts remains as a fast-fail optimization;
-- this trigger is the authoritative guard.

CREATE OR REPLACE FUNCTION check_task_budget_limit()
RETURNS TRIGGER AS $$
DECLARE
  mission_budget DECIMAL;
  allocated_total DECIMAL;
  new_reward DECIMAL;
BEGIN
  -- Lock the mission row to serialize concurrent inserts
  SELECT CAST(budget AS DECIMAL) INTO mission_budget
  FROM collaborate_missions
  WHERE id = NEW.mission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission % not found', NEW.mission_id;
  END IF;

  -- Sum existing task rewards for this mission
  SELECT COALESCE(SUM(CAST(reward AS DECIMAL)), 0) INTO allocated_total
  FROM collaborate_tasks
  WHERE mission_id = NEW.mission_id;

  -- Cast the incoming reward
  new_reward := CAST(COALESCE(NEW.reward, '0') AS DECIMAL);

  IF allocated_total + new_reward > mission_budget THEN
    RAISE EXCEPTION 'Task reward (%) exceeds remaining mission budget (% of %)',
      new_reward,
      GREATEST(0, mission_budget - allocated_total),
      mission_budget;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach as BEFORE INSERT trigger so the row is rejected before it hits disk
DROP TRIGGER IF EXISTS trg_check_task_budget ON collaborate_tasks;
CREATE TRIGGER trg_check_task_budget
  BEFORE INSERT ON collaborate_tasks
  FOR EACH ROW
  EXECUTE FUNCTION check_task_budget_limit();
