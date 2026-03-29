-- Migration 007: Fix items INSERT policy
-- The previous policy used `TO authenticated` which blocks anonymous sessions.
-- Replace with a role-agnostic policy that still rate-limits by auth.uid() when available.

DROP POLICY IF EXISTS "items_insert_auth" ON items;

CREATE POLICY "items_insert_auth" ON items
  FOR INSERT WITH CHECK (
    -- Allow any session (authenticated or anon), but cap at 20 new items per user per day.
    -- For authenticated users, count by their uid.
    -- For anonymous sessions, count by null created_by (shared bucket — acceptable for guests).
    (
      SELECT COUNT(*) FROM items i2
       WHERE i2.created_at::date = now()::date
         AND (
           (auth.uid() IS NOT NULL AND i2.created_by = auth.uid())
           OR
           (auth.uid() IS NULL    AND i2.created_by IS NULL)
         )
    ) < 20
  );
