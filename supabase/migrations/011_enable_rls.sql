-- Migration 011: Enable RLS on all tables
-- Without RLS, anyone with the public anon key can read/write/delete everything.

-- 1. Enable RLS on every table
ALTER TABLE chains   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. chains — public read-only (seeded lookup data, no writes needed)
DROP POLICY IF EXISTS "chains_read" ON chains;
CREATE POLICY "chains_read" ON chains FOR SELECT USING (true);

-- 3. stores — public read; INSERT already covered by migration 008
DROP POLICY IF EXISTS "stores_read" ON stores;
CREATE POLICY "stores_read" ON stores FOR SELECT USING (true);

-- 4. items — public read; INSERT already covered by migration 007;
--    UPDATE and DELETE restricted to signed-in users (admin only in practice)
DROP POLICY IF EXISTS "items_read"   ON items;
DROP POLICY IF EXISTS "items_update" ON items;
DROP POLICY IF EXISTS "items_delete" ON items;
CREATE POLICY "items_read"   ON items FOR SELECT USING (true);
CREATE POLICY "items_update" ON items FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "items_delete" ON items FOR DELETE USING (auth.uid() IS NOT NULL);

-- 5. reports — public read; INSERT open to all because guest users submit reports
--    using client-generated UUIDs (no Supabase auth session required)
DROP POLICY IF EXISTS "reports_read"   ON reports;
DROP POLICY IF EXISTS "reports_insert" ON reports;
CREATE POLICY "reports_read"   ON reports FOR SELECT USING (true);
CREATE POLICY "reports_insert" ON reports FOR INSERT WITH CHECK (true);

-- 6. profiles — each user can only see and edit their own row.
--    The leaderboard uses a SECURITY DEFINER function (migration 010) which
--    bypasses RLS, so the public leaderboard still works correctly.
DROP POLICY IF EXISTS "profiles_read"   ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_read"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
