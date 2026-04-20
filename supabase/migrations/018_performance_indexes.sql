-- ─── Migration 018: Performance indexes ──────────────────────────────────────
-- Postgres only creates indexes automatically on primary keys and unique
-- constraints — NOT on foreign key columns. These indexes cover the most
-- frequent query patterns and become critical once reports volume grows.

-- reports: item detail screen, status calculation, store leaderboard
CREATE INDEX IF NOT EXISTS idx_reports_item_id
  ON public.reports (item_id);

-- reports: store-scoped status + history (fetchRecentReports filter)
CREATE INDEX IF NOT EXISTS idx_reports_store_id
  ON public.reports (store_id);

-- reports: per-user daily cap check and contradiction detection
CREATE INDEX IF NOT EXISTS idx_reports_user_id
  ON public.reports (user_id);

-- reports: composite index covers (item, store, date) scans together
CREATE INDEX IF NOT EXISTS idx_reports_item_store_created
  ON public.reports (item_id, store_id, created_at DESC);

-- profiles: leaderboard ORDER BY points DESC
CREATE INDEX IF NOT EXISTS idx_profiles_points_desc
  ON public.profiles (points DESC);

-- items: chain catalog lookup (chain_id is queried constantly)
CREATE INDEX IF NOT EXISTS idx_items_chain_id
  ON public.items (chain_id);

-- favorite_stores: per-user fetch
CREATE INDEX IF NOT EXISTS idx_favorite_stores_user_id
  ON public.favorite_stores (user_id);
