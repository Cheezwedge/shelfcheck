-- ================================================================
-- ShelfCheck — Profiles Migration (Step 2 of 4)
--
-- Run order:
--   1. supabase-schema.sql
--   2. supabase-profiles-migration.sql   ← this file
--   3. supabase-auth-migration.sql
--   4. supabase-photos-migration.sql
--
-- Safe to re-run — all statements use IF NOT EXISTS / OR REPLACE guards.
-- ================================================================

-- 1. PROFILES — one row per anonymous device / future user account
create table if not exists public.profiles (
  id             uuid primary key,
  points         int  not null default 0,
  reports_count  int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

do $$ begin
  create policy "profiles_select" on public.profiles for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "profiles_insert" on public.profiles for insert with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "profiles_update" on public.profiles for update using (true);
exception when duplicate_object then null; end $$;

-- 2. TRIGGER — auto-increment points when a report is inserted with a user_id
create or replace function public.handle_new_report()
returns trigger as $$
begin
  if new.user_id is not null then
    insert into public.profiles (id, points, reports_count)
    values (new.user_id, 10, 1)
    on conflict (id) do update
      set points        = profiles.points + 10,
          reports_count = profiles.reports_count + 1,
          updated_at    = now();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_report_inserted on public.reports;
create trigger on_report_inserted
  after insert on public.reports
  for each row
  execute procedure public.handle_new_report();
