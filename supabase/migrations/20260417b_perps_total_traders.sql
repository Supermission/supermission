-- All-time distinct trader count for the perps admin page.
-- `admin_perps_top_traders` returns only the top 20 by volume, so using its
-- result as "total traders" caps the count at 20.

CREATE OR REPLACE FUNCTION admin_perps_total_traders()
RETURNS BIGINT AS $$
  SELECT COUNT(DISTINCT user_id)::BIGINT
  FROM hyperion_trades;
$$ LANGUAGE sql STABLE;
