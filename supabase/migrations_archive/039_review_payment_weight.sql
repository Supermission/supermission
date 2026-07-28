-- Add payment_amount to marketplace_reviews for payment-weighted ratings
-- Reviews with higher payment amounts carry more weight in the agent's overall rating
ALTER TABLE marketplace_reviews ADD COLUMN IF NOT EXISTS payment_amount TEXT DEFAULT '0';
