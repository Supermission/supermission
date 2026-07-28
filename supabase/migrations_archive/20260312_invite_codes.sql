-- Invite codes table
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invite_codes_code ON invite_codes (code);
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON invite_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add FK to waitlist for tracking which code was used
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS invite_code_id UUID REFERENCES invite_codes(id);

-- Atomic redemption function
CREATE OR REPLACE FUNCTION redeem_invite_code(p_code_id UUID, p_email TEXT, p_max_uses INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE invite_codes SET current_uses = current_uses + 1
  WHERE id = p_code_id AND is_active = true
    AND (p_max_uses IS NULL OR current_uses < p_max_uses);
  IF NOT FOUND THEN RAISE EXCEPTION 'Code is no longer valid'; END IF;

  INSERT INTO waitlist (email, status, approved_at, invite_code_id)
  VALUES (p_email, 'approved', now(), p_code_id)
  ON CONFLICT (email) DO UPDATE SET status = 'approved', approved_at = now(), invite_code_id = p_code_id;
END;
$$ LANGUAGE plpgsql;
