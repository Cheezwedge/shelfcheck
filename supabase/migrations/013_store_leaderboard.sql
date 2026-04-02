-- Migration 013: per-store leaderboard
-- Uses correlated subqueries instead of JOIN aliases to avoid HTML tag corruption
CREATE FUNCTION fetch_store_leaderboard(p_store_id uuid, p_limit int DEFAULT 5)
RETURNS TABLE (id uuid, username text, report_count bigint, featured_badge_id text)
SECURITY DEFINER
LANGUAGE sql STABLE AS $$
  SELECT
    rpt.user_id AS id,
    (SELECT profiles.username FROM profiles WHERE profiles.id = rpt.user_id) AS username,
    COUNT(*) AS report_count,
    (SELECT profiles.featured_badge_id FROM profiles WHERE profiles.id = rpt.user_id) AS featured_badge_id
  FROM reports rpt
  WHERE rpt.store_id = p_store_id
    AND rpt.user_id IS NOT NULL
  GROUP BY rpt.user_id
  ORDER BY report_count DESC
  LIMIT p_limit;
$$;
