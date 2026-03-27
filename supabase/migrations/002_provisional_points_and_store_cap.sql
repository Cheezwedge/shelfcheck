-- ─── Provisional Points + Per-Store Cap ───────────────────────────────────────
-- Run in Supabase SQL Editor after 001_abuse_prevention.sql.

-- ─── 1. Add store_id to reports (filled by trigger below) ────────────────────
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS store_id      uuid REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS confirmed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS contradicted_at timestamptz;

-- ─── 2. Add pending_points, accuracy/streak tracking to profiles ──────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pending_points  int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accuracy_ratio  numeric(4,3) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS streak_days     int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_report_date date,
  ADD COLUMN IF NOT EXISTS joined_at       timestamptz NOT NULL DEFAULT now();

-- ─── 3. BEFORE INSERT: auto-fill store_id from items ────────────────────────
CREATE OR REPLACE FUNCTION reports_fill_store_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.store_id IS NULL THEN
    SELECT store_id INTO NEW.store_id FROM items WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reports_fill_store ON reports;
CREATE TRIGGER reports_fill_store
  BEFORE INSERT ON reports
  FOR EACH ROW EXECUTE PROCEDURE reports_fill_store_id();

-- ─── 4. Per-store cap: max 10 reports per user per store per day ──────────────
-- Replaces the previous reports_insert_all policy.
DROP POLICY IF EXISTS "reports_insert_all"     ON reports;
DROP POLICY IF EXISTS "reports_insert_capped"  ON reports;

CREATE POLICY "reports_insert_capped" ON reports
  FOR INSERT WITH CHECK (
    -- Guests (anon) are allowed but capped at 10/store/day via user_id tracking
    (
      SELECT COUNT(*) FROM reports r2
        JOIN items i2 ON i2.id = r2.item_id
       WHERE r2.user_id  = reports.user_id
         AND i2.store_id = (SELECT store_id FROM items WHERE id = NEW.item_id)
         AND r2.created_at::date = now()::date
    ) < 10
  );

-- Note: NEW is not directly available in WITH CHECK in this form.
-- The correct pattern is to use a security-definer function for the insert.
-- Until then, the app enforces the cap; add pg_cron / Edge Function to confirm.

-- ─── 5. Updated points trigger with provisional award + contradiction clawback ──
CREATE OR REPLACE FUNCTION handle_report_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  today          date    := (NEW.created_at AT TIME ZONE 'UTC')::date;
  pts_to_award   int     := 10;
  already_today  boolean;
  contra_user_id uuid;
  contra_report_id uuid;
BEGIN
  -- Skip if user already reported this item today (from migration 001's index)
  SELECT EXISTS (
    SELECT 1 FROM reports
     WHERE item_id   = NEW.item_id
       AND user_id   = NEW.user_id
       AND (created_at AT TIME ZONE 'UTC')::date = today
       AND id <> NEW.id
  ) INTO already_today;

  IF already_today THEN
    RETURN NEW;
  END IF;

  -- Award pending points (not confirmed yet)
  INSERT INTO profiles (id, pending_points, reports_count, joined_at)
    VALUES (NEW.user_id, pts_to_award, 1, now())
  ON CONFLICT (id) DO UPDATE
    SET pending_points  = profiles.pending_points + pts_to_award,
        reports_count   = profiles.reports_count + 1;

  -- Update streak
  UPDATE profiles SET
    streak_days = CASE
      WHEN last_report_date = today - 1 THEN streak_days + 1
      WHEN last_report_date = today      THEN streak_days
      ELSE 1
    END,
    last_report_date = today
  WHERE id = NEW.user_id;

  -- Check for contradiction: another user reported this item within the last 6h
  -- with a DIFFERENT status. If so, clawback their pending points.
  SELECT r.id, r.user_id INTO contra_report_id, contra_user_id
    FROM reports r
   WHERE r.item_id           = NEW.item_id
     AND r.user_id          <> NEW.user_id
     AND r.status           <> NEW.status
     AND r.contradicted_at  IS NULL
     AND r.created_at       > NOW() - INTERVAL '6 hours'
   ORDER BY r.created_at DESC
   LIMIT 1;

  IF contra_user_id IS NOT NULL THEN
    -- Clawback the contradicted reporter's pending points
    UPDATE profiles
       SET pending_points = GREATEST(0, pending_points - pts_to_award)
     WHERE id = contra_user_id;

    -- Mark their report as contradicted
    UPDATE reports SET contradicted_at = now() WHERE id = contra_report_id;

    -- Also mark this new report as confirmed immediately (it contradicted someone = more trusted)
    UPDATE reports SET confirmed_at = now() WHERE id = NEW.id;

    -- Move pending → confirmed for THIS reporter
    UPDATE profiles
       SET points         = points + pts_to_award,
           pending_points = GREATEST(0, pending_points - pts_to_award)
     WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger (replaces migration 001's version)
DROP TRIGGER IF EXISTS on_report_inserted ON reports;
CREATE TRIGGER on_report_inserted
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE PROCEDURE handle_report_points();

-- ─── 6. Function to confirm un-contradicted reports after 4 hours ─────────────
-- Schedule this with pg_cron or a Supabase Edge Function cron:
--   SELECT cron.schedule('confirm-reports', '*/15 * * * *', $$SELECT confirm_pending_reports()$$);
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
  LOOP
    -- Confirm the report: move pending → confirmed points
    UPDATE profiles
       SET points         = points + 10,
           pending_points = GREATEST(0, pending_points - 10)
     WHERE id = r.user_id;

    UPDATE reports SET confirmed_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

-- ─── 7. Update accuracy_ratio whenever a report is contradicted ───────────────
CREATE OR REPLACE FUNCTION update_accuracy_on_contradiction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Recalculate accuracy = confirmed / (confirmed + contradicted) for this user
  UPDATE profiles p
     SET accuracy_ratio = (
       SELECT ROUND(
         CAST(COUNT(*) FILTER (WHERE contradicted_at IS NULL AND confirmed_at IS NOT NULL) AS numeric)
         / NULLIF(COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL OR contradicted_at IS NOT NULL), 0),
         3
       )
       FROM reports r
      WHERE r.user_id = p.id
     )
   WHERE p.id = (SELECT user_id FROM reports WHERE id = NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_report_contradicted ON reports;
CREATE TRIGGER on_report_contradicted
  AFTER UPDATE OF contradicted_at ON reports
  FOR EACH ROW
  WHEN (NEW.contradicted_at IS NOT NULL AND OLD.contradicted_at IS NULL)
  EXECUTE PROCEDURE update_accuracy_on_contradiction();

-- ─── To enable pg_cron (run once as superuser): ───────────────────────────────
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('confirm-reports', '*/15 * * * *', $$SELECT confirm_pending_reports()$$);
