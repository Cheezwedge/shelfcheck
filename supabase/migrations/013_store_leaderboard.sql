-- Migration 013: per-store leaderboard
CREATE FUNCTION fetch_store_leaderboard(p_store_id uuid, p_limit int DEFAULT 5)
RETURNS TABLE (id uuid, username text, report_count bigint, featured_badge_id text)
SECURITY DEFINER
LANGUAGE sql STABLE AS $$
  SELECT
    rpt.user_id                AS id,
    prf.username,
    COUNT(*)                   AS report_count,
    prf.featured_badge_id
  FROM reports rpt
  LEFT JOIN profiles prf ON prf.id = rpt.user_id
  WHERE rpt.store_id = p_store_id
    AND rpt.user_id IS NOT NULL
  GROUP BY rpt.user_id, prf.username, prf.featured_badge_id
  ORDER BY report_count DESC
  LIMIT p_limit;
$$;
