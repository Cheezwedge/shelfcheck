-- ─── Migration 019: 3-month photo retention policy ───────────────────────────
-- Creates a function that deletes storage objects and nulls photo_url on
-- reports older than 3 months. Scheduled daily at 3 AM UTC via pg_cron.
--
-- pg_cron is available on Supabase free tier. Enable it first:
--   Dashboard → Database → Extensions → search "pg_cron" → Enable
--
-- If pg_cron is not enabled the function is still created and can be called
-- manually: SELECT cleanup_old_photos();

CREATE OR REPLACE FUNCTION public.cleanup_old_photos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remove the storage objects (this deletes the actual files from the bucket)
  DELETE FROM storage.objects
  WHERE bucket_id = 'report-photos'
    AND created_at < now() - interval '3 months';

  -- Null out photo_url on reports whose photo no longer exists
  UPDATE public.reports
  SET photo_url = NULL
  WHERE photo_url IS NOT NULL
    AND created_at < now() - interval '3 months';
END;
$$;

-- Schedule via pg_cron if the extension is enabled (idempotent: unschedule first)
DO $$ BEGIN
  -- Remove any existing schedule with this name before re-creating
  PERFORM cron.unschedule('cleanup-old-photos');
EXCEPTION WHEN undefined_function THEN
  -- pg_cron not enabled — skip scheduling silently
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'cleanup-old-photos',
    '0 3 * * *',   -- 3 AM UTC daily
    'SELECT public.cleanup_old_photos()'
  );
EXCEPTION WHEN undefined_function THEN
  -- pg_cron not enabled — function still exists, call manually if needed
  NULL;
END $$;
