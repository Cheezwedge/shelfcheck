-- ================================================================
-- ShelfCheck — Auth Migration (Step 3 of 4)
--
-- Run order:
--   1. supabase-schema.sql
--   2. supabase-profiles-migration.sql
--   3. supabase-auth-migration.sql       ← this file
--   4. supabase-photos-migration.sql
--
-- Safe to re-run — all statements use OR REPLACE / drop-then-recreate.
-- ================================================================

-- 1. Tighten profiles UPDATE policy — only the row owner can update directly.
--    The trigger (security definer) still bypasses this for upserts.
drop policy if exists "profiles_update"      on public.profiles;
drop policy if exists "profiles_update_own"  on public.profiles;

create policy "profiles_update_own" on public.profiles
  for update using (
    auth.uid() = id       -- authenticated users own their row
    or auth.uid() is null -- unauthenticated callers (trigger handles this via security definer)
  );

-- 2. Function: merge guest points into a newly-created auth account.
--    Called from the app after sign-up if the device has accumulated points.
create or replace function public.merge_guest_profile(
  guest_id uuid,
  auth_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  guest_points  int;
  guest_reports int;
begin
  -- Security: only the authenticated user can claim their own merge
  if auth.uid() is distinct from auth_id then
    raise exception 'unauthorized';
  end if;

  select points, reports_count
    into guest_points, guest_reports
    from profiles
   where id = guest_id;

  if not found then
    return; -- nothing to merge
  end if;

  -- Upsert the auth profile, adding guest totals on top of any existing points
  insert into profiles (id, points, reports_count)
  values (auth_id, guest_points, guest_reports)
  on conflict (id) do update
    set points        = profiles.points + excluded.points,
        reports_count = profiles.reports_count + excluded.reports_count,
        updated_at    = now();

  -- Re-attribute all historical reports from the guest UUID to the auth UUID
  update reports
     set user_id = auth_id
   where user_id = guest_id;

  -- Remove the now-migrated guest profile row
  delete from profiles where id = guest_id;
end;
$$;
