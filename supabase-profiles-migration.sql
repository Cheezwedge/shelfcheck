-- ================================================================
-- ShelfCheck — Profiles Migration
-- Paste into Supabase SQL Editor and run AFTER supabase-schema.sql
-- ================================================================

-- 1. PROFILES — one row per anonymous device / future user account
create table public.profiles (
  id             uuid primary key,
  points         int  not null default 0,
  reports_count  int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (true);
create policy "profiles_update" on public.profiles for update using (true);

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

create trigger on_report_inserted
  after insert on public.reports
  for each row
  execute procedure public.handle_new_report();
