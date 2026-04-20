-- ─── Migration 017: items_with_status runs as invoker, not definer ────────────
-- Supabase flags views as SECURITY DEFINER by default because they're owned by
-- the `postgres` role. In PG 15+ we can flip this with the security_invoker
-- option so the view respects the *caller's* RLS policies instead of the
-- creator's. This is the recommended fix for the Supabase security lint.

ALTER VIEW public.items_with_status SET (security_invoker = on);
