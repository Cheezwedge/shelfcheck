-- Migration 009: add brand and size fields to items
ALTER TABLE items ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS size  text;

-- Recreate fetch_store_items to include brand and size in the return type
-- NOTE: must DROP first because the return type changed (added brand, size columns)
DROP FUNCTION IF EXISTS fetch_store_items(uuid);

CREATE FUNCTION fetch_store_items(p_store_id uuid)
RETURNS TABLE (
  id               uuid,
  chain_id         uuid,
  name             text,
  brand            text,
  size             text,
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
    itm.id,
    itm.chain_id,
    itm.name,
    itm.brand,
    itm.size,
    itm.category,
    itm.created_at,
    rpt.status::text,
    rpt.created_at  AS last_reported_at,
    rpt.quantity
  FROM items itm
  CROSS JOIN store_info si
  LEFT JOIN LATERAL (
    SELECT status::text, created_at, quantity
    FROM reports
    WHERE item_id = itm.id
      AND store_id = p_store_id
    ORDER BY created_at DESC
    LIMIT 1
  ) rpt ON true
  WHERE
    (si.chain_id IS NOT NULL AND itm.chain_id = si.chain_id)
    OR
    (si.chain_id IS NULL     AND itm.store_id = p_store_id)
  ORDER BY itm.name;
$$;
