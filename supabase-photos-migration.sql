-- ================================================================
-- ShelfCheck — Photos Migration (Step 4 of 4)
--
-- Run order:
--   1. supabase-schema.sql
--   2. supabase-profiles-migration.sql
--   3. supabase-auth-migration.sql
--   4. supabase-photos-migration.sql  ← this file
-- ================================================================

-- 1. Add photo_url column to reports
alter table public.reports
  add column if not exists photo_url text;

-- 2. Create the shelf-photos storage bucket (public read)
insert into storage.buckets (id, name, public)
values ('shelf-photos', 'shelf-photos', true)
on conflict (id) do nothing;

-- 3. Storage RLS: anyone can read photos
create policy "shelf_photos_select"
  on storage.objects for select
  using (bucket_id = 'shelf-photos');

-- 4. Storage RLS: anyone can upload photos (anon key is sufficient)
create policy "shelf_photos_insert"
  on storage.objects for insert
  with check (bucket_id = 'shelf-photos');
