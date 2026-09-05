-- Fabb6 MIS - Initial Database Migration
-- PostgreSQL 16

BEGIN;

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM (
  'picker', 'packer', 'inward', 'returns', 'supervisor', 'admin', 'read_only'
);

CREATE TYPE location_type AS ENUM (
  'receiving', 'bin', 'pick_face', 'quarantine', 'dispatch', 'returns'
);

CREATE TYPE abc_class AS ENUM ('A', 'B', 'C');

CREATE TYPE gtin_source AS ENUM ('supplier', 'manual', 'shopify', 'scan');

CREATE TYPE movement_type AS ENUM (
  'grn_receipt', 'putaway', 'pick', 'pack_confirm', 'dispatch',
  'customer_return', 'rto_receipt', 'transfer_out', 'transfer_in_transit',
  'transfer_receipt', 'cycle_count_adjustment', 'stock_adjustment',
  'writeoff', 'quarantine', 'unquarantine'
);

CREATE TYPE reference_type AS ENUM (
  'grn', 'pick_list', 'return', 'cycle_count', 'adjustment',
  'transfer', 'purchase_order', 'manual'
);

CREATE TYPE po_status AS ENUM ('draft', 'confirmed', 'partial', 'received', 'cancelled');

CREATE TYPE grn_status AS ENUM ('draft', 'in_progress', 'completed', 'posted');

CREATE TYPE pick_list_status AS ENUM (
  'pending', 'assigned', 'in_progress', 'partially_picked',
  'picked', 'packed', 'dispatched', 'cancelled'
);

CREATE TYPE pick_channel AS ENUM ('shopify', 'b2b', 'transfer', 'manual');

CREATE TYPE return_type AS ENUM ('customer_return', 'rto');

CREATE TYPE return_status AS ENUM ('pending', 'received', 'inspected', 'completed', 'cancelled');

CREATE TYPE qc_grade AS ENUM ('A', 'B', 'damaged', 'expired');

CREATE TYPE disposition AS ENUM ('restock', 'repack', 'writeoff');

CREATE TYPE cycle_count_status AS ENUM (
  'scheduled', 'in_progress', 'counted', 'under_review', 'approved', 'posted', 'cancelled'
);

CREATE TYPE adjustment_status AS ENUM ('pending', 'approved', 'rejected', 'posted');

-- ============================================================
-- SITES & LOCATIONS
-- ============================================================
CREATE TABLE sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  address     TEXT,
  gstin       VARCHAR(15),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE locations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        UUID NOT NULL REFERENCES sites(id),
  code           VARCHAR(50) NOT NULL UNIQUE,
  type           location_type NOT NULL,
  aisle          VARCHAR(10),
  rack           VARCHAR(10),
  shelf          VARCHAR(10),
  position       VARCHAR(10),
  capacity_units INTEGER,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX locations_site_id_idx ON locations(site_id);
CREATE INDEX locations_type_idx ON locations(type);

-- ============================================================
-- USERS & SESSIONS
-- ============================================================
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  pin_hash    TEXT NOT NULL,
  role        user_role NOT NULL,
  site_id     UUID REFERENCES sites(id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX users_role_idx ON users(role);
CREATE INDEX users_site_id_idx ON users(site_id);

CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  device_id    VARCHAR(255) NOT NULL,
  role         user_role NOT NULL,
  site_id      UUID REFERENCES sites(id),
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ,
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  ttl_seconds  INTEGER NOT NULL DEFAULT 28800
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
CREATE INDEX sessions_token_hash_idx ON sessions(token_hash);

-- ============================================================
-- CATALOGUE
-- ============================================================
CREATE TABLE brands (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  parent_id  UUID REFERENCES categories(id),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE suppliers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  gstin         VARCHAR(15),
  contact_name  VARCHAR(255),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(255),
  address       TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE skus (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 VARCHAR(100) NOT NULL UNIQUE,
  name                 VARCHAR(255) NOT NULL,
  brand_id             UUID REFERENCES brands(id),
  category_id          UUID REFERENCES categories(id),
  hsn_code             VARCHAR(8),
  gst_rate             NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  mrp                  NUMERIC(12,2),
  standard_cost        NUMERIC(12,2),
  pack_size            INTEGER NOT NULL DEFAULT 1,
  uom                  VARCHAR(20) NOT NULL DEFAULT 'EACH',
  shelf_life_tracked   BOOLEAN NOT NULL DEFAULT FALSE,
  min_shelf_life_days  INTEGER,
  abc_class            abc_class NOT NULL DEFAULT 'C',
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX skus_code_idx ON skus(code);
CREATE INDEX skus_brand_id_idx ON skus(brand_id);
CREATE INDEX skus_category_id_idx ON skus(category_id);
CREATE INDEX skus_is_active_idx ON skus(is_active);

CREATE TABLE gtins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode    VARCHAR(50) NOT NULL UNIQUE,
  sku_id     UUID NOT NULL REFERENCES skus(id),
  source     gtin_source NOT NULL DEFAULT 'manual',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX gtins_sku_id_idx ON gtins(sku_id);
CREATE INDEX gtins_barcode_idx ON gtins(barcode);

-- ============================================================
-- INVENTORY (Batches, Stock Movements, Stock On Hand)
-- ============================================================
CREATE TABLE batches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id                UUID NOT NULL REFERENCES skus(id),
  batch_number          VARCHAR(100) NOT NULL,
  mfg_date              TIMESTAMPTZ,
  expiry_date           TIMESTAMPTZ,
  landed_cost_per_unit  NUMERIC(12,2),
  supplier_id           UUID REFERENCES suppliers(id),
  grn_id                UUID, -- FK added after grns table
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sku_id, batch_number)
);

CREATE INDEX batches_sku_id_idx ON batches(sku_id);
CREATE INDEX batches_expiry_date_idx ON batches(expiry_date);

CREATE TABLE stock_movements (
  id               BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  idempotency_key  VARCHAR(128) NOT NULL UNIQUE,
  sku_id           UUID NOT NULL REFERENCES skus(id),
  batch_id         UUID REFERENCES batches(id),
  from_location_id UUID REFERENCES locations(id),
  to_location_id   UUID REFERENCES locations(id),
  quantity         INTEGER NOT NULL,
  movement_type    movement_type NOT NULL,
  reference_type   reference_type,
  reference_id     UUID,
  reason_code      VARCHAR(50),
  user_id          UUID REFERENCES users(id),
  device_id        VARCHAR(255),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX stock_movements_sku_id_idx ON stock_movements(sku_id);
CREATE INDEX stock_movements_batch_id_idx ON stock_movements(batch_id);
CREATE INDEX stock_movements_from_location_idx ON stock_movements(from_location_id);
CREATE INDEX stock_movements_to_location_idx ON stock_movements(to_location_id);
CREATE INDEX stock_movements_movement_type_idx ON stock_movements(movement_type);
CREATE INDEX stock_movements_reference_idx ON stock_movements(reference_type, reference_id);
CREATE INDEX stock_movements_created_at_idx ON stock_movements(created_at DESC);

-- ============================================================
-- MATERIALIZED VIEW: stock_on_hand
-- ============================================================
-- Split into two views to handle sign correctly:
-- from_location: negative (stock leaving)
-- to_location: positive (stock arriving)

CREATE MATERIALIZED VIEW stock_on_hand AS
SELECT
  sku_id,
  batch_id,
  location_id,
  SUM(quantity) AS quantity,
  MAX(movement_id) AS last_movement_id
FROM (
  -- Inbound movements (quantity arrives at to_location)
  SELECT
    sku_id,
    batch_id,
    to_location_id   AS location_id,
    quantity,
    id               AS movement_id
  FROM stock_movements
  WHERE to_location_id IS NOT NULL

  UNION ALL

  -- Outbound movements (quantity leaves from_location)
  SELECT
    sku_id,
    batch_id,
    from_location_id AS location_id,
    -quantity,
    id               AS movement_id
  FROM stock_movements
  WHERE from_location_id IS NOT NULL
) ledger
GROUP BY sku_id, batch_id, location_id
HAVING SUM(quantity) > 0
WITH DATA;

CREATE UNIQUE INDEX stock_on_hand_pk ON stock_on_hand(sku_id, COALESCE(batch_id, '00000000-0000-0000-0000-000000000000'::UUID), location_id);
CREATE INDEX stock_on_hand_sku_id_idx ON stock_on_hand(sku_id);
CREATE INDEX stock_on_hand_location_id_idx ON stock_on_hand(location_id);
CREATE INDEX stock_on_hand_batch_id_idx ON stock_on_hand(batch_id);

-- ============================================================
-- PURCHASE ORDERS & GRN
-- ============================================================
CREATE TABLE purchase_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id      UUID NOT NULL REFERENCES suppliers(id),
  site_id          UUID NOT NULL REFERENCES sites(id),
  po_number        VARCHAR(50) NOT NULL UNIQUE,
  status           po_status NOT NULL DEFAULT 'draft',
  expected_date    TIMESTAMPTZ,
  total_value      NUMERIC(14,2),
  notes            TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX po_supplier_id_idx ON purchase_orders(supplier_id);
CREATE INDEX po_site_id_idx ON purchase_orders(site_id);
CREATE INDEX po_status_idx ON purchase_orders(status);

CREATE TABLE po_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id        UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sku_id       UUID NOT NULL REFERENCES skus(id),
  ordered_qty  INTEGER NOT NULL,
  received_qty INTEGER NOT NULL DEFAULT 0,
  unit_cost    NUMERIC(12,2),
  line_number  INTEGER NOT NULL,
  UNIQUE(po_id, line_number)
);

CREATE INDEX po_lines_po_id_idx ON po_lines(po_id);

CREATE TABLE grns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id               UUID REFERENCES purchase_orders(id),
  supplier_invoice_no VARCHAR(100),
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_by         UUID NOT NULL REFERENCES users(id),
  site_id             UUID NOT NULL REFERENCES sites(id),
  status              grn_status NOT NULL DEFAULT 'draft',
  notes               TEXT,
  grn_number          VARCHAR(50) NOT NULL UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX grns_po_id_idx ON grns(po_id);
CREATE INDEX grns_site_id_idx ON grns(site_id);
CREATE INDEX grns_status_idx ON grns(status);

-- Now we can add the FK from batches to grns
ALTER TABLE batches ADD CONSTRAINT batches_grn_id_fk FOREIGN KEY (grn_id) REFERENCES grns(id);

CREATE TABLE grn_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id           UUID NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
  sku_id           UUID NOT NULL REFERENCES skus(id),
  batch_id         UUID REFERENCES batches(id),
  qty_received     INTEGER NOT NULL,
  qty_accepted     INTEGER NOT NULL,
  qty_rejected     INTEGER NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  unit_cost        NUMERIC(12,2),
  line_number      INTEGER NOT NULL,
  UNIQUE(grn_id, line_number)
);

CREATE INDEX grn_lines_grn_id_idx ON grn_lines(grn_id);

-- ============================================================
-- PICK LISTS & PICK LINES
-- ============================================================
CREATE TABLE pick_lists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      UUID NOT NULL REFERENCES sites(id),
  wave_id      UUID,
  status       pick_list_status NOT NULL DEFAULT 'pending',
  assigned_to  UUID REFERENCES users(id),
  channel      pick_channel NOT NULL DEFAULT 'shopify',
  priority     INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX pick_lists_site_id_idx ON pick_lists(site_id);
CREATE INDEX pick_lists_status_idx ON pick_lists(status);
CREATE INDEX pick_lists_assigned_to_idx ON pick_lists(assigned_to);

CREATE TABLE pick_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_list_id UUID NOT NULL REFERENCES pick_lists(id) ON DELETE CASCADE,
  order_ref    VARCHAR(100) NOT NULL,
  sku_id       UUID NOT NULL REFERENCES skus(id),
  batch_id     UUID REFERENCES batches(id),
  location_id  UUID REFERENCES locations(id),
  qty_required INTEGER NOT NULL,
  qty_picked   INTEGER NOT NULL DEFAULT 0,
  picked_at    TIMESTAMPTZ,
  picked_by    UUID REFERENCES users(id),
  line_number  INTEGER NOT NULL,
  sort_sequence INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX pick_lines_pick_list_id_idx ON pick_lines(pick_list_id);
CREATE INDEX pick_lines_sku_id_idx ON pick_lines(sku_id);

-- ============================================================
-- RETURNS
-- ============================================================
CREATE TABLE returns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          return_type NOT NULL,
  order_ref     VARCHAR(100),
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  courier_awb   VARCHAR(100),
  status        return_status NOT NULL DEFAULT 'pending',
  return_number VARCHAR(50) NOT NULL UNIQUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX returns_type_idx ON returns(type);
CREATE INDEX returns_status_idx ON returns(status);
CREATE INDEX returns_order_ref_idx ON returns(order_ref);

CREATE TABLE return_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id    UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  sku_id       UUID NOT NULL REFERENCES skus(id),
  batch_id     UUID REFERENCES batches(id),
  qty          INTEGER NOT NULL,
  qc_grade     qc_grade,
  disposition  disposition,
  inspected_by UUID REFERENCES users(id),
  inspected_at TIMESTAMPTZ,
  notes        TEXT,
  line_number  INTEGER NOT NULL
);

CREATE INDEX return_lines_return_id_idx ON return_lines(return_id);

-- ============================================================
-- CYCLE COUNTS
-- ============================================================
CREATE TABLE cycle_counts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        UUID NOT NULL REFERENCES sites(id),
  location_id    UUID REFERENCES locations(id),
  status         cycle_count_status NOT NULL DEFAULT 'scheduled',
  scheduled_for  TIMESTAMPTZ,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  counted_by     UUID REFERENCES users(id),
  variance_value NUMERIC(14,2),
  approved_by    UUID REFERENCES users(id),
  approved_at    TIMESTAMPTZ,
  count_number   VARCHAR(50) NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cycle_counts_site_id_idx ON cycle_counts(site_id);
CREATE INDEX cycle_counts_status_idx ON cycle_counts(status);

CREATE TABLE cycle_count_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_count_id  UUID NOT NULL REFERENCES cycle_counts(id) ON DELETE CASCADE,
  sku_id          UUID NOT NULL REFERENCES skus(id),
  batch_id        UUID REFERENCES batches(id),
  system_qty      INTEGER NOT NULL DEFAULT 0,
  counted_qty     INTEGER,
  variance        INTEGER GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
  line_number     INTEGER NOT NULL,
  counted_at      TIMESTAMPTZ
);

CREATE INDEX cycle_count_lines_count_id_idx ON cycle_count_lines(cycle_count_id);

-- ============================================================
-- ADJUSTMENTS
-- ============================================================
CREATE TABLE adjustments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id            UUID NOT NULL REFERENCES skus(id),
  batch_id          UUID REFERENCES batches(id),
  location_id       UUID NOT NULL REFERENCES locations(id),
  quantity          INTEGER NOT NULL,
  reason_code       VARCHAR(50) NOT NULL,
  reason_notes      VARCHAR(500),
  status            adjustment_status NOT NULL DEFAULT 'pending',
  requested_by      UUID NOT NULL REFERENCES users(id),
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  rejected_at       TIMESTAMPTZ,
  rejection_reason  VARCHAR(500),
  value_impact      NUMERIC(14,2),
  adjustment_number VARCHAR(50) NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX adjustments_sku_id_idx ON adjustments(sku_id);
CREATE INDEX adjustments_status_idx ON adjustments(status);

-- ============================================================
-- AUDIT LOG & IDEMPOTENCY
-- ============================================================
CREATE TABLE audit_log (
  id         BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    UUID REFERENCES users(id),
  entity     VARCHAR(100) NOT NULL,
  entity_id  VARCHAR(255) NOT NULL,
  action     VARCHAR(50) NOT NULL,
  before     JSONB,
  after      JSONB,
  ip_address VARCHAR(45),
  device_id  VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_log_entity_idx ON audit_log(entity, entity_id);
CREATE INDEX audit_log_user_idx ON audit_log(user_id);
CREATE INDEX audit_log_created_at_idx ON audit_log(created_at DESC);

CREATE TABLE idempotency_keys (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                VARCHAR(255) NOT NULL UNIQUE,
  user_id            UUID REFERENCES users(id),
  request_path       VARCHAR(500) NOT NULL,
  request_body_hash  VARCHAR(64) NOT NULL,
  response_status    VARCHAR(3) NOT NULL,
  response_body      JSONB NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ NOT NULL
);

CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys(expires_at);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_skus_updated_at
  BEFORE UPDATE ON skus
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_grns_updated_at
  BEFORE UPDATE ON grns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_pick_lists_updated_at
  BEFORE UPDATE ON pick_lists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_returns_updated_at
  BEFORE UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_cycle_counts_updated_at
  BEFORE UPDATE ON cycle_counts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_adjustments_updated_at
  BEFORE UPDATE ON adjustments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- AUTO-REFRESH FUNCTION FOR stock_on_hand
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_stock_on_hand()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY stock_on_hand;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMIT;
