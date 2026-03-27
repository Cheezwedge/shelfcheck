-- ─── Abuse Prevention Migration ──────────────────────────────────────────────
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE.

-- ─── 1. Add created_by + created_at to items ─────────────────────────────────
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();

-- Backfill created_at for existing rows
UPDATE items SET created_at = now() WHERE created_at IS NULL;

-- ─── 2. Add created_at to reports ────────────────────────────────────────────
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();

UPDATE reports SET created_at = now() WHERE created_at IS NULL;

-- ─── 3. One-report-per-item-per-user-per-day unique index ────────────────────
-- Prevents the same user from earning points more than once per item per day.
CREATE UNIQUE INDEX IF NOT EXISTS reports_one_per_day
  ON reports (item_id, user_id, (created_at::date));

-- ─── 4. Points trigger with cooldown guard ───────────────────────────────────
-- Replaces any existing trigger function that blindly awards points.
CREATE OR REPLACE FUNCTION handle_report_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  today date := (NEW.created_at AT TIME ZONE 'UTC')::date;
BEGIN
  -- Only award points when this is the FIRST report for this item today
  IF NOT EXISTS (
    SELECT 1 FROM reports
    WHERE item_id   = NEW.item_id
      AND user_id   = NEW.user_id
      AND (created_at AT TIME ZONE 'UTC')::date = today
      AND id        <> NEW.id   -- exclude the row we just inserted
  ) THEN
    INSERT INTO profiles (id, points, reports_count)
      VALUES (NEW.user_id, 10, 1)
    ON CONFLICT (id) DO UPDATE
      SET points        = profiles.points + 10,
          reports_count = profiles.reports_count + 1;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop old trigger if it exists under a different name, then recreate
DROP TRIGGER IF EXISTS on_report_inserted ON reports;
CREATE TRIGGER on_report_inserted
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE PROCEDURE handle_report_points();

-- ─── 5. RLS: items ───────────────────────────────────────────────────────────
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Anyone can read items
DROP POLICY IF EXISTS "items_select_all" ON items;
CREATE POLICY "items_select_all" ON items
  FOR SELECT USING (true);

-- Authenticated users can insert; rate-limited to 20 items per user per day
DROP POLICY IF EXISTS "items_insert_auth" ON items;
CREATE POLICY "items_insert_auth" ON items
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      SELECT COUNT(*) FROM items
      WHERE created_by = auth.uid()
        AND created_at::date = now()::date
    ) < 20
  );

-- ─── 6. RLS: stores ──────────────────────────────────────────────────────────
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- Anyone can read stores
DROP POLICY IF EXISTS "stores_select_all" ON stores;
CREATE POLICY "stores_select_all" ON stores
  FOR SELECT USING (true);

-- Authenticated users can insert stores
DROP POLICY IF EXISTS "stores_insert_auth" ON stores;
CREATE POLICY "stores_insert_auth" ON stores
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ─── 7. RLS: reports ─────────────────────────────────────────────────────────
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Anyone can read reports
DROP POLICY IF EXISTS "reports_select_all" ON reports;
CREATE POLICY "reports_select_all" ON reports
  FOR SELECT USING (true);

-- Authenticated and anonymous users can insert reports
DROP POLICY IF EXISTS "reports_insert_all" ON reports;
CREATE POLICY "reports_insert_all" ON reports
  FOR INSERT WITH CHECK (true);
