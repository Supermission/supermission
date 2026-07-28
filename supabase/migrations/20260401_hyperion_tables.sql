-- HYPERION agent chat sessions
CREATE TABLE IF NOT EXISTS hyperion_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  wallet_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- HYPERION chat messages
CREATE TABLE IF NOT EXISTS hyperion_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES hyperion_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trades executed via HYPERION
CREATE TABLE IF NOT EXISTS hyperion_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES hyperion_sessions(id),
  user_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  coin TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  size DECIMAL NOT NULL,
  price DECIMAL,
  order_type TEXT NOT NULL,
  leverage DECIMAL,
  status TEXT DEFAULT 'pending',
  hl_order_id TEXT,
  hl_response JSONB,
  agent_reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  filled_at TIMESTAMPTZ
);

-- User perps preferences
CREATE TABLE IF NOT EXISTS perps_user_preferences (
  user_id TEXT PRIMARY KEY,
  default_leverage DECIMAL DEFAULT 1,
  max_position_size DECIMAL,
  risk_level TEXT DEFAULT 'moderate' CHECK (risk_level IN ('conservative', 'moderate', 'aggressive')),
  favorite_coins TEXT[] DEFAULT '{}',
  notifications JSONB DEFAULT '{"price_alerts": true, "fill_alerts": true, "funding_alerts": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hyperion_sessions_user ON hyperion_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_hyperion_messages_session ON hyperion_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_hyperion_trades_user ON hyperion_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_hyperion_trades_coin ON hyperion_trades(coin);
