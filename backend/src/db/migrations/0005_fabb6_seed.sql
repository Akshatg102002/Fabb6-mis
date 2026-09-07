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
  'fab60000-0000-0000-0000-000000000001',
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
DECLARE site_id UUID := 'fab60000-0000-0000-0000-000000000001';
BEGIN
  -- Receiving dock
  INSERT INTO locations (id, site_id, code, type, aisle, capacity_units)
  VALUES ('fab60001-0000-0000-0000-000000000001', site_id, 'RECV-01', 'receiving', NULL, 500)
  ON CONFLICT (code) DO NOTHING;

  -- Dispatch staging
  INSERT INTO locations (id, site_id, code, type, capacity_units)
  VALUES ('fab60001-0000-0000-0000-000000000002', site_id, 'DISP-01', 'dispatch', 300)
  ON CONFLICT (code) DO NOTHING;

  -- Returns bay
  INSERT INTO locations (id, site_id, code, type, capacity_units)
  VALUES ('fab60001-0000-0000-0000-000000000003', site_id, 'RET-01', 'returns', 200)
  ON CONFLICT (code) DO NOTHING;

  -- Aisle A, Rack 1, shelves 1–5 (A1-01 … A1-05)
  INSERT INTO locations (id, site_id, code, type, aisle, rack, shelf, capacity_units)
  VALUES
    ('fab60002-0000-0000-0000-000000000001', site_id, 'A1-01', 'bin', 'A', '1', '01', 80),
    ('fab60002-0000-0000-0000-000000000002', site_id, 'A1-02', 'bin', 'A', '1', '02', 80),
    ('fab60002-0000-0000-0000-000000000003', site_id, 'A1-03', 'bin', 'A', '1', '03', 80),
    ('fab60002-0000-0000-0000-000000000004', site_id, 'A1-04', 'bin', 'A', '1', '04', 80),
    ('fab60002-0000-0000-0000-000000000005', site_id, 'A1-05', 'bin', 'A', '1', '05', 80)
  ON CONFLICT (code) DO NOTHING;

  -- Aisle A, Rack 2, shelves 1–5 (A2-01 … A2-05)
  INSERT INTO locations (id, site_id, code, type, aisle, rack, shelf, capacity_units)
  VALUES
    ('fab60002-0000-0000-0000-000000000006', site_id, 'A2-01', 'bin', 'A', '2', '01', 80),
    ('fab60002-0000-0000-0000-000000000007', site_id, 'A2-02', 'bin', 'A', '2', '02', 80),
    ('fab60002-0000-0000-0000-000000000008', site_id, 'A2-03', 'bin', 'A', '2', '03', 80),
    ('fab60002-0000-0000-0000-000000000009', site_id, 'A2-04', 'bin', 'A', '2', '04', 80),
    ('fab60002-0000-0000-0000-000000000010', site_id, 'A2-05', 'bin', 'A', '2', '05', 80)
  ON CONFLICT (code) DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. ADMIN USER
-- pin_hash = argon2id hash of PIN "1234"  ← change after first login
-- To reset: POST /api/v1/auth/pin-change  (requires valid session)
-- ─────────────────────────────────────────────────────────────
INSERT INTO users (id, name, pin_hash, role, site_id, is_active)
VALUES (
  'fab60000-0000-0000-0099-000000000001',
  'Parag',
  '$argon2id$v=19$m=65536,t=3,p=4$1rAEOVUmT/+Y1GVtY5ZBmg$DsJjeePzqIr0tAFVroKZX1ZAmw5AFx0At7kdb5g/VTg',
  'admin',
  'fab60000-0000-0000-0000-000000000001',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Supervisor demo account (PIN 0000)
INSERT INTO users (id, name, pin_hash, role, site_id, is_active)
VALUES (
  'fab60000-0000-0000-0099-000000000002',
  'Supervisor',
  '$argon2id$v=19$m=65536,t=3,p=4$4KBdcto+oEQRtY1vRIyJpw$BW8AVMf3ioaX5+F9bpviDOHwmii35xDvQ69DCBI/h78',
  'supervisor',
  'fab60000-0000-0000-0000-000000000001',
  true
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 5. SKUs  (id omitted — Postgres generates via defaultRandom();
--           brand_id resolved via sub-select; no barcode column
--           on skus — barcodes go into the gtins table below)
-- ─────────────────────────────────────────────────────────────
INSERT INTO skus (code, name, brand_id, hsn_code, gst_rate, mrp, uom, shelf_life_tracked, abc_class, is_active)
VALUES
  -- L'Oréal Professionnel — Inoa colour
  ('INOA-3-60G',   'Inoa 3 Natural Darkest Brown 60g',
    (SELECT id FROM brands WHERE name = 'L''Oréal Professionnel'), '33059090', 18.00,  750.00, 'EACH', false, 'A', true),
  ('INOA-4-60G',   'Inoa 4 Natural Brown 60g',
    (SELECT id FROM brands WHERE name = 'L''Oréal Professionnel'), '33059090', 18.00,  750.00, 'EACH', false, 'A', true),
  ('INOA-6-60G',   'Inoa 6 Natural Dark Blonde 60g',
    (SELECT id FROM brands WHERE name = 'L''Oréal Professionnel'), '33059090', 18.00,  750.00, 'EACH', false, 'A', true),
  ('OREOR-20V-1L', 'Oreor Creme Developer 20vol 1000ml',
    (SELECT id FROM brands WHERE name = 'L''Oréal Professionnel'), '33059090', 18.00,  480.00, 'EACH', false, 'B', true),
  ('OREOR-30V-1L', 'Oreor Creme Developer 30vol 1000ml',
    (SELECT id FROM brands WHERE name = 'L''Oréal Professionnel'), '33059090', 18.00,  480.00, 'EACH', false, 'B', true),

  -- Schwarzkopf — Igora Royal
  ('IGORA-3-0-60G', 'Igora Royal 3-0 Natural Darkest Brown 60g',
    (SELECT id FROM brands WHERE name = 'Schwarzkopf Professional'), '33059090', 18.00, 820.00, 'EACH', false, 'A', true),

  -- Wella — Koleston Perfect
  ('KP-5-0-60G',   'Koleston Perfect 5/0 Pure Naturals 60g',
    (SELECT id FROM brands WHERE name = 'Wella Professionals'), '33059090', 18.00, 780.00, 'EACH', false, 'A', true),

  -- Olaplex
  ('OLAP-NO3-100ML', 'Olaplex No.3 Hair Perfector 100ml',
    (SELECT id FROM brands WHERE name = 'Olaplex'), '33059090', 18.00, 2800.00, 'EACH', false, 'A', true),
  ('OLAP-NO4-250ML', 'Olaplex No.4 Bond Maintenance Shampoo 250ml',
    (SELECT id FROM brands WHERE name = 'Olaplex'), '33059090', 18.00, 2600.00, 'EACH', false, 'A', true),

  -- Minimalist
  ('MINI-NIA-10-30ML', 'Minimalist 10% Niacinamide Zinc 30ml',
    (SELECT id FROM brands WHERE name = 'Minimalist'), '33049900', 18.00, 599.00, 'EACH', false, 'B', true),
  ('MINI-SPF50-50ML',  'Minimalist SPF 50 PA++++ Sunscreen 50ml',
    (SELECT id FROM brands WHERE name = 'Minimalist'), '33049900', 18.00, 599.00, 'EACH', false, 'B', true),

  -- Cetaphil
  ('CETA-MOI-250G', 'Cetaphil Moisturising Cream 250g',
    (SELECT id FROM brands WHERE name = 'Cetaphil'), '33049900', 12.00, 499.00, 'EACH', false, 'B', true),

  -- Kérastase
  ('KERA-NUT-MASQ-200ML', 'Kérastase Nutritive Masque Magistral 200ml',
    (SELECT id FROM brands WHERE name = 'Kérastase'), '33059090', 18.00, 2200.00, 'EACH', false, 'A', true),

  -- Krone
  ('KRONE-KER-500ML', 'Krone Keratin Treatment Smoothing 500ml',
    (SELECT id FROM brands WHERE name = 'Krone'), '33059090', 18.00, 1800.00, 'EACH', false, 'B', true),

  -- FYC
  ('FYC-PROT-500ML', 'FYC Protein Filler Hair Reconstructor 500ml',
    (SELECT id FROM brands WHERE name = 'FYC'), '33059090', 18.00, 950.00, 'EACH', false, 'C', true)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 6. GTINs (barcodes — stored in gtins table, not on skus)
--    sku_id resolved via sub-select on code
-- ─────────────────────────────────────────────────────────────
INSERT INTO gtins (barcode, sku_id, source, is_primary)
VALUES
  ('3474630715478', (SELECT id FROM skus WHERE code = 'INOA-3-60G'),       'supplier', true),
  ('3474630715485', (SELECT id FROM skus WHERE code = 'INOA-4-60G'),       'supplier', true),
  ('3474630715492', (SELECT id FROM skus WHERE code = 'INOA-6-60G'),       'supplier', true),
  ('3474630620001', (SELECT id FROM skus WHERE code = 'OREOR-20V-1L'),     'supplier', true),
  ('3474630620018', (SELECT id FROM skus WHERE code = 'OREOR-30V-1L'),     'supplier', true),
  ('4045787394573', (SELECT id FROM skus WHERE code = 'IGORA-3-0-60G'),    'supplier', true),
  ('8005610527574', (SELECT id FROM skus WHERE code = 'KP-5-0-60G'),       'supplier', true),
  ('0896364002441', (SELECT id FROM skus WHERE code = 'OLAP-NO3-100ML'),   'supplier', true),
  ('0896364002458', (SELECT id FROM skus WHERE code = 'OLAP-NO4-250ML'),   'supplier', true),
  ('8906130680015', (SELECT id FROM skus WHERE code = 'MINI-NIA-10-30ML'), 'supplier', true),
  ('8906130680022', (SELECT id FROM skus WHERE code = 'MINI-SPF50-50ML'),  'supplier', true),
  ('8901396915003', (SELECT id FROM skus WHERE code = 'CETA-MOI-250G'),    'supplier', true),
  ('3474636397048', (SELECT id FROM skus WHERE code = 'KERA-NUT-MASQ-200ML'), 'supplier', true),
  ('8712345600017', (SELECT id FROM skus WHERE code = 'KRONE-KER-500ML'),  'manual',   true),
  ('8712345700014', (SELECT id FROM skus WHERE code = 'FYC-PROT-500ML'),   'manual',   true)
ON CONFLICT (barcode) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 7. STOCK MOVEMENTS → puts 20-50 units of each SKU into bins
--    A1-01 through A1-05 and A2-01 through A2-05
--    sku_id resolved via sub-select on code
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  recv      UUID := 'fab60001-0000-0000-0000-000000000001';
  bin_a1_01 UUID := 'fab60002-0000-0000-0000-000000000001';
  bin_a1_02 UUID := 'fab60002-0000-0000-0000-000000000002';
  bin_a1_03 UUID := 'fab60002-0000-0000-0000-000000000003';
  bin_a1_04 UUID := 'fab60002-0000-0000-0000-000000000004';
  bin_a1_05 UUID := 'fab60002-0000-0000-0000-000000000005';
  bin_a2_01 UUID := 'fab60002-0000-0000-0000-000000000006';
  bin_a2_02 UUID := 'fab60002-0000-0000-0000-000000000007';
  bin_a2_03 UUID := 'fab60002-0000-0000-0000-000000000008';
  bin_a2_04 UUID := 'fab60002-0000-0000-0000-000000000009';
  bin_a2_05 UUID := 'fab60002-0000-0000-0000-000000000010';

  s1  UUID; s2  UUID; s3  UUID; s4  UUID; s5  UUID;
  s6  UUID; s7  UUID; s8  UUID; s9  UUID; s10 UUID;
  s11 UUID; s12 UUID; s13 UUID; s14 UUID; s15 UUID;
BEGIN
  SELECT id INTO s1  FROM skus WHERE code = 'INOA-3-60G';
  SELECT id INTO s2  FROM skus WHERE code = 'INOA-4-60G';
  SELECT id INTO s3  FROM skus WHERE code = 'INOA-6-60G';
  SELECT id INTO s4  FROM skus WHERE code = 'OREOR-20V-1L';
  SELECT id INTO s5  FROM skus WHERE code = 'OREOR-30V-1L';
  SELECT id INTO s6  FROM skus WHERE code = 'IGORA-3-0-60G';
  SELECT id INTO s7  FROM skus WHERE code = 'KP-5-0-60G';
  SELECT id INTO s8  FROM skus WHERE code = 'OLAP-NO3-100ML';
  SELECT id INTO s9  FROM skus WHERE code = 'OLAP-NO4-250ML';
  SELECT id INTO s10 FROM skus WHERE code = 'MINI-NIA-10-30ML';
  SELECT id INTO s11 FROM skus WHERE code = 'MINI-SPF50-50ML';
  SELECT id INTO s12 FROM skus WHERE code = 'CETA-MOI-250G';
  SELECT id INTO s13 FROM skus WHERE code = 'KERA-NUT-MASQ-200ML';
  SELECT id INTO s14 FROM skus WHERE code = 'KRONE-KER-500ML';
  SELECT id INTO s15 FROM skus WHERE code = 'FYC-PROT-500ML';

  INSERT INTO stock_movements
    (idempotency_key, sku_id, from_location_id, to_location_id, quantity, movement_type, reference_type, notes)
  VALUES
    -- A1-01: INOA-3 × 48, INOA-4 × 36
    ('seed-INOA-3-60G-A1-01',      s1,  recv, bin_a1_01, 48, 'grn_receipt', 'manual', 'Opening stock seed'),
    ('seed-INOA-4-60G-A1-01',      s2,  recv, bin_a1_01, 36, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A1-02: INOA-6 × 30, OREOR-20V × 20
    ('seed-INOA-6-60G-A1-02',      s3,  recv, bin_a1_02, 30, 'grn_receipt', 'manual', 'Opening stock seed'),
    ('seed-OREOR-20V-1L-A1-02',    s4,  recv, bin_a1_02, 20, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A1-03: OREOR-30V × 24, IGORA-3-0 × 42
    ('seed-OREOR-30V-1L-A1-03',    s5,  recv, bin_a1_03, 24, 'grn_receipt', 'manual', 'Opening stock seed'),
    ('seed-IGORA-3-0-60G-A1-03',   s6,  recv, bin_a1_03, 42, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A1-04: KP-5-0 × 38, OLAP-NO3 × 25
    ('seed-KP-5-0-60G-A1-04',      s7,  recv, bin_a1_04, 38, 'grn_receipt', 'manual', 'Opening stock seed'),
    ('seed-OLAP-NO3-100ML-A1-04',  s8,  recv, bin_a1_04, 25, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A1-05: OLAP-NO4 × 20, MINI-NIA × 50
    ('seed-OLAP-NO4-250ML-A1-05',  s9,  recv, bin_a1_05, 20, 'grn_receipt', 'manual', 'Opening stock seed'),
    ('seed-MINI-NIA-10-30ML-A1-05',s10, recv, bin_a1_05, 50, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A2-01: MINI-SPF × 44
    ('seed-MINI-SPF50-50ML-A2-01', s11, recv, bin_a2_01, 44, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A2-02: CETA-MOI × 35
    ('seed-CETA-MOI-250G-A2-02',   s12, recv, bin_a2_02, 35, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A2-03: KERA-NUT × 22
    ('seed-KERA-NUT-MASQ-200ML-A2-03', s13, recv, bin_a2_03, 22, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A2-04: KRONE-KER × 28
    ('seed-KRONE-KER-500ML-A2-04', s14, recv, bin_a2_04, 28, 'grn_receipt', 'manual', 'Opening stock seed'),

    -- A2-05: FYC-PROT × 32
    ('seed-FYC-PROT-500ML-A2-05',  s15, recv, bin_a2_05, 32, 'grn_receipt', 'manual', 'Opening stock seed')
  ON CONFLICT (idempotency_key) DO NOTHING;
END $$;

-- NOTE: stock_on_hand is a materialized view created by 0001_initial.sql.
-- It is NOT present when using db:push. If you have run 0001_initial.sql,
-- refresh it manually after seeding:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY stock_on_hand;

COMMIT;
