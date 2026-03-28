-- ─── Admin Roles & Item Management ───────────────────────────────────────────
-- Run in Supabase SQL Editor after 001 and 002.

-- ─── 1. Admin flag on profiles ───────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Set your own account as admin (replace with your actual auth.users id):
-- UPDATE profiles SET is_admin = true WHERE id = '<your-user-uuid>';

-- ─── 2. Helper: is current user an admin? ────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ─── 3. RLS on items: admins can rename and delete ───────────────────────────
DROP POLICY IF EXISTS "items_admin_update" ON items;
CREATE POLICY "items_admin_update" ON items
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "items_admin_delete" ON items;
CREATE POLICY "items_admin_delete" ON items
  FOR DELETE TO authenticated
  USING (is_admin());

-- ─── 4. RLS on reports: admins can delete spam/bad reports ───────────────────
-- (reports table already has RLS enabled from migration 001)
DROP POLICY IF EXISTS "reports_admin_delete" ON reports;
CREATE POLICY "reports_admin_delete" ON reports
  FOR DELETE TO authenticated
  USING (is_admin());

-- ─── 5. Stored procedure: merge two items (admin only) ───────────────────────
-- Moves all reports from drop_id → keep_id, then deletes drop_id.
-- Enforces admin check server-side.
CREATE OR REPLACE FUNCTION admin_merge_items(keep_id uuid, drop_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  -- Re-point reports
  UPDATE reports SET item_id = keep_id WHERE item_id = drop_id;

  -- Delete the duplicate (no reports reference it now)
  DELETE FROM items WHERE id = drop_id;
END;
$$;
