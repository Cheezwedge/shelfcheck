-- ─── Migration 016: Lock down the _migrations tracking table ─────────────────
-- Supabase lints any public-schema table without RLS as a security issue.
-- The _migrations table is only written to by the migration script (which
-- uses the service-role key and therefore bypasses RLS). Enabling RLS with
-- no policies blocks anon/authenticated access entirely, which is what we
-- want — no client code should ever read or modify this table.

ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;
