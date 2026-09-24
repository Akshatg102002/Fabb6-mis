// ─── Fabb6 WMS — Mock Data ────────────────────────────────────────────────
// Realistic beauty / cosmetics warehouse data for prototype demos.

import type { Vendor } from '@/api/queries/vendors';
import type { Sku } from '@/api/queries/skus';
import type { PurchaseOrder, POLine } from '@/api/queries/pos';
import type { GRN, GRNLine } from '@/api/queries/grn';
import type { StockOnHandItem, StockMovement, ExpiryDashboardRow } from '@/api/queries/stock';
import type { Location, StockItem } from '@/api/queries/inventory';
import type { PickList, PickLine } from '@/api/queries/picking';
import type { PackOrder, PackItem } from '@/api/queries/packing';
import type { PutawayTask } from '@/api/queries/putaway';
import type { ReturnInward, ReturnLine } from '@/api/queries/returns';
import type { CycleCount, CycleCountLine } from '@/api/queries/counting';

// ── Vendors ───────────────────────────────────────────────────────────────

export const VENDORS: Vendor[] = [
  { id: 'v-001', vendor_code: 'LOT-IN', name: "L'Oréal India Pvt Ltd", gstin: '27AABCL1234A1ZK', city: 'Mumbai', email: 'trade@loreal.in', is_active: true },
  { id: 'v-002', vendor_code: 'HUL-MH', name: 'Hindustan Unilever Ltd', gstin: '27AAACH1234A1ZP', city: 'Mumbai', email: 'b2b@hul.in', is_active: true },
  { id: 'v-003', vendor_code: 'MAY-DL', name: 'Maybelline New York India', gstin: '07AABCM5678A1ZR', city: 'Delhi', email: 'orders@maybelline.in', is_active: true },
  { id: 'v-004', vendor_code: 'VLCC-HR', name: 'VLCC Personal Care Ltd', gstin: '06AABCV9012A1ZS', city: 'Gurugram', email: 'supply@vlcc.net', is_active: true },
  { id: 'v-005', vendor_code: 'BIOTQ', name: 'Biotique Natural Products', gstin: '07AABCB3456A1ZT', city: 'Delhi', email: 'trade@biotique.com', is_active: false },
];

// ── SKUs ──────────────────────────────────────────────────────────────────

export const SKUS: Sku[] = [
  { id: 'sku-001', code: 'LOR-SERUM-30', name: "L'Oréal Revitalift 1.5% Pure Hyaluronic Acid Serum 30ml", description: 'Anti-ageing serum with hyaluronic acid', barcode: '3600523541792', uom: 'PCS', weight: 0.08, volume: 0.03, category: 'Skincare', isActive: true, createdAt: '2025-01-10T06:00:00Z', updatedAt: '2025-09-01T10:00:00Z' },
  { id: 'sku-002', code: 'MAY-FITME-220', name: 'Maybelline Fit Me Matte+Poreless Foundation 220', description: 'Liquid foundation 30ml', barcode: '3600531213459', uom: 'PCS', weight: 0.09, volume: 0.03, category: 'Foundation', isActive: true, createdAt: '2025-02-05T06:00:00Z', updatedAt: '2025-09-01T10:00:00Z' },
  { id: 'sku-003', code: 'HUL-DOVE-SHAMP-400', name: 'Dove Intense Repair Shampoo 400ml', description: 'Nourishing shampoo for damaged hair', barcode: '8901030783456', uom: 'PCS', weight: 0.45, volume: 0.4, category: 'Haircare', isActive: true, createdAt: '2025-01-15T06:00:00Z', updatedAt: '2025-09-01T10:00:00Z' },
  { id: 'sku-004', code: 'LOR-COLORISTA-BLK', name: "L'Oréal Colorista Washout Hair Colour Black", description: 'Temporary hair colour sachet', barcode: '3600523612342', uom: 'PCS', weight: 0.05, volume: 0.02, category: 'Hair Colour', isActive: true, createdAt: '2025-03-20T06:00:00Z', updatedAt: '2025-09-01T10:00:00Z' },
  { id: 'sku-005', code: 'VLCC-SUNSCR-50', name: 'VLCC Matte Look Daily Sunscreen SPF 50', description: 'Lightweight sunscreen lotion 100g', barcode: '8906049000123', uom: 'PCS', weight: 0.12, volume: 0.1, category: 'Skincare', isActive: true, createdAt: '2025-04-01T06:00:00Z', updatedAt: '2025-09-01T10:00:00Z' },
  { id: 'sku-006', code: 'MAY-COLOSSAL-BLK', name: 'Maybelline Colossal Kajal Super Black 0.35g', description: 'Long-lasting kajal', barcode: '3600531987654', uom: 'PCS', weight: 0.02, volume: 0.01, category: 'Eye Makeup', isActive: true, createdAt: '2025-02-10T06:00:00Z', updatedAt: '2025-09-01T10:00:00Z' },
  { id: 'sku-007', code: 'HUL-LUX-ROSE-100', name: 'Lux Soft Touch Rose & Vitamin E Soap 100g', description: 'Moisturising bath soap', barcode: '8901030456789', uom: 'PCS', weight: 0.11, volume: null, category: 'Bath & Body', isActive: true, createdAt: '2025-01-20T06:00:00Z', updatedAt: '2025-09-01T10:00:00Z' },
  { id: 'sku-008', code: 'LOR-ELNETT-250', name: "L'Oréal Elnett Satin Extra Strong Hold Hair Spray 250ml", description: 'Professional hair spray', barcode: '3600523456781', uom: 'PCS', weight: 0.22, volume: 0.25, category: 'Hair Styling', isActive: true, createdAt: '2025-05-12T06:00:00Z', updatedAt: '2025-09-01T10:00:00Z' },
  { id: 'sku-009', code: 'VLCC-FACEWASH-150', name: 'VLCC Neem Face Wash 150ml', description: 'Anti-bacterial neem face wash', barcode: '8906049000456', uom: 'PCS', weight: 0.17, volume: 0.15, category: 'Skincare', isActive: true, createdAt: '2025-03-05T06:00:00Z', updatedAt: '2025-09-01T10:00:00Z' },
  { id: 'sku-010', code: 'MAY-SUPERSTAY-RED', name: 'Maybelline SuperStay 24H Lip Colour Red Passion 510', description: 'Long-lasting liquid lipstick', barcode: '3600531112233', uom: 'PCS', weight: 0.03, volume: 0.01, category: 'Lip Makeup', isActive: true, createdAt: '2025-06-01T06:00:00Z', updatedAt: '2025-09-01T10:00:00Z' },
];

// ── Locations ─────────────────────────────────────────────────────────────

export const LOCATIONS: Location[] = [
  { id: 'loc-A01-01', code: 'A-01-01', zone: 'A', aisle: '01', rack: '01', level: '01', capacity: 200, currentLoad: 142 },
  { id: 'loc-A01-02', code: 'A-01-02', zone: 'A', aisle: '01', rack: '01', level: '02', capacity: 200, currentLoad: 88 },
  { id: 'loc-A02-01', code: 'A-02-01', zone: 'A', aisle: '02', rack: '01', level: '01', capacity: 200, currentLoad: 200 },
  { id: 'loc-B01-01', code: 'B-01-01', zone: 'B', aisle: '01', rack: '01', level: '01', capacity: 300, currentLoad: 176 },
  { id: 'loc-B01-02', code: 'B-01-02', zone: 'B', aisle: '01', rack: '01', level: '02', capacity: 300, currentLoad: 54 },
  { id: 'loc-B02-01', code: 'B-02-01', zone: 'B', aisle: '02', rack: '01', level: '01', capacity: 300, currentLoad: 230 },
  { id: 'loc-REC-01', code: 'REC-01', zone: 'INWARD', aisle: '00', rack: '01', level: '01', capacity: 500, currentLoad: 0 },
  { id: 'loc-QC-01', code: 'QC-01', zone: 'QC', aisle: '00', rack: '01', level: '01', capacity: 100, currentLoad: 12 },
];

// ── Stock on Hand ─────────────────────────────────────────────────────────

export const STOCK_ON_HAND: StockOnHandItem[] = [
  { id: 'soh-001', skuCode: 'LOR-SERUM-30', skuName: "L'Oréal Revitalift Hyaluronic Serum 30ml", batch: 'B2024091', locationCode: 'A-01-01', locationId: 'loc-A01-01', qty: 142, uom: 'PCS', expiryDate: '2026-09-30', costPrice: 485, value: 68870, siteId: 'site-001' },
  { id: 'soh-002', skuCode: 'MAY-FITME-220', skuName: 'Maybelline Fit Me Foundation 220', batch: 'B2024083', locationCode: 'A-01-02', locationId: 'loc-A01-02', qty: 88, uom: 'PCS', expiryDate: '2027-03-31', costPrice: 310, value: 27280, siteId: 'site-001' },
  { id: 'soh-003', skuCode: 'HUL-DOVE-SHAMP-400', skuName: 'Dove Intense Repair Shampoo 400ml', batch: 'B2024074', locationCode: 'B-01-01', locationId: 'loc-B01-01', qty: 176, uom: 'PCS', expiryDate: '2026-07-31', costPrice: 195, value: 34320, siteId: 'site-001' },
  { id: 'soh-004', skuCode: 'LOR-COLORISTA-BLK', skuName: "L'Oréal Colorista Washout Black", batch: 'B2024092', locationCode: 'A-02-01', locationId: 'loc-A02-01', qty: 200, uom: 'PCS', expiryDate: '2025-12-31', costPrice: 220, value: 44000, siteId: 'site-001' },
  { id: 'soh-005', skuCode: 'VLCC-SUNSCR-50', skuName: 'VLCC Matte Look Sunscreen SPF50', batch: 'B2024081', locationCode: 'B-01-02', locationId: 'loc-B01-02', qty: 54, uom: 'PCS', expiryDate: '2026-08-31', costPrice: 162, value: 8748, siteId: 'site-001' },
  { id: 'soh-006', skuCode: 'MAY-COLOSSAL-BLK', skuName: 'Maybelline Colossal Kajal Super Black', batch: 'B2024093', locationCode: 'B-02-01', locationId: 'loc-B02-01', qty: 230, uom: 'PCS', expiryDate: '2027-09-30', costPrice: 98, value: 22540, siteId: 'site-001' },
  { id: 'soh-007', skuCode: 'HUL-LUX-ROSE-100', skuName: 'Lux Soft Touch Rose Soap 100g', batch: 'B2024076', locationCode: 'B-01-01', locationId: 'loc-B01-01', qty: 7, uom: 'PCS', expiryDate: '2026-07-31', costPrice: 42, value: 294, siteId: 'site-001' },
  { id: 'soh-008', skuCode: 'LOR-ELNETT-250', skuName: "L'Oréal Elnett Extra Strong Hair Spray 250ml", batch: 'B2024085', locationCode: 'A-01-01', locationId: 'loc-A01-01', qty: 65, uom: 'PCS', expiryDate: '2027-05-31', costPrice: 375, value: 24375, siteId: 'site-001' },
  { id: 'soh-009', skuCode: 'VLCC-FACEWASH-150', skuName: 'VLCC Neem Face Wash 150ml', batch: 'B2024088', locationCode: 'A-01-02', locationId: 'loc-A01-02', qty: 4, uom: 'PCS', expiryDate: '2026-09-15', costPrice: 118, value: 472, siteId: 'site-001' },
  { id: 'soh-010', skuCode: 'MAY-SUPERSTAY-RED', skuName: 'Maybelline SuperStay 24H Lip Colour Red 510', batch: 'B2024089', locationCode: 'B-02-01', locationId: 'loc-B02-01', qty: 112, uom: 'PCS', expiryDate: '2028-06-30', costPrice: 268, value: 30016, siteId: 'site-001' },
];

// ── Stock Movements ───────────────────────────────────────────────────────

const now = new Date();
const hrsAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();

export const STOCK_MOVEMENTS: StockMovement[] = [
  { id: 'mv-001', skuCode: 'LOR-SERUM-30', skuName: "L'Oréal Revitalift Serum 30ml", fromLocationCode: null, toLocationCode: 'A-01-01', qty: 50, movementType: 'inward', reference: 'GRN-2024-0041', createdAt: hrsAgo(2), createdBy: 'Parag' },
  { id: 'mv-002', skuCode: 'MAY-FITME-220', skuName: 'Maybelline Fit Me Foundation 220', fromLocationCode: 'A-01-02', toLocationCode: null, qty: 12, movementType: 'pick', reference: 'PL-2024-0078', createdAt: hrsAgo(3), createdBy: 'Ravi' },
  { id: 'mv-003', skuCode: 'HUL-DOVE-SHAMP-400', skuName: 'Dove Intense Repair Shampoo 400ml', fromLocationCode: null, toLocationCode: 'B-01-01', qty: 100, movementType: 'putaway', reference: 'GRN-2024-0040', createdAt: hrsAgo(5), createdBy: 'Suresh' },
  { id: 'mv-004', skuCode: 'VLCC-SUNSCR-50', skuName: 'VLCC Matte Look Sunscreen SPF50', fromLocationCode: 'B-01-02', toLocationCode: null, qty: 6, movementType: 'pick', reference: 'PL-2024-0077', createdAt: hrsAgo(6), createdBy: 'Ravi' },
  { id: 'mv-005', skuCode: 'LOR-COLORISTA-BLK', skuName: "L'Oréal Colorista Black", fromLocationCode: null, toLocationCode: 'A-02-01', qty: 200, movementType: 'inward', reference: 'GRN-2024-0039', createdAt: hrsAgo(24), createdBy: 'Parag' },
  { id: 'mv-006', skuCode: 'HUL-LUX-ROSE-100', skuName: 'Lux Soft Touch Rose Soap', fromLocationCode: 'B-01-01', toLocationCode: null, qty: 3, movementType: 'adjustment', reference: 'ADJ-2024-0012', createdAt: hrsAgo(30), createdBy: 'Parag' },
];

// ── Expiry Dashboard ──────────────────────────────────────────────────────

export const EXPIRY_ROWS: ExpiryDashboardRow[] = [
  { skuCode: 'LOR-COLORISTA-BLK', skuName: "L'Oréal Colorista Washout Black", batch: 'B2024092', expiryDate: '2025-12-31', daysRemaining: 98, qty: 200, locationCode: 'A-02-01' },
  { skuCode: 'VLCC-FACEWASH-150', skuName: 'VLCC Neem Face Wash 150ml', batch: 'B2024088', expiryDate: '2026-09-15', daysRemaining: 356, qty: 4, locationCode: 'A-01-02' },
  { skuCode: 'LOR-SERUM-30', skuName: "L'Oréal Revitalift Serum 30ml", batch: 'B2024091', expiryDate: '2026-09-30', daysRemaining: 371, qty: 142, locationCode: 'A-01-01' },
  { skuCode: 'HUL-DOVE-SHAMP-400', skuName: 'Dove Intense Repair Shampoo 400ml', batch: 'B2024074', expiryDate: '2026-07-31', daysRemaining: 310, qty: 176, locationCode: 'B-01-01' },
  { skuCode: 'VLCC-SUNSCR-50', skuName: 'VLCC Matte Look Sunscreen SPF50', batch: 'B2024081', expiryDate: '2026-08-31', daysRemaining: 341, qty: 54, locationCode: 'B-01-02' },
];

// ── Purchase Orders ───────────────────────────────────────────────────────

export const PO_LINES: POLine[] = [
  { id: 'pol-001', po_id: 'po-001', sku_id: 'sku-001', ordered_qty: 200, received_qty: 142, unit_cost: '485', line_number: 1 },
  { id: 'pol-002', po_id: 'po-001', sku_id: 'sku-003', ordered_qty: 300, received_qty: 176, unit_cost: '195', line_number: 2 },
  { id: 'pol-003', po_id: 'po-002', sku_id: 'sku-002', ordered_qty: 150, received_qty: 0, unit_cost: '310', line_number: 1 },
  { id: 'pol-004', po_id: 'po-002', sku_id: 'sku-006', ordered_qty: 400, received_qty: 0, unit_cost: '98', line_number: 2 },
  { id: 'pol-005', po_id: 'po-003', sku_id: 'sku-004', ordered_qty: 200, received_qty: 200, unit_cost: '220', line_number: 1 },
];

export const PURCHASE_ORDERS: PurchaseOrder[] = [
  { id: 'po-001', supplier_id: 'v-001', site_id: 'site-001', po_number: 'PO-2024-0041', status: 'partial', expected_date: '2024-09-20', total_value: '149600', notes: 'Urgent — festival season stock', created_by: 'Parag', created_at: '2024-09-10T09:00:00Z', updated_at: '2024-09-20T14:00:00Z', lines: PO_LINES.filter(l => l.po_id === 'po-001') },
  { id: 'po-002', supplier_id: 'v-003', site_id: 'site-001', po_number: 'PO-2024-0042', status: 'confirmed', expected_date: '2024-09-28', total_value: '85700', notes: null, created_by: 'Parag', created_at: '2024-09-15T11:00:00Z', updated_at: '2024-09-15T11:00:00Z', lines: PO_LINES.filter(l => l.po_id === 'po-002') },
  { id: 'po-003', supplier_id: 'v-001', site_id: 'site-001', po_number: 'PO-2024-0039', status: 'received', expected_date: '2024-09-05', total_value: '44000', notes: 'Received and posted', created_by: 'Parag', created_at: '2024-09-01T08:00:00Z', updated_at: '2024-09-06T10:00:00Z', lines: PO_LINES.filter(l => l.po_id === 'po-003') },
];

// ── GRNs ──────────────────────────────────────────────────────────────────

const GRN_LINES: GRNLine[] = [
  { id: 'gl-001', grnId: 'grn-001', sku: 'LOR-SERUM-30', skuName: "L'Oréal Revitalift Serum 30ml", barcode: '3600523541792', expectedQty: 200, receivedQty: 142, uom: 'PCS', status: 'partial' },
  { id: 'gl-002', grnId: 'grn-001', sku: 'HUL-DOVE-SHAMP-400', skuName: 'Dove Intense Repair Shampoo 400ml', barcode: '8901030783456', expectedQty: 300, receivedQty: 176, uom: 'PCS', status: 'partial' },
  { id: 'gl-003', grnId: 'grn-002', sku: 'LOR-COLORISTA-BLK', skuName: "L'Oréal Colorista Black", barcode: '3600523612342', expectedQty: 200, receivedQty: 200, uom: 'PCS', status: 'complete' },
];

export const GRNS: GRN[] = [
  { id: 'grn-001', reference: 'GRN-2024-0041', supplierId: 'v-001', supplierName: "L'Oréal India Pvt Ltd", status: 'partial', createdAt: '2024-09-18T09:00:00Z', expectedAt: '2024-09-20T00:00:00Z', receivedAt: '2024-09-20T14:00:00Z', lineCount: 2, lines: GRN_LINES.filter(l => l.grnId === 'grn-001') },
  { id: 'grn-002', reference: 'GRN-2024-0039', supplierId: 'v-001', supplierName: "L'Oréal India Pvt Ltd", status: 'complete', createdAt: '2024-09-04T08:00:00Z', expectedAt: '2024-09-05T00:00:00Z', receivedAt: '2024-09-05T16:00:00Z', lineCount: 1, lines: GRN_LINES.filter(l => l.grnId === 'grn-002') },
];

// ── Picking ───────────────────────────────────────────────────────────────

const PICK_LINES: PickLine[] = [
  { id: 'pkl-001', pickListId: 'pl-001', sku: 'MAY-FITME-220', skuName: 'Maybelline Fit Me Foundation 220', barcode: '3600531213459', locationId: 'loc-A01-02', locationCode: 'A-01-02', requiredQty: 12, pickedQty: 12, uom: 'PCS', sortOrder: 1, status: 'picked' },
  { id: 'pkl-002', pickListId: 'pl-001', sku: 'VLCC-SUNSCR-50', skuName: 'VLCC Matte Look Sunscreen SPF50', barcode: '8906049000123', locationId: 'loc-B01-02', locationCode: 'B-01-02', requiredQty: 6, pickedQty: 0, uom: 'PCS', sortOrder: 2, status: 'pending' },
  { id: 'pkl-003', pickListId: 'pl-002', sku: 'MAY-COLOSSAL-BLK', skuName: 'Maybelline Colossal Kajal Black', barcode: '3600531987654', locationId: 'loc-B02-01', locationCode: 'B-02-01', requiredQty: 24, pickedQty: 0, uom: 'PCS', sortOrder: 1, status: 'pending' },
  { id: 'pkl-004', pickListId: 'pl-002', sku: 'MAY-SUPERSTAY-RED', skuName: 'Maybelline SuperStay Lip Colour Red 510', barcode: '3600531112233', locationId: 'loc-B02-01', locationCode: 'B-02-01', requiredQty: 8, pickedQty: 0, uom: 'PCS', sortOrder: 2, status: 'pending' },
];

export const PICK_LISTS: PickList[] = [
  { id: 'pl-001', reference: 'PL-2024-0078', orderId: 'ord-0078', orderRef: 'ORD-78342', assignedTo: 'usr-002', status: 'in_progress', createdAt: hrsAgo(4), dueAt: new Date(now.getTime() + 2 * 3600000).toISOString(), lines: PICK_LINES.filter(l => l.pickListId === 'pl-001') },
  { id: 'pl-002', reference: 'PL-2024-0079', orderId: 'ord-0079', orderRef: 'ORD-78343', assignedTo: 'usr-002', status: 'assigned', createdAt: hrsAgo(1), dueAt: new Date(now.getTime() + 5 * 3600000).toISOString(), lines: PICK_LINES.filter(l => l.pickListId === 'pl-002') },
];

// ── Packing ───────────────────────────────────────────────────────────────

const PACK_ITEMS: PackItem[] = [
  { id: 'pi-001', orderId: 'pack-001', sku: 'LOR-SERUM-30', skuName: "L'Oréal Revitalift Serum 30ml", barcode: '3600523541792', qty: 2, uom: 'PCS', packedQty: 2, status: 'packed' },
  { id: 'pi-002', orderId: 'pack-001', sku: 'VLCC-FACEWASH-150', skuName: 'VLCC Neem Face Wash 150ml', barcode: '8906049000456', qty: 1, uom: 'PCS', packedQty: 0, status: 'pending' },
  { id: 'pi-003', orderId: 'pack-002', sku: 'MAY-COLOSSAL-BLK', skuName: 'Maybelline Colossal Kajal Black', barcode: '3600531987654', qty: 3, uom: 'PCS', packedQty: 0, status: 'pending' },
];

export const PACK_ORDERS: PackOrder[] = [
  { id: 'pack-001', orderRef: 'ORD-78340', customerId: 'cust-001', customerName: 'Glamour Studio, Andheri', status: 'in_progress', priority: 'urgent', dueAt: new Date(now.getTime() + 3600000).toISOString(), assignedTo: 'usr-003', items: PACK_ITEMS.filter(i => i.orderId === 'pack-001'), cartonId: 'CTN-9981', shippingLabel: null },
  { id: 'pack-002', orderRef: 'ORD-78341', customerId: 'cust-002', customerName: 'Nisha Beauty Salon, Bandra', status: 'waiting', priority: 'normal', dueAt: new Date(now.getTime() + 5 * 3600000).toISOString(), assignedTo: null, items: PACK_ITEMS.filter(i => i.orderId === 'pack-002'), cartonId: null, shippingLabel: null },
];

// ── Putaway ───────────────────────────────────────────────────────────────

export const PUTAWAY_TASKS: PutawayTask[] = [
  { id: 'put-001', grnId: 'grn-001', grnReference: 'GRN-2024-0041', sku: 'LOR-SERUM-30', skuName: "L'Oréal Revitalift Serum 30ml", barcode: '3600523541792', quantity: 58, uom: 'PCS', suggestedLocationId: 'loc-A01-01', suggestedLocationCode: 'A-01-01', assignedTo: null, status: 'pending', createdAt: hrsAgo(1) },
];

// ── Returns ───────────────────────────────────────────────────────────────

const RETURN_LINES: ReturnLine[] = [
  { id: 'rl-001', returnId: 'ret-001', sku: 'MAY-FITME-220', skuName: 'Maybelline Fit Me Foundation 220', barcode: '3600531213459', expectedQty: 2, receivedQty: 0, reason: 'damaged', condition: null, dispositionLocationId: null, status: 'pending' },
];

export const RETURNS: ReturnInward[] = [
  { id: 'ret-001', reference: 'RET-2024-0021', orderId: 'ord-0065', orderRef: 'ORD-78310', customerId: 'cust-003', customerName: 'Priya Makeover Studio, Pune', status: 'awaiting', receivedAt: null, lines: RETURN_LINES },
];

// ── Cycle Counts ──────────────────────────────────────────────────────────

const COUNT_LINES: CycleCountLine[] = [
  { id: 'ccl-001', countId: 'cc-001', locationId: 'loc-A01-01', locationCode: 'A-01-01', sku: 'LOR-SERUM-30', skuName: "L'Oréal Revitalift Serum 30ml", barcode: '3600523541792', expectedQty: 142, countedQty: null, variance: null, status: 'pending' },
  { id: 'ccl-002', countId: 'cc-001', locationId: 'loc-A01-01', locationCode: 'A-01-01', sku: 'LOR-ELNETT-250', skuName: "L'Oréal Elnett Hair Spray 250ml", barcode: '3600523456781', expectedQty: 65, countedQty: null, variance: null, status: 'pending' },
];

export const CYCLE_COUNTS: CycleCount[] = [
  { id: 'cc-001', reference: 'CC-2024-0008', zone: 'A', status: 'scheduled', scheduledAt: new Date(now.getTime() + 24 * 3600000).toISOString(), completedAt: null, assignedTo: null, lines: COUNT_LINES },
];

// ── Dashboard Stats ───────────────────────────────────────────────────────

export const DASHBOARD_STATS = {
  totalSkus: SKUS.filter(s => s.isActive).length,
  stockValue: STOCK_ON_HAND.reduce((sum, s) => sum + (s.value ?? 0), 0),
  lowStockAlerts: STOCK_ON_HAND.filter(s => s.qty > 0 && s.qty < 10).length,
  todayMovements: STOCK_MOVEMENTS.filter(m => new Date(m.createdAt) > new Date(now.setHours(0, 0, 0, 0))).length,
  top10Skus: [
    { skuCode: 'LOR-SERUM-30', skuName: "L'Oréal Revitalift Serum 30ml", qty: 142, value: 68870 },
    { skuCode: 'HUL-DOVE-SHAMP-400', skuName: 'Dove Intense Repair Shampoo 400ml', qty: 176, value: 34320 },
    { skuCode: 'LOR-COLORISTA-BLK', skuName: "L'Oréal Colorista Washout Black", qty: 200, value: 44000 },
    { skuCode: 'MAY-SUPERSTAY-RED', skuName: 'Maybelline SuperStay Lip Colour Red 510', qty: 112, value: 30016 },
    { skuCode: 'MAY-COLOSSAL-BLK', skuName: 'Maybelline Colossal Kajal Black', qty: 230, value: 22540 },
    { skuCode: 'LOR-ELNETT-250', skuName: "L'Oréal Elnett Hair Spray 250ml", qty: 65, value: 24375 },
    { skuCode: 'MAY-FITME-220', skuName: 'Maybelline Fit Me Foundation 220', qty: 88, value: 27280 },
    { skuCode: 'VLCC-SUNSCR-50', skuName: 'VLCC Matte Look Sunscreen SPF50', qty: 54, value: 8748 },
    { skuCode: 'VLCC-FACEWASH-150', skuName: 'VLCC Neem Face Wash 150ml', qty: 4, value: 472 },
    { skuCode: 'HUL-LUX-ROSE-100', skuName: 'Lux Soft Touch Rose Soap 100g', qty: 7, value: 294 },
  ],
  brandStock: [
    { brand: "L'Oréal", qty: 407, skuCount: 3, totalValue: 137245 },
    { brand: 'Maybelline', qty: 430, skuCount: 3, totalValue: 79836 },
    { brand: 'HUL', qty: 183, skuCount: 2, totalValue: 34614 },
    { brand: 'VLCC', qty: 58, skuCount: 2, totalValue: 9220 },
  ],
  recentActivity: STOCK_MOVEMENTS.map(m => ({
    id: m.id,
    movementType: m.movementType,
    quantity: m.qty,
    createdAt: m.createdAt,
    skuCode: m.skuCode,
    skuName: m.skuName,
    fromLoc: m.fromLocationCode,
    toLoc: m.toLocationCode,
    userName: m.createdBy,
  })),
};

// ── Inventory-style stock items (used by inventory.ts queries) ─────────────

export const INVENTORY_STOCK_ITEMS: StockItem[] = STOCK_ON_HAND.map(s => ({
  id: s.id,
  sku: s.skuCode,
  name: s.skuName,
  barcode: SKUS.find(sk => sk.code === s.skuCode)?.barcode ?? '',
  locationId: s.locationId,
  locationCode: s.locationCode,
  quantity: s.qty,
  unitOfMeasure: s.uom,
  lastCountedAt: null,
  expiryDate: s.expiryDate,
}));
