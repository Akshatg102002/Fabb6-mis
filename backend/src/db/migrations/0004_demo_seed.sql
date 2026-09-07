-- Fabb6 MIS — Demo Seed Data
-- Run once after 0003_vendors_shipping.sql
-- Creates a realistic warehouse with stock, locations, and sample orders

BEGIN;

-- ============================================================
-- 1. UPDATE ADMIN USER NAME
-- ============================================================
UPDATE users
SET name = 'Fabb6_Admin'
WHERE role = 'admin';

-- ============================================================
-- 2. SITE
-- ============================================================
INSERT INTO sites (id, name, address, gstin, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Fabb6 Main Warehouse',
  'Plot 12, MIDC Industrial Area, Andheri East, Mumbai – 400093',
  '27AABCF1234G1Z5',
  TRUE
) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ============================================================
-- 3. LOCATIONS (bins, receiving, quarantine, dispatch)
-- ============================================================
DO $$
DECLARE
  site UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

  -- Receiving dock
  INSERT INTO locations (id, site_id, code, type, aisle, capacity_units)
  VALUES ('00000000-0000-0000-0001-000000000001', site, 'RECV-01', 'receiving', NULL, 500)
  ON CONFLICT (code) DO NOTHING;

  -- Quarantine zone
  INSERT INTO locations (id, site_id, code, type, capacity_units)
  VALUES ('00000000-0000-0000-0001-000000000002', site, 'QR-01', 'quarantine', 100)
  ON CONFLICT (code) DO NOTHING;

  -- Dispatch staging
  INSERT INTO locations (id, site_id, code, type, capacity_units)
  VALUES ('00000000-0000-0000-0001-000000000003', site, 'DISP-01', 'dispatch', 300)
  ON CONFLICT (code) DO NOTHING;

  -- Returns bay
  INSERT INTO locations (id, site_id, code, type, capacity_units)
  VALUES ('00000000-0000-0000-0001-000000000004', site, 'RET-01', 'returns', 200)
  ON CONFLICT (code) DO NOTHING;

  -- Bin rack A (aisle A, 5 racks × 3 shelves × 2 positions)
  DECLARE
    r INT; s INT; p INT; loc_id UUID; loc_code TEXT;
  BEGIN
    FOR r IN 1..5 LOOP
      FOR s IN 1..3 LOOP
        FOR p IN 1..2 LOOP
          loc_code := FORMAT('A-%s%s-%s', LPAD(r::TEXT, 2, '0'), LPAD(s::TEXT, 2, '0'), LPAD(p::TEXT, 2, '0'));
          loc_id := gen_random_uuid();
          INSERT INTO locations (id, site_id, code, type, aisle, rack, shelf, position, capacity_units)
          VALUES (loc_id, site, loc_code, 'bin', 'A', LPAD(r::TEXT, 2, '0'), LPAD(s::TEXT, 2, '0'), LPAD(p::TEXT, 2, '0'), 50)
          ON CONFLICT (code) DO NOTHING;
        END LOOP;
      END LOOP;
    END LOOP;
  END;

  -- Bin rack B (aisle B, 4 racks × 2 shelves × 2 positions)
  DECLARE
    r INT; s INT; p INT; loc_id UUID; loc_code TEXT;
  BEGIN
    FOR r IN 1..4 LOOP
      FOR s IN 1..2 LOOP
        FOR p IN 1..2 LOOP
          loc_code := FORMAT('B-%s%s-%s', LPAD(r::TEXT, 2, '0'), LPAD(s::TEXT, 2, '0'), LPAD(p::TEXT, 2, '0'));
          loc_id := gen_random_uuid();
          INSERT INTO locations (id, site_id, code, type, aisle, rack, shelf, position, capacity_units)
          VALUES (loc_id, site, loc_code, 'bin', 'B', LPAD(r::TEXT, 2, '0'), LPAD(s::TEXT, 2, '0'), LPAD(p::TEXT, 2, '0'), 50)
          ON CONFLICT (code) DO NOTHING;
        END LOOP;
      END LOOP;
    END LOOP;
  END;

END $$;

-- ============================================================
-- 4. SKUS — Beauty brand products
-- ============================================================

-- Dot & Key SKUs (supplier seeded in 0003)
INSERT INTO skus (id, code, name, brand_name, barcode, hsn_code, uom, is_active)
SELECT
  '10000000-0000-0000-0000-000000000001', 'SKU-DOT-001',
  'Dot & Key Vitamin C Brightening Serum 30ml', 'Dot & Key',
  '8901234567001', '33049900', 'each', TRUE
WHERE NOT EXISTS (SELECT 1 FROM skus WHERE code = 'SKU-DOT-001');

INSERT INTO skus (id, code, name, brand_name, barcode, hsn_code, uom, is_active)
SELECT
  '10000000-0000-0000-0000-000000000002', 'SKU-DOT-002',
  'Dot & Key Waterlight Gel Moisturizer 85g', 'Dot & Key',
  '8901234567002', '33049900', 'each', TRUE
WHERE NOT EXISTS (SELECT 1 FROM skus WHERE code = 'SKU-DOT-002');

INSERT INTO skus (id, code, name, brand_name, barcode, hsn_code, uom, is_active)
SELECT
  '10000000-0000-0000-0000-000000000003', 'SKU-DOT-003',
  'Dot & Key Barrier Repair Ceramide Cream 50g', 'Dot & Key',
  '8901234567003', '33049900', 'each', TRUE
WHERE NOT EXISTS (SELECT 1 FROM skus WHERE code = 'SKU-DOT-003');

-- Sugar Cosmetics SKUs
INSERT INTO skus (id, code, name, brand_name, barcode, hsn_code, uom, is_active)
SELECT
  '10000000-0000-0000-0000-000000000004', 'SKU-SUG-001',
  'Sugar Smudge Me Not Lip Liner 1.2g', 'Sugar Cosmetics',
  '8901234568001', '33041000', 'each', TRUE
WHERE NOT EXISTS (SELECT 1 FROM skus WHERE code = 'SKU-SUG-001');

INSERT INTO skus (id, code, name, brand_name, barcode, hsn_code, uom, is_active)
SELECT
  '10000000-0000-0000-0000-000000000005', 'SKU-SUG-002',
  'Sugar Ace Of Face Foundation Stick SPF 30', 'Sugar Cosmetics',
  '8901234568002', '33041000', 'each', TRUE
WHERE NOT EXISTS (SELECT 1 FROM skus WHERE code = 'SKU-SUG-002');

INSERT INTO skus (id, code, name, brand_name, barcode, hsn_code, uom, is_active)
SELECT
  '10000000-0000-0000-0000-000000000006', 'SKU-SUG-003',
  'Sugar Tipsy Lips Comfortable Matte Crayon', 'Sugar Cosmetics',
  '8901234568003', '33041000', 'each', TRUE
WHERE NOT EXISTS (SELECT 1 FROM skus WHERE code = 'SKU-SUG-003');

-- Nykaa SKUs
INSERT INTO skus (id, code, name, brand_name, barcode, hsn_code, uom, is_active)
SELECT
  '10000000-0000-0000-0000-000000000007', 'SKU-NYK-001',
  'Nykaa BAWSE Lady Matte Lipstick 4.5g', 'Nykaa Cosmetics',
  '8901234569001', '33041000', 'each', TRUE
WHERE NOT EXISTS (SELECT 1 FROM skus WHERE code = 'SKU-NYK-001');

INSERT INTO skus (id, code, name, brand_name, barcode, hsn_code, uom, is_active)
SELECT
  '10000000-0000-0000-0000-000000000008', 'SKU-NYK-002',
  'Nykaa Skin Secrets Vitamin C Serum 30ml', 'Nykaa Cosmetics',
  '8901234569002', '33049900', 'each', TRUE
WHERE NOT EXISTS (SELECT 1 FROM skus WHERE code = 'SKU-NYK-002');

INSERT INTO skus (id, code, name, brand_name, barcode, hsn_code, uom, is_active)
SELECT
  '10000000-0000-0000-0000-000000000009', 'SKU-NYK-003',
  'Nykaa Tea Tree Skin Clarifying Toner 100ml', 'Nykaa Cosmetics',
  '8901234569003', '33049900', 'each', TRUE
WHERE NOT EXISTS (SELECT 1 FROM skus WHERE code = 'SKU-NYK-003');

-- ============================================================
-- 5. PURCHASE ORDERS
-- ============================================================

-- PO-001: Draft order from Dot & Key
INSERT INTO purchase_orders (id, supplier_id, site_id, po_number, status, expected_date, notes)
SELECT
  '20000000-0000-0000-0000-000000000001',
  s.id,
  '00000000-0000-0000-0000-000000000001',
  'PO-2026-001',
  'draft',
  NOW() + INTERVAL '7 days',
  'Initial beauty care stock — Dot & Key range'
FROM suppliers s WHERE s.vendor_code = 'VEND-DOT-03'
ON CONFLICT (id) DO NOTHING;

INSERT INTO po_lines (id, po_id, sku_id, ordered_qty, received_qty, unit_cost, line_number)
VALUES
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 100, 0, 450.00, 1),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 80,  0, 380.00, 2),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 60,  0, 520.00, 3)
ON CONFLICT DO NOTHING;

-- PO-002: Confirmed order from Sugar Cosmetics
INSERT INTO purchase_orders (id, supplier_id, site_id, po_number, status, expected_date, notes)
SELECT
  '20000000-0000-0000-0000-000000000002',
  s.id,
  '00000000-0000-0000-0000-000000000001',
  'PO-2026-002',
  'confirmed',
  NOW() + INTERVAL '3 days',
  'Sugar Cosmetics lip range — bulk restock'
FROM suppliers s WHERE s.vendor_code = 'VEND-SUG-02'
ON CONFLICT (id) DO NOTHING;

INSERT INTO po_lines (id, po_id, sku_id, ordered_qty, received_qty, unit_cost, line_number)
VALUES
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 200, 0, 220.00, 1),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005', 150, 0, 690.00, 2),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000006', 120, 0, 290.00, 3)
ON CONFLICT DO NOTHING;

-- PO-003: Received order from Nykaa (stock already in bins)
INSERT INTO purchase_orders (id, supplier_id, site_id, po_number, status, expected_date, notes, total_value)
SELECT
  '20000000-0000-0000-0000-000000000003',
  s.id,
  '00000000-0000-0000-0000-000000000001',
  'PO-2026-000',
  'received',
  NOW() - INTERVAL '5 days',
  'Nykaa opening stock — received in full',
  245000.00
FROM suppliers s WHERE s.vendor_code = 'VEND-NYK-01'
ON CONFLICT (id) DO NOTHING;

INSERT INTO po_lines (id, po_id, sku_id, ordered_qty, received_qty, unit_cost, line_number)
VALUES
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000007', 300, 300, 340.00, 1),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000008', 200, 200, 495.00, 2),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000009', 150, 150, 280.00, 3)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. STOCK MOVEMENTS → seed physical stock in bins
--    (Nykaa products already "received")
-- ============================================================
DO $$
DECLARE
  recv_loc UUID;
  bin_a1   UUID;
  bin_a2   UUID;
  bin_a3   UUID;
  bin_b1   UUID;
  bin_b2   UUID;
  ikey     TEXT;
BEGIN
  SELECT id INTO recv_loc FROM locations WHERE code = 'RECV-01' LIMIT 1;
  SELECT id INTO bin_a1   FROM locations WHERE code = 'A-0101-01' LIMIT 1;
  SELECT id INTO bin_a2   FROM locations WHERE code = 'A-0102-01' LIMIT 1;
  SELECT id INTO bin_a3   FROM locations WHERE code = 'A-0103-01' LIMIT 1;
  SELECT id INTO bin_b1   FROM locations WHERE code = 'B-0101-01' LIMIT 1;
  SELECT id INTO bin_b2   FROM locations WHERE code = 'B-0102-01' LIMIT 1;

  IF bin_a1 IS NULL THEN
    SELECT id INTO bin_a1 FROM locations WHERE type = 'bin' ORDER BY code LIMIT 1 OFFSET 0;
    SELECT id INTO bin_a2 FROM locations WHERE type = 'bin' ORDER BY code LIMIT 1 OFFSET 1;
    SELECT id INTO bin_a3 FROM locations WHERE type = 'bin' ORDER BY code LIMIT 1 OFFSET 2;
    SELECT id INTO bin_b1 FROM locations WHERE type = 'bin' ORDER BY code LIMIT 1 OFFSET 3;
    SELECT id INTO bin_b2 FROM locations WHERE type = 'bin' ORDER BY code LIMIT 1 OFFSET 4;
  END IF;

  -- SKU-NYK-001: 300 units into bin A1
  ikey := 'seed-grn-nyk001-' || bin_a1::TEXT;
  IF NOT EXISTS (SELECT 1 FROM stock_movements WHERE idempotency_key = ikey) THEN
    INSERT INTO stock_movements (id, sku_id, from_location_id, to_location_id, quantity, movement_type, reference_type, reference_id, idempotency_key)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000007', recv_loc, bin_a1, 300, 'grn_receipt', 'purchase_order', '20000000-0000-0000-0000-000000000003', ikey);
  END IF;

  -- SKU-NYK-002: 200 units into bin A2
  ikey := 'seed-grn-nyk002-' || bin_a2::TEXT;
  IF NOT EXISTS (SELECT 1 FROM stock_movements WHERE idempotency_key = ikey) THEN
    INSERT INTO stock_movements (id, sku_id, from_location_id, to_location_id, quantity, movement_type, reference_type, reference_id, idempotency_key)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000008', recv_loc, bin_a2, 200, 'grn_receipt', 'purchase_order', '20000000-0000-0000-0000-000000000003', ikey);
  END IF;

  -- SKU-NYK-003: 150 units into bin A3
  ikey := 'seed-grn-nyk003-' || bin_a3::TEXT;
  IF NOT EXISTS (SELECT 1 FROM stock_movements WHERE idempotency_key = ikey) THEN
    INSERT INTO stock_movements (id, sku_id, from_location_id, to_location_id, quantity, movement_type, reference_type, reference_id, idempotency_key)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000009', recv_loc, bin_a3, 150, 'grn_receipt', 'purchase_order', '20000000-0000-0000-0000-000000000003', ikey);
  END IF;

END $$;

-- ============================================================
-- 7. GRN for the received Nykaa PO
-- ============================================================
INSERT INTO grns (id, po_id, site_id, reference, status, received_at)
SELECT
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'GRN-2026-001',
  'posted',
  NOW() - INTERVAL '4 days'
WHERE NOT EXISTS (SELECT 1 FROM grns WHERE id = '30000000-0000-0000-0000-000000000001');

INSERT INTO grn_lines (id, grn_id, sku_id, expected_qty, received_qty, batch_number, expiry_date, unit_cost)
SELECT gen_random_uuid(), '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 300, 300, 'B2026-NYK-01', '2028-06-30', 340.00
WHERE NOT EXISTS (SELECT 1 FROM grn_lines WHERE grn_id = '30000000-0000-0000-0000-000000000001' AND sku_id = '10000000-0000-0000-0000-000000000007');

INSERT INTO grn_lines (id, grn_id, sku_id, expected_qty, received_qty, batch_number, expiry_date, unit_cost)
SELECT gen_random_uuid(), '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000008', 200, 200, 'B2026-NYK-02', '2027-12-31', 495.00
WHERE NOT EXISTS (SELECT 1 FROM grn_lines WHERE grn_id = '30000000-0000-0000-0000-000000000001' AND sku_id = '10000000-0000-0000-0000-000000000008');

INSERT INTO grn_lines (id, grn_id, sku_id, expected_qty, received_qty, batch_number, expiry_date, unit_cost)
SELECT gen_random_uuid(), '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000009', 150, 150, 'B2026-NYK-03', '2027-09-30', 280.00
WHERE NOT EXISTS (SELECT 1 FROM grn_lines WHERE grn_id = '30000000-0000-0000-0000-000000000001' AND sku_id = '10000000-0000-0000-0000-000000000009');

COMMIT;
