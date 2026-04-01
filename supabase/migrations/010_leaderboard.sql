-- Migration 010: leaderboard support
-- Add username to profiles so users can set a display name
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;

-- Fetch top N users by points (SECURITY DEFINER bypasses RLS so anyone can view)
CREATE OR REPLACE FUNCTION fetch_leaderboard(p_limit int DEFAULT 25)
RETURNS TABLE (
  id             uuid,
  username       text,
  points         int,
  reports_count  int,
  accuracy_ratio numeric,
  joined_at      timestamptz
)
SECURITY DEFINER
LANGUAGE sql STABLE AS $$
  SELECT id, username, points, reports_count, accuracy_ratio, joined_at
  FROM profiles
  WHERE points > 0
  ORDER BY points DESC
  LIMIT p_limit;
$$;

-- Get the current user's rank on the leaderboard
CREATE OR REPLACE FUNCTION get_user_rank(p_user_id uuid)
RETURNS TABLE (rank bigint, total_users bigint)
SECURITY DEFINER
LANGUAGE sql STABLE AS $$
  SELECT
    (SELECT COUNT(*) + 1 FROM profiles
     WHERE points > COALESCE((SELECT points FROM profiles WHERE id = p_user_id), 0)) AS rank,
    (SELECT COUNT(*) FROM profiles WHERE points > 0) AS total_users;
$$;
