BEGIN;

-- Add vendor_code and city to suppliers
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS vendor_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_vendor_code_idx ON suppliers(vendor_code) WHERE vendor_code IS NOT NULL;

-- shipping_manifests table
CREATE TABLE IF NOT EXISTS shipping_manifests (
  awb_number     VARCHAR(50) PRIMARY KEY,
  order_id       VARCHAR(50),
  courier_partner VARCHAR(30),
  shipping_status VARCHAR(30) NOT NULL DEFAULT 'DISPATCHED',
  item_payload   JSONB,
  pick_list_id   UUID REFERENCES pick_lists(id),
  processed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sm_status   ON shipping_manifests(shipping_status);
CREATE INDEX IF NOT EXISTS idx_sm_order_id ON shipping_manifests(order_id);

-- Seed Indian beauty suppliers (idempotent via vendor_code conflict)
INSERT INTO suppliers (id, name, gstin, city, vendor_code, is_active)
VALUES
  (gen_random_uuid(), 'Nykaa E-Retail Pvt Ltd',       '27AAACN1234F1Z5', 'Mumbai',  'VEND-NYK-01', true),
  (gen_random_uuid(), 'Sugar Cosmetics (Vellvette)',   '27AABCX5678D1Z2', 'Thane',   'VEND-SUG-02', true),
  (gen_random_uuid(), 'Dot & Key Skincare',            '19AAACD9876C1ZN', 'Kolkata', 'VEND-DOT-03', true)
ON CONFLICT DO NOTHING;

COMMIT;
