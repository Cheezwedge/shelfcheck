-- ─── Migration 014: Favorites sync + rate-limit enforcement (v2) ─────────────
-- Safe to re-run: all statements are idempotent.

-- ─── 1. Re-enforce one report per item per user per day ───────────────────────
-- Drop old index (may have been created without the WHERE clause which means
-- NULL user_ids could bypass it). Recreate with user_id IS NOT NULL guard.
-- Remove duplicate reports (same item + user + day), keeping only the earliest.
-- Required before the unique index can be created.
DELETE FROM reports
WHERE user_id IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (item_id, user_id, (created_at AT TIME ZONE 'UTC')::date)
      id
    FROM reports
    WHERE user_id IS NOT NULL
    ORDER BY item_id, user_id, (created_at AT TIME ZONE 'UTC')::date, created_at ASC
  );

DROP INDEX IF EXISTS reports_one_per_day;
CREATE UNIQUE INDEX IF NOT EXISTS reports_one_per_day
  ON reports (item_id, user_id, ((created_at AT TIME ZONE 'UTC')::date))
  WHERE user_id IS NOT NULL;

-- ─── 2. Favorite stores table for cross-device sync ───────────────────────────
CREATE TABLE IF NOT EXISTS favorite_stores (
  user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  osm_id    text        NOT NULL,
  name      text        NOT NULL,
  address   text        NOT NULL DEFAULT '',
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, osm_id)
);

ALTER TABLE favorite_stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "favs_select_own" ON favorite_stores;
CREATE POLICY "favs_select_own" ON favorite_stores
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "favs_insert_own" ON favorite_stores;
CREATE POLICY "favs_insert_own" ON favorite_stores
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "favs_update_own" ON favorite_stores;
CREATE POLICY "favs_update_own" ON favorite_stores
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "favs_delete_own" ON favorite_stores;
CREATE POLICY "favs_delete_own" ON favorite_stores
  FOR DELETE USING (auth.uid() = user_id);

-- ─── 3. Ensure confirm_pending_reports() exists and is callable ───────────────
-- (originally from migration 002 — redeclare idempotently so it's present
-- even if migration 002 was never run in this environment)
CREATE OR REPLACE FUNCTION confirm_pending_reports()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, user_id FROM reports
     WHERE confirmed_at    IS NULL
       AND contradicted_at IS NULL
       AND created_at < NOW() - INTERVAL '4 hours'
       AND user_id IS NOT NULL
  LOOP
    UPDATE profiles
       SET points         = COALESCE(points, 0) + 10,
           pending_points = GREATEST(0, COALESCE(pending_points, 0) - 10)
     WHERE id = r.user_id;

    UPDATE reports SET confirmed_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

-- Grant execute to authenticated and anon roles so the client can trigger it
GRANT EXECUTE ON FUNCTION confirm_pending_reports() TO authenticated, anon;
