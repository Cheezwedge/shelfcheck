-- ─── Migration 015: Shelf photo URL storage ───────────────────────────────────
-- Safe to re-run: all statements are idempotent.

-- 1. Add photo_url column to reports
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS photo_url text;

-- 2. Create the report-photos storage bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-photos', 'report-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS: anyone can read photos
DO $$ BEGIN
  CREATE POLICY "report_photos_select"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'report-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Storage RLS: anyone can upload photos (anon key is sufficient)
DO $$ BEGIN
  CREATE POLICY "report_photos_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'report-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
