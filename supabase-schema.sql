-- ================================================================
-- ShelfCheck — Core Schema (Step 1 of 4)
--
-- Run order:
--   1. supabase-schema.sql               ← this file
--   2. supabase-profiles-migration.sql
--   3. supabase-auth-migration.sql
--   4. supabase-photos-migration.sql
--
-- Safe to re-run — all statements use IF NOT EXISTS guards.
-- ================================================================

-- 1. STORES
create table if not exists public.stores (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  created_at timestamptz not null default now()
);

-- 2. ITEMS (products tracked at a store)
create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  name       text not null,
  category   text not null,
  created_at timestamptz not null default now()
);

create index if not exists items_store_id_idx on public.items(store_id);

-- 3. REPORTS (crowdsourced status events)
create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id) on delete cascade,
  status     text not null check (status in ('in-stock', 'out-of-stock')),
  user_id    uuid,           -- nullable: anonymous submissions allowed
  created_at timestamptz not null default now()
);

create index if not exists reports_item_created_idx on public.reports(item_id, created_at desc);

-- 4. VIEW: each item joined with its most recent report's status
--    status is NULL when no reports exist yet (shown as "Uncertain" in the app)
drop view if exists public.items_with_status;
create view public.items_with_status as
select
  i.id,
  i.store_id,
  i.name,
  i.category,
  i.created_at,
  r.status,
  r.created_at as last_reported_at,
  r.photo_url
from public.items i
left join lateral (
  select status, created_at, photo_url
  from   public.reports
  where  item_id = i.id
  order  by created_at desc
  limit  1
) r on true;

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

alter table public.stores  enable row level security;
alter table public.items   enable row level security;
alter table public.reports enable row level security;

-- Public read on stores and items (catalog data)
do $$ begin
  create policy "stores_select"  on public.stores  for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "items_select"   on public.items   for select using (true);
exception when duplicate_object then null; end $$;

-- Public read + anonymous insert on reports
do $$ begin
  create policy "reports_select" on public.reports for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "reports_insert" on public.reports for insert with check (true);
exception when duplicate_object then null; end $$;

-- ================================================================
-- SEED DATA (matches the 5 hardcoded items from data.ts)
-- ================================================================

insert into public.stores (id, name)
values ('a1b2c3d4-0000-0000-0000-000000000001', 'Whole Foods Market – Downtown')
on conflict (id) do nothing;

insert into public.items (id, store_id, name, category) values
  ('a1b2c3d4-0000-0000-0000-000000000011', 'a1b2c3d4-0000-0000-0000-000000000001', 'Organic Whole Milk',     'Dairy'),
  ('a1b2c3d4-0000-0000-0000-000000000012', 'a1b2c3d4-0000-0000-0000-000000000001', 'Sourdough Bread',        'Bakery'),
  ('a1b2c3d4-0000-0000-0000-000000000013', 'a1b2c3d4-0000-0000-0000-000000000001', 'Free-Range Eggs (12ct)', 'Dairy'),
  ('a1b2c3d4-0000-0000-0000-000000000014', 'a1b2c3d4-0000-0000-0000-000000000001', 'Baby Spinach (5oz)',     'Produce'),
  ('a1b2c3d4-0000-0000-0000-000000000015', 'a1b2c3d4-0000-0000-0000-000000000001', 'Greek Yogurt (Plain)',   'Dairy')
on conflict (id) do nothing;
