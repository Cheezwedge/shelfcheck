-- Recreate items_with_status view to expose the latest report's quantity.
-- The view selects the most-recent report per item via a LATERAL join.
CREATE OR REPLACE VIEW items_with_status AS
SELECT
  i.id,
  i.store_id,
  i.name,
  i.category,
  i.created_at,
  r.status,
  r.created_at  AS last_reported_at,
  r.quantity
FROM items i
LEFT JOIN LATERAL (
  SELECT status, created_at, quantity
  FROM reports
  WHERE item_id = i.id
  ORDER BY created_at DESC
  LIMIT 1
) r ON true;
