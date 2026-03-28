-- Add optional estimated quantity to reports
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS quantity int CHECK (quantity > 0);
