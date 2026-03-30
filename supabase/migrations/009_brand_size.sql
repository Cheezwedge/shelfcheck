-- Migration 009: add brand and size fields to items
ALTER TABLE items ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS size  text;

-- Recreate fetch_store_items to include brand and size in the return type
CREATE OR REPLACE FUNCTION fetch_store_items(p_store_id uuid)
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
    i.id,
    i.chain_id,
    i.name,
    i.brand,
    i.size,
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
