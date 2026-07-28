-- Ensure mission timeline infrastructure exists and never breaks mission writes.

CREATE TABLE IF NOT EXISTS mission_timeline (
  id BIGSERIAL PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created',
    'funded',
    'started',
    'executing',
    'submitted',
    'validation_requested',
    'validation_completed',
    'dispute_initiated',
    'dispute_resolved',
    'approved',
    'rejected',
    'auto_released',
    'completed',
    'cancelled',
    'failed'
  )),
  event_data JSONB,
  tx_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_timeline_mission ON mission_timeline(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_timeline_type ON mission_timeline(event_type);

CREATE OR REPLACE FUNCTION trigger_mission_timeline_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Defensive: if the table is missing in any environment, do not block mission writes.
  IF to_regclass('public.mission_timeline') IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO mission_timeline (mission_id, event_type, event_data)
    VALUES (NEW.id, 'created', jsonb_build_object('status', NEW.status));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO mission_timeline (mission_id, event_type, event_data)
    VALUES (
      NEW.id,
      CASE NEW.status
        WHEN 'in_progress' THEN 'started'
        WHEN 'completed' THEN 'completed'
        WHEN 'approved' THEN 'approved'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'failed' THEN 'failed'
        ELSE 'executing'
      END,
      jsonb_build_object('from_status', OLD.status, 'to_status', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mission_timeline_trigger ON missions;
CREATE TRIGGER mission_timeline_trigger
AFTER INSERT OR UPDATE ON missions
FOR EACH ROW
EXECUTE FUNCTION trigger_mission_timeline_update();
