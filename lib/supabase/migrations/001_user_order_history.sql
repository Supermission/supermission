CREATE TABLE IF NOT EXISTS user_order_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_address TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  condition_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  side TEXT NOT NULL,
  order_type TEXT NOT NULL,
  price NUMERIC NOT NULL,
  original_size NUMERIC NOT NULL,
  filled_size NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uoh_user ON user_order_history(user_address, status);
