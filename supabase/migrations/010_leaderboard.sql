-- Migration 010: leaderboard support
-- Add username to profiles so users can set a display name
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;

-- Fetch top N users by points (SECURITY DEFINER bypasses RLS so anyone can view)
-- Only uses id/points/username which are guaranteed to exist in profiles
DROP FUNCTION IF EXISTS fetch_leaderboard(int);
CREATE FUNCTION fetch_leaderboard(p_limit int DEFAULT 25)
RETURNS TABLE (id uuid, username text, points int)
SECURITY DEFINER
LANGUAGE sql STABLE AS $$
  SELECT id, username, points
  FROM profiles
  WHERE COALESCE(points, 0) > 0
  ORDER BY points DESC NULLS LAST
  LIMIT p_limit;
$$;
