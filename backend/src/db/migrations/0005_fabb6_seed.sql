-- =============================================================
-- Fabb6 WMS — Demo Seed Data  (0005_fabb6_seed.sql)
-- Safe to run multiple times: every INSERT uses ON CONFLICT DO NOTHING
-- Matches schema created by Drizzle db:push (catalogue.ts, locations.ts,
-- auth.ts, inventory.ts)
--
-- Default PINs (change after first login via POST /api/v1/auth/pin-change):
--   Parag  (admin)       → PIN  1234
--   Supervisor           → PIN  0000
-- =============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. BRANDS
-- ─────────────────────────────────────────────────────────────
INSERT INTO brands (name, is_active) VALUES
  ('L''Oréal Professionnel',    true),
  ('Schwarzkopf Professional',  true),
  ('Wella Professionals',       true),
  ('Kérastase',                 true),
  ('Olaplex',                   true),
  ('Minimalist',                true),
  ('Cetaphil',                  true),
  ('Krone',                     true),
  ('FYC',                       true)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. SITE
-- ─────────────────────────────────────────────────────────────
INSERT INTO sites (id, name, address, gstin, is_active)
VALUES (
  'fabb6000-0000-0000-0000-000000000001',
  'Fabb6 Navi Mumbai Warehouse',
  'Unit 7, Turbhe MIDC, Navi Mumbai – 400705, Maharashtra',
  '27AABCF5678H1Z2',
  true
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. LOCATIONS  (10 bins + receiving + dispatch + returns)
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE site_id UUID := 'fabb6000-0000-0000-0000-000000000001';
BEGIN
  -- Receiving dock
  INSERT INTO locations (id, site_id, code, type, aisle, capacity_units)
  VALUES ('fabb6000-0001-0000-0000-000000000001', site_id, 'RECV-01', 'receiving', NULL, 500)
  ON CONFLICT (code) DO NOTHING;

  -- Dispatch staging
  INSERT INTO locations (id, site_id, code, type, capacity_units)
  VALUES ('fabb6000-0001-0000-0000-000000000002', site_id, 'DISP-01', 'dispatch', 300)
  ON CONFLICT (code) DO NOTHING;

  -- Returns bay
  INSERT INTO locations (id, site_id, code, type, capacity_units)
  VALUES ('fabb6000-0001-0000-0000-000000000003', site_id, 'RET-01', 'returns', 200)
  ON CONFLICT (code) DO NOTHING;

  -- Aisle A, Rack 1, shelves 1–5 (A1-01 … A1-05)
  INSERT INTO locations (id, site_id, code, type, aisle, rack, shelf, capacity_units)
  VALUES
    ('fabb6000-0002-0000-0000-000000000001', site_id, 'A1-01', 'bin', 'A', '1', '01', 80),
    ('fabb6000-0002-0000-0000-000000000002', site_id, 'A1-02', 'bin', 'A', '1', '02', 80),
    ('fabb6000-0002-0000-0000-000000000003', site_id, 'A1-03', 'bin', 'A', '1', '03', 80),
    ('fabb6000-0002-0000-0000-000000000004', site_id, 'A1-04', 'bin', 'A', '1', '04', 80),
    ('fabb6000-0002-0000-0000-000000000005', site_id, 'A1-05', 'bin', 'A', '1', '05', 80)
  ON CONFLICT (code) DO NOTHING;

  -- Aisle A, Rack 2, shelves 1–5 (A2-01 … A2-05)
  INSERT INTO locations (id, site_id, code, type, aisle, rack, shelf, capacity_units)
  VALUES
    ('fabb6000-0002-0000-0000-000000000006', site_id, 'A2-01', 'bin', 'A', '2', '01', 80),
    ('fabb6000-0002-0000-0000-000000000007', site_id, 'A2-02', 'bin', 'A', '2', '02', 80),
    ('fabb6000-0002-0000-0000-000000000008', site_id, 'A2-03', 'bin', 'A', '2', '03', 80),
    ('fabb6000-0002-0000-0000-000000000009', site_id, 'A2-04', 'bin', 'A', '2', '04', 80),
    ('fabb6000-0002-0000-0000-000000000010', site_id, 'A2-05', 'bin', 'A', '2', '05', 80)
  ON CONFLICT (code) DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. ADMIN USER
-- pin_hash = argon2id hash of PIN "1234"  ← change after first login
-- To reset: POST /api/v1/auth/pin-change  (requires valid session)
-- ─────────────────────────────────────────────────────────────
INSERT INTO users (id, name, pin_hash, role, site_id, is_active)
VALUES (
  'fabb6000-0000-0000-0099-000000000001',
  'Parag',
  '$argon2id$v=19$m=65536,t=3,p=4$1rAEOVUmT/+Y1GVtY5ZBmg$DsJjeePzqIr0tAFVroKZX1ZAmw5AFx0At7kdb5g/VTg',
  'admin',
  'fabb6000-0000-0000-0000-000000000001',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Supervisor demo account (PIN 0000)
INSERT INTO users (id, name, pin_hash, role, site_id, is_active)
VALUES (
  'fabb6000-0000-0000-0099-000000000002',
  'Supervisor',
  '$argon2id$v=19$m=65536,t=3,p=4$4KBdcto+oEQRtY1vRIyJpw$BW8AVMf3ioaX5+F9bpviDOHwmii35xDvQ69DCBI/h78',
  'supervisor',
  'fabb6000-0000-0000-0000-000000000001',
  true
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 5. SKUs  (brand_id resolved via sub-select; no barcode column
--           on skus — barcodes go into the gtins table below)
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  b_loreal   UUID; b_schwk UUID; b_wella UUID;
  b_kera     UUID; b_olap  UUID; b_mini  UUID;
  b_ceta     UUID; b_krone UUID; b_fyc   UUID;
BEGIN
  SELECT id INTO b_loreal FROM brands WHERE name = 'L''Oréal Professionnel'   LIMIT 1;
  SELECT id INTO b_schwk  FROM brands WHERE name = 'Schwarzkopf Professional' LIMIT 1;
  SELECT id INTO b_wella  FROM brands WHERE name = 'Wella Professionals'      LIMIT 1;
  SELECT id INTO b_kera   FROM brands WHERE name = 'Kérastase'                LIMIT 1;
  SELECT id INTO b_olap   FROM brands WHERE name = 'Olaplex'                  LIMIT 1;
  SELECT id INTO b_mini   FROM brands WHERE name = 'Minimalist'               LIMIT 1;
  SELECT id INTO b_ceta   FROM brands WHERE name = 'Cetaphil'                 LIMIT 1;
  SELECT id INTO b_krone  FROM brands WHERE name = 'Krone'                    LIMIT 1;
  SELECT id INTO b_fyc    FROM brands WHERE name = 'FYC'                      LIMIT 1;

  INSERT INTO skus (id, code, name, brand_id, hsn_code, gst_rate, mrp, uom, shelf_life_tracked, abc_class, is_active)
  VALUES
    -- L'Oréal Professionnel — Inoa colour
    ('fabb6sku-0001-0000-0000-000000000001', 'INOA-3-60G',  'Inoa 3 Natural Darkest Brown 60g',    b_loreal, '33059090', 18.00,  750.00, 'EACH', false, 'A', true),
    ('fabb6sku-0001-0000-0000-000000000002', 'INOA-4-60G',  'Inoa 4 Natural Brown 60g',             b_loreal, '33059090', 18.00,  750.00, 'EACH', false, 'A', true),
    ('fabb6sku-0001-0000-0000-000000000003', 'INOA-6-60G',  'Inoa 6 Natural Dark Blonde 60g',       b_loreal, '33059090', 18.00,  750.00, 'EACH', false, 'A', true),
    ('fabb6sku-0001-0000-0000-000000000004', 'OREOR-20V-1L','Oreor Creme Developer 20vol 1000ml',   b_loreal, '33059090', 18.00,  480.00, 'EACH', false, 'B', true),
    ('fabb6sku-0001-0000-0000-000000000005', 'OREOR-30V-1L','Oreor Creme Developer 30vol 1000ml',   b_loreal, '33059090', 18.00,  480.00, 'EACH', false, 'B', true),

    -- Schwarzkopf — Igora Royal
    ('fabb6sku-0002-0000-0000-000000000001', 'IGORA-3-0-60G','Igora Royal 3-0 Natural Darkest Brown 60g', b_schwk, '33059090', 18.00, 820.00, 'EACH', false, 'A', true),

    -- Wella — Koleston Perfect
    ('fabb6sku-0003-0000-0000-000000000001', 'KP-5-0-60G',  'Koleston Perfect 5/0 Pure Naturals 60g', b_wella, '33059090', 18.00, 780.00, 'EACH', false, 'A', true),

    -- Olaplex
    ('fabb6sku-0005-0000-0000-000000000001', 'OLAP-NO3-100ML','Olaplex No.3 Hair Perfector 100ml',  b_olap, '33059090', 18.00, 2800.00, 'EACH', false, 'A', true),
    ('fabb6sku-0005-0000-0000-000000000002', 'OLAP-NO4-250ML','Olaplex No.4 Bond Maintenance Shampoo 250ml', b_olap, '33059090', 18.00, 2600.00, 'EACH', false, 'A', true),

    -- Minimalist
    ('fabb6sku-0006-0000-0000-000000000001', 'MINI-NIA-10-30ML','Minimalist 10% Niacinamide Zinc 30ml', b_mini, '33049900', 18.00, 599.00, 'EACH', false, 'B', true),
    ('fabb6sku-0006-0000-0000-000000000002', 'MINI-SPF50-50ML', 'Minimalist SPF 50 PA++++ Sunscreen 50ml', b_mini, '33049900', 18.00, 599.00, 'EACH', false, 'B', true),

    -- Cetaphil
    ('fabb6sku-0007-0000-0000-000000000001', 'CETA-MOI-250G', 'Cetaphil Moisturising Cream 250g',    b_ceta, '33049900', 12.00, 499.00, 'EACH', false, 'B', true),

    -- Kérastase
    ('fabb6sku-0004-0000-0000-000000000001', 'KERA-NUT-MASQ-200ML','Kérastase Nutritive Masque Magistral 200ml', b_kera, '33059090', 18.00, 2200.00, 'EACH', false, 'A', true),

    -- Krone
    ('fabb6sku-0008-0000-0000-000000000001', 'KRONE-KER-500ML','Krone Keratin Treatment Smoothing 500ml', b_krone, '33059090', 18.00, 1800.00, 'EACH', false, 'B', true),

    -- FYC
    ('fabb6sku-0009-0000-0000-000000000001', 'FYC-PROT-500ML','FYC Protein Filler Hair Reconstructor 500ml', b_fyc, '33059090', 18.00, 950.00, 'EACH', false, 'C', true)
  ON CONFLICT (code) DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 6. GTINs (barcodes — stored in gtins table, not on skus)
-- ─────────────────────────────────────────────────────────────
INSERT INTO gtins (barcode, sku_id, source, is_primary)
VALUES
  ('3474630715478', 'fabb6sku-0001-0000-0000-000000000001', 'supplier', true),
  ('3474630715485', 'fabb6sku-0001-0000-0000-000000000002', 'supplier', true),
  ('3474630715492', 'fabb6sku-0001-0000-0000-000000000003', 'supplier', true),
  ('3474630620001', 'fabb6sku-0001-0000-0000-000000000004', 'supplier', true),
  ('3474630620018', 'fabb6sku-0001-0000-0000-000000000005', 'supplier', true),
  ('4045787394573', 'fabb6sku-0002-0000-0000-000000000001', 'supplier', true),
  ('8005610527574', 'fabb6sku-0003-0000-0000-000000000001', 'supplier', true),
  ('0896364002441', 'fabb6sku-0005-0000-0000-000000000001', 'supplier', true),
  ('0896364002458', 'fabb6sku-0005-0000-0000-000000000002', 'supplier', true),
  ('8906130680015', 'fabb6sku-0006-0000-0000-000000000001', 'supplier', true),
  ('8906130680022', 'fabb6sku-0006-0000-0000-000000000002', 'supplier', true),
  ('8901396915003', 'fabb6sku-0007-0000-0000-000000000001', 'supplier', true),
  ('3474636397048', 'fabb6sku-0004-0000-0000-000000000001', 'supplier', true),
  ('8712345600017', 'fabb6sku-0008-0000-0000-000000000001', 'manual',   true),
  ('8712345700014', 'fabb6sku-0009-0000-0000-000000000001', 'manual',   true)
ON CONFLICT (barcode) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 7. STOCK MOVEMENTS → puts 20-50 units of each SKU into bins
--    A1-01 through A1-05 and A2-01 through A2-05
--    idempotency_key format: seed-<sku_code>-<location_code>
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  recv UUID := 'fabb6000-0001-0000-0000-000000000001';

  -- bin UUIDs
  bin_a1_01 UUID := 'fabb6000-0002-0000-0000-000000000001';
  bin_a1_02 UUID := 'fabb6000-0002-0000-0000-000000000002';
  bin_a1_03 UUID := 'fabb6000-0002-0000-0000-000000000003';
  bin_a1_04 UUID := 'fabb6000-0002-0000-0000-000000000004';
  bin_a1_05 UUID := 'fabb6000-0002-0000-0000-000000000005';
  bin_a2_01 UUID := 'fabb6000-0002-0000-0000-000000000006';
  bin_a2_02 UUID := 'fabb6000-0002-0000-0000-000000000007';
  bin_a2_03 UUID := 'fabb6000-0002-0000-0000-000000000008';
  bin_a2_04 UUID := 'fabb6000-0002-0000-0000-000000000009';
  bin_a2_05 UUID := 'fabb6000-0002-0000-0000-000000000010';

  -- sku UUIDs
  s1  UUID := 'fabb6sku-0001-0000-0000-000000000001';  -- INOA-3
  s2  UUID := 'fabb6sku-0001-0000-0000-000000000002';  -- INOA-4
  s3  UUID := 'fabb6sku-0001-0000-0000-000000000003';  -- INOA-6
  s4  UUID := 'fabb6sku-0001-0000-0000-000000000004';  -- OREOR-20V
  s5  UUID := 'fabb6sku-0001-0000-0000-000000000005';  -- OREOR-30V
  s6  UUID := 'fabb6sku-0002-0000-0000-000000000001';  -- IGORA-3-0
  s7  UUID := 'fabb6sku-0003-0000-0000-000000000001';  -- KP-5-0
  s8  UUID := 'fabb6sku-0005-0000-0000-000000000001';  -- OLAP-NO3
  s9  UUID := 'fabb6sku-0005-0000-0000-000000000002';  -- OLAP-NO4
  s10 UUID := 'fabb6sku-0006-0000-0000-000000000001';  -- MINI-NIA
  s11 UUID := 'fabb6sku-0006-0000-0000-000000000002';  -- MINI-SPF
  s12 UUID := 'fabb6sku-0007-0000-0000-000000000001';  -- CETA-MOI
  s13 UUID := 'fabb6sku-0004-0000-0000-000000000001';  -- KERA-NUT
  s14 UUID := 'fabb6sku-0008-0000-0000-000000000001';  -- KRONE-KER
  s15 UUID := 'fabb6sku-0009-0000-0000-000000000001';  -- FYC-PROT
BEGIN

  INSERT INTO stock_movements
    (idempotency_key, sku_id, from_location_id, to_location_id, quantity, movement_type, reference_type, notes)
  VALUES
    -- A1-01: INOA-3 × 48, INOA-4 × 36
    ('seed-INOA-3-60G-A1-01',   s1,  recv, bin_a1_01, 48, 'grn_receipt', 'manual', 'Opening stock seed'),
    ('seed-INOA-4-60G-A1-01',   s2,  recv, bin_a1_01, 36, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A1-02: INOA-6 × 30, OREOR-20V × 20
    ('seed-INOA-6-60G-A1-02',   s3,  recv, bin_a1_02, 30, 'grn_receipt', 'manual', 'Opening stock seed'),
    ('seed-OREOR-20V-1L-A1-02', s4,  recv, bin_a1_02, 20, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A1-03: OREOR-30V × 24, IGORA-3-0 × 42
    ('seed-OREOR-30V-1L-A1-03', s5,  recv, bin_a1_03, 24, 'grn_receipt', 'manual', 'Opening stock seed'),
    ('seed-IGORA-3-0-60G-A1-03',s6,  recv, bin_a1_03, 42, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A1-04: KP-5-0 × 38, OLAP-NO3 × 25
    ('seed-KP-5-0-60G-A1-04',   s7,  recv, bin_a1_04, 38, 'grn_receipt', 'manual', 'Opening stock seed'),
    ('seed-OLAP-NO3-100ML-A1-04',s8, recv, bin_a1_04, 25, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A1-05: OLAP-NO4 × 20, MINI-NIA × 50
    ('seed-OLAP-NO4-250ML-A1-05',s9,  recv, bin_a1_05, 20, 'grn_receipt', 'manual', 'Opening stock seed'),
    ('seed-MINI-NIA-10-30ML-A1-05',s10,recv, bin_a1_05, 50, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A2-01: MINI-SPF × 44
    ('seed-MINI-SPF50-50ML-A2-01',s11,recv, bin_a2_01, 44, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A2-02: CETA-MOI × 35
    ('seed-CETA-MOI-250G-A2-02',  s12,recv, bin_a2_02, 35, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A2-03: KERA-NUT × 22
    ('seed-KERA-NUT-MASQ-200ML-A2-03',s13,recv, bin_a2_03, 22, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A2-04: KRONE-KER × 28
    ('seed-KRONE-KER-500ML-A2-04',s14,recv, bin_a2_04, 28, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A2-05: FYC-PROT × 32
    ('seed-FYC-PROT-500ML-A2-05', s15,recv, bin_a2_05, 32, 'grn_receipt', 'manual', 'Opening stock seed')
  ON CONFLICT (idempotency_key) DO NOTHING;

END $$;

-- ─────────────────────────────────────────────────────────────
-- 8. REFRESH the stock_on_hand materialized view
--    (if it was created with CONCURRENTLY option, this is safe)
-- ─────────────────────────────────────────────────────────────
REFRESH MATERIALIZED VIEW CONCURRENTLY stock_on_hand;

COMMIT;
