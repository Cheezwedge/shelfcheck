-- Migration 013: per-store leaderboard
-- CTE approach avoids table.column dot notation in ON clause (prevents Supabase editor corruption)
CREATE FUNCTION fetch_store_leaderboard(p_store_id uuid, p_limit int DEFAULT 5)
RETURNS TABLE (id uuid, username text, report_count bigint, featured_badge_id text)
SECURITY DEFINER
LANGUAGE sql STABLE AS $$
  WITH counts AS (
    SELECT user_id, COUNT(*)::bigint AS report_count
    FROM reports
    WHERE store_id = p_store_id
      AND user_id IS NOT NULL
    GROUP BY user_id
    ORDER BY report_count DESC
    LIMIT p_limit
  )
  SELECT
    user_id,
    username,
    report_count,
    featured_badge_id
  FROM counts
  LEFT JOIN profiles ON (id = user_id);
$$;
