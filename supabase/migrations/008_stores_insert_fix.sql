-- Migration 008: Fix stores INSERT policy
-- The previous policy used `TO authenticated` which blocks anonymous sessions
-- when upsertStore() tries to create a new store record.
-- Replace with a role-agnostic policy (same pattern as migration 007 for items).

DROP POLICY IF EXISTS "stores_insert_auth" ON stores;

CREATE POLICY "stores_insert_auth" ON stores
  FOR INSERT WITH CHECK (true);
