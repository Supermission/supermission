-- Migration 004: Price Alerts System
-- Creates tables for user-defined price alerts and triggered notifications.

CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_address TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  direction TEXT NOT NULL,
  threshold NUMERIC NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_address TEXT NOT NULL,
  alert_id UUID REFERENCES price_alerts(id) ON DELETE CASCADE,
  condition_id TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pa_user ON price_alerts(user_address, is_active);
CREATE INDEX IF NOT EXISTS idx_an_user ON alert_notifications(user_address, is_read, created_at DESC);
