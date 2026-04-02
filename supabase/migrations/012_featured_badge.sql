-- Migration 012: store featured badge id in profiles for leaderboard display
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS featured_badge_id text;

-- Rebuild leaderboard function to include featured_badge_id
DROP FUNCTION IF EXISTS fetch_leaderboard(int);
CREATE FUNCTION fetch_leaderboard(p_limit int DEFAULT 25)
RETURNS TABLE (id uuid, username text, points int, featured_badge_id text)
SECURITY DEFINER
LANGUAGE sql STABLE AS $$
  SELECT id, username, points, featured_badge_id
  FROM profiles
  WHERE COALESCE(points, 0) > 0
  ORDER BY points DESC NULLS LAST
  LIMIT p_limit;
$$;
