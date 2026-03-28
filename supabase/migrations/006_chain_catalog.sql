-- Migration 006: chain-level item catalog
-- Items belong to a chain (e.g. "Ralphs"), reports belong to a physical store location.
-- This means every location of a chain shares the same item catalog, but stock
-- statuses are tracked independently per location.

-- 1. Chains table
CREATE TABLE IF NOT EXISTS chains (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);

-- 2. Seed the 20 allowed chains
INSERT INTO chains (name) VALUES
  ('Ralphs'),
  ('Vons'),
  ('Albertsons'),
  ('Stater Bros.'),
  ('Trader Joe''s'),
  ('Whole Foods'),
  ('Sprouts'),
  ('Costco'),
  ('Food 4 Less'),
  ('Smart & Final'),
  ('Pavilions'),
  ('WinCo Foods'),
  ('99 Ranch Market'),
  ('Northgate'),
  ('Walmart'),
  ('Target'),
  ('Aldi'),
  ('Grocery Outlet'),
  ('Bristol Farms'),
  ('Gelson''s')
ON CONFLICT (name) DO NOTHING;

-- 3. Add chain_id to stores
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS chain_id uuid REFERENCES chains(id);

-- 4. Populate chain_id on existing stores by keyword matching
UPDATE stores s
SET chain_id = c.id
FROM chains c
WHERE
  s.name ILIKE '%' || c.name || '%'
  OR (c.name = 'Ralphs'          AND s.name ILIKE '%ralph%')
  OR (c.name = 'Trader Joe''s'   AND s.name ILIKE '%trader joe%')
  OR (c.name = 'Whole Foods'     AND s.name ILIKE '%whole food%')
  OR (c.name = 'Food 4 Less'     AND s.name ILIKE '%food 4 less%')
  OR (c.name = 'Smart & Final'   AND (s.name ILIKE '%smart%final%' OR s.name ILIKE '%smart & final%'))
  OR (c.name = 'WinCo Foods'     AND s.name ILIKE '%winco%')
  OR (c.name = '99 Ranch Market' AND s.name ILIKE '%99 ranch%')
  OR (c.name = 'Northgate'       AND s.name ILIKE '%northgate%')
  OR (c.name = 'Walmart'         AND s.name ILIKE '%walmart%')
  OR (c.name = 'Grocery Outlet'  AND s.name ILIKE '%grocery outlet%')
  OR (c.name = 'Bristol Farms'   AND s.name ILIKE '%bristol%')
  OR (c.name = 'Gelson''s'       AND s.name ILIKE '%gelson%');

-- 5. Add chain_id to items
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS chain_id uuid REFERENCES chains(id);

-- 6. Populate chain_id on existing items from their store's chain
UPDATE items i
SET chain_id = s.chain_id
FROM stores s
WHERE i.store_id = s.id
  AND s.chain_id IS NOT NULL;

-- 7. Function: fetch all chain items for a store with that store's report status
--    - If the store has a chain_id, returns ALL items for that chain
--      with the most recent report at THIS specific location.
--    - Falls back to store_id-scoped items for stores without a chain match.
CREATE OR REPLACE FUNCTION fetch_store_items(p_store_id uuid)
RETURNS TABLE (
  id               uuid,
  chain_id         uuid,
  name             text,
  category         text,
  created_at       timestamptz,
  status           text,
  last_reported_at timestamptz,
  quantity         int
)
LANGUAGE sql STABLE AS $$
  WITH store_info AS (
    SELECT chain_id FROM stores WHERE id = p_store_id
  )
  SELECT
    i.id,
    i.chain_id,
    i.name,
    i.category,
    i.created_at,
    r.status::text,
    r.created_at  AS last_reported_at,
    r.quantity
  FROM items i
  CROSS JOIN store_info si
  LEFT JOIN LATERAL (
    SELECT status::text, created_at, quantity
    FROM reports
    WHERE item_id = i.id
      AND store_id = p_store_id
    ORDER BY created_at DESC
    LIMIT 1
  ) r ON true
  WHERE
    (si.chain_id IS NOT NULL AND i.chain_id = si.chain_id)
    OR
    (si.chain_id IS NULL     AND i.store_id = p_store_id)
  ORDER BY i.name;
$$;
