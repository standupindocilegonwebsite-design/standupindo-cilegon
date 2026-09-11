-- Add manual featured ordering for komika cards.
ALTER TABLE komika
  ADD COLUMN IF NOT EXISTS featured_order integer;

CREATE INDEX IF NOT EXISTS idx_komika_featured_order
  ON komika(featured_order);
