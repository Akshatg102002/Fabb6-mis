-- Fabb6 MIS - Three-Tier Inventory State Matrix
-- PostgreSQL 16

BEGIN;

-- ============================================================
-- 1. Extend return_status enum with rto_received
-- ============================================================
ALTER TYPE return_status ADD VALUE IF NOT EXISTS 'rto_received' AFTER 'received';

-- ============================================================
-- 2. Extend return_lines with QC and tracking fields
-- ============================================================
ALTER TABLE return_lines
  ADD COLUMN IF NOT EXISTS product_match  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS damage_status  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS remarks        TEXT;

-- ============================================================
-- 3. stock_availability VIEW
--    physical_stock   = stock at non-quarantine bins
--    committed_stock  = qty reserved by active pick lists
--    available_to_sell = physical - committed  (floor 0)
--    damaged_stock    = stock at quarantine locations
-- ============================================================
CREATE OR REPLACE VIEW stock_availability AS
WITH physical AS (
  SELECT
    soh.sku_id,
    l.site_id,
    SUM(soh.quantity) AS physical_stock
  FROM stock_on_hand soh
  JOIN locations l ON l.id = soh.location_id
  WHERE l.type != 'quarantine'
  GROUP BY soh.sku_id, l.site_id
),
committed AS (
  SELECT
    pl_line.sku_id,
    l.site_id,
    SUM(pl_line.qty_required - COALESCE(pl_line.qty_picked, 0)) AS committed_stock
  FROM pick_lines pl_line
  JOIN pick_lists pl ON pl.id = pl_line.pick_list_id
  JOIN locations l ON l.site_id IS NOT NULL AND l.id = pl.from_location_id
  WHERE pl.status IN ('pending', 'assigned', 'in_progress', 'partially_picked')
    AND pl_line.qty_required > COALESCE(pl_line.qty_picked, 0)
  GROUP BY pl_line.sku_id, l.site_id
),
damaged AS (
  SELECT
    soh.sku_id,
    l.site_id,
    SUM(soh.quantity) AS damaged_stock
  FROM stock_on_hand soh
  JOIN locations l ON l.id = soh.location_id
  WHERE l.type = 'quarantine'
  GROUP BY soh.sku_id, l.site_id
)
SELECT
  COALESCE(p.sku_id, c.sku_id, d.sku_id)            AS sku_id,
  COALESCE(p.site_id, c.site_id, d.site_id)          AS site_id,
  COALESCE(p.physical_stock, 0)                       AS physical_stock,
  COALESCE(c.committed_stock, 0)                      AS committed_stock,
  GREATEST(0, COALESCE(p.physical_stock, 0) - COALESCE(c.committed_stock, 0)) AS available_to_sell,
  COALESCE(d.damaged_stock, 0)                        AS damaged_stock
FROM physical p
FULL OUTER JOIN committed c ON c.sku_id = p.sku_id AND c.site_id = p.site_id
FULL OUTER JOIN damaged   d ON d.sku_id = COALESCE(p.sku_id, c.sku_id)
                            AND d.site_id = COALESCE(p.site_id, c.site_id);

COMMIT;
