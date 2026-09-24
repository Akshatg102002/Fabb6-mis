// ─── Fabb6 WMS — MSW Handlers ────────────────────────────────────────────
// Intercepts every /api/v1/* call and returns mock data.
// Mutations (POST/PATCH/DELETE) return 200 with the relevant entity so
// TanStack Query invalidations don't break.

import { http, HttpResponse, delay } from 'msw';
import {
  VENDORS,
  SKUS,
  LOCATIONS,
  STOCK_ON_HAND,
  INVENTORY_STOCK_ITEMS,
  STOCK_MOVEMENTS,
  EXPIRY_ROWS,
  PURCHASE_ORDERS,
  GRNS,
  PICK_LISTS,
  PACK_ORDERS,
  PUTAWAY_TASKS,
  RETURNS,
  CYCLE_COUNTS,
  DASHBOARD_STATS,
} from './data';

const BASE = '/api/v1';
const FAKE_DELAY = 300; // ms — feels realistic without being slow

// ── Helpers ────────────────────────────────────────────────────────────────

function paginate<T>(items: T[], page = 1, pageSize = 20) {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  };
}

function searchParam(url: URL, key: string) {
  return url.searchParams.get(key) ?? undefined;
}

function numParam(url: URL, key: string, fallback: number) {
  const v = url.searchParams.get(key);
  return v ? parseInt(v, 10) : fallback;
}

// ── Auth ───────────────────────────────────────────────────────────────────

export const handlers = [
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const body = await request.json() as { username?: string; password?: string };
    // Accept any login for prototype
    return HttpResponse.json({
      token: 'mock-jwt-token-fabb6',
      user: {
        id: 'usr-001',
        name: body.username ?? 'Parag',
        role: 'admin',
        siteId: 'site-001',
      },
    });
  }),

  http.post(`${BASE}/auth/logout`, async () => {
    await delay(100);
    return new HttpResponse(null, { status: 204 });
  }),

  // ── Dashboard ──────────────────────────────────────────────────────────

  http.get(`${BASE}/dashboard/stats`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json(DASHBOARD_STATS);
  }),

  // ── Vendors ────────────────────────────────────────────────────────────

  http.get(`${BASE}/vendors`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const url = new URL(request.url);
    const search = searchParam(url, 'search')?.toLowerCase();
    const filtered = search
      ? VENDORS.filter(v => v.name.toLowerCase().includes(search))
      : VENDORS;
    return HttpResponse.json({ data: filtered, total: filtered.length });
  }),

  http.get(`${BASE}/vendors/:id`, async ({ params }) => {
    await delay(FAKE_DELAY);
    const vendor = VENDORS.find(v => v.id === params.id);
    if (!vendor) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(vendor);
  }),

  // ── SKUs ───────────────────────────────────────────────────────────────

  http.get(`${BASE}/skus`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const url = new URL(request.url);
    const search = searchParam(url, 'search')?.toLowerCase();
    const category = searchParam(url, 'category');
    const isActive = searchParam(url, 'isActive');
    const page = numParam(url, 'page', 1);
    const pageSize = numParam(url, 'pageSize', 20);

    let filtered = [...SKUS];
    if (search) filtered = filtered.filter(s => s.name.toLowerCase().includes(search) || s.code.toLowerCase().includes(search));
    if (category) filtered = filtered.filter(s => s.category === category);
    if (isActive !== undefined) filtered = filtered.filter(s => String(s.isActive) === isActive);

    return HttpResponse.json(paginate(filtered, page, pageSize));
  }),

  http.get(`${BASE}/skus/:id`, async ({ params }) => {
    await delay(FAKE_DELAY);
    const sku = SKUS.find(s => s.id === params.id);
    if (!sku) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(sku);
  }),

  http.post(`${BASE}/skus`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const body = await request.json() as Record<string, unknown>;
    const newSku = { id: `sku-${Date.now()}`, isActive: true, weight: null, volume: null, description: null, category: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...body };
    return HttpResponse.json(newSku, { status: 201 });
  }),

  http.get(`${BASE}/gtins/lookup`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const url = new URL(request.url);
    const barcode = url.searchParams.get('barcode') ?? '';
    const sku = SKUS.find(s => s.barcode === barcode);
    return HttpResponse.json({
      barcode,
      skuId: sku?.id ?? null,
      skuCode: sku?.code ?? null,
      skuName: sku?.name ?? null,
      found: !!sku,
    });
  }),

  // ── Locations ──────────────────────────────────────────────────────────

  http.get(`${BASE}/locations/sites`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json([{ id: 'site-001', name: 'Fabb6 Warehouse — Navi Mumbai', code: 'NM-WH-01' }]);
  }),

  http.get(`${BASE}/locations`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ data: LOCATIONS, meta: { page: 1, limit: 50, total: LOCATIONS.length, pages: 1 } });
  }),

  http.get(`${BASE}/locations/:id`, async ({ params }) => {
    await delay(FAKE_DELAY);
    const loc = LOCATIONS.find(l => l.id === params.id);
    if (!loc) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(loc);
  }),

  // ── Purchase Orders ────────────────────────────────────────────────────

  http.get(`${BASE}/purchase-orders`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const url = new URL(request.url);
    const status = searchParam(url, 'status');
    const page = numParam(url, 'page', 1);
    const limit = numParam(url, 'limit', 50);

    const filtered = status ? PURCHASE_ORDERS.filter(p => p.status === status) : PURCHASE_ORDERS;
    const start = (page - 1) * limit;
    return HttpResponse.json({
      data: filtered.slice(start, start + limit),
      meta: { page, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) },
    });
  }),

  http.get(`${BASE}/purchase-orders/:id`, async ({ params }) => {
    await delay(FAKE_DELAY);
    const po = PURCHASE_ORDERS.find(p => p.id === params.id);
    if (!po) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(po);
  }),

  http.post(`${BASE}/purchase-orders`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ id: `po-${Date.now()}`, status: 'draft', site_id: 'site-001', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body }, { status: 201 });
  }),

  // ── GRN ────────────────────────────────────────────────────────────────

  http.get(`${BASE}/grn`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const url = new URL(request.url);
    const status = searchParam(url, 'status');
    const filtered = status ? GRNS.filter(g => g.status === status || (status === 'open' && g.status === 'in_progress')) : GRNS;
    return HttpResponse.json(filtered);
  }),

  http.get(`${BASE}/grn/:id`, async ({ params }) => {
    await delay(FAKE_DELAY);
    const grn = GRNS.find(g => g.id === params.id);
    if (!grn) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(grn);
  }),

  http.get(`${BASE}/grns`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json(GRNS);
  }),

  http.post(`${BASE}/grns/:id/lines`, async ({ params }) => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ grnId: params.id, message: 'Line added' });
  }),

  http.post(`${BASE}/grns/:id/complete`, async ({ params }) => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ grnId: params.id, status: 'complete' });
  }),

  http.post(`${BASE}/grn/receive`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ message: 'Item received' });
  }),

  // ── Stock ──────────────────────────────────────────────────────────────

  http.get(`${BASE}/stock/on-hand`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const url = new URL(request.url);
    const search = searchParam(url, 'skuSearch')?.toLowerCase();
    const expBucket = searchParam(url, 'expiryBucket');
    const page = numParam(url, 'page', 1);
    const pageSize = numParam(url, 'pageSize', 20);

    let filtered = [...STOCK_ON_HAND];
    if (search) filtered = filtered.filter(s => s.skuCode.toLowerCase().includes(search) || s.skuName.toLowerCase().includes(search));
    if (expBucket === 'expired') filtered = filtered.filter(s => s.expiryDate && new Date(s.expiryDate) < new Date());
    if (expBucket === 'lt30') filtered = filtered.filter(s => { if (!s.expiryDate) return false; const days = (new Date(s.expiryDate).getTime() - Date.now()) / 86400000; return days >= 0 && days < 30; });
    if (expBucket === 'lt60') filtered = filtered.filter(s => { if (!s.expiryDate) return false; const days = (new Date(s.expiryDate).getTime() - Date.now()) / 86400000; return days >= 0 && days < 60; });

    return HttpResponse.json(paginate(filtered, page, pageSize));
  }),

  http.get(`${BASE}/stock/expiry`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json(EXPIRY_ROWS);
  }),

  http.get(`${BASE}/stock/movements`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const url = new URL(request.url);
    const page = numParam(url, 'page', 1);
    const pageSize = numParam(url, 'pageSize', 20);
    const typeFilter = searchParam(url, 'movementType');
    let filtered = typeFilter ? STOCK_MOVEMENTS.filter(m => m.movementType === typeFilter) : STOCK_MOVEMENTS;
    const result = paginate(filtered, page, pageSize);
    return HttpResponse.json({ data: result.items, meta: { page: result.page, limit: result.pageSize, total: result.total, pages: Math.ceil(result.total / result.pageSize) } });
  }),

  http.get(`${BASE}/stock/valuation`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json(STOCK_ON_HAND.map(s => ({ ...s, costPrice: s.costPrice ?? 0, value: s.value ?? 0 })));
  }),

  // ── Inventory (inventory.ts query hooks) ──────────────────────────────

  http.get(`${BASE}/inventory/stock`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const url = new URL(request.url);
    const search = searchParam(url, 'sku')?.toLowerCase();
    const lowStock = url.searchParams.get('lowStock') === 'true';
    const page = numParam(url, 'page', 1);
    const pageSize = numParam(url, 'pageSize', 20);

    let filtered = [...INVENTORY_STOCK_ITEMS];
    if (search) filtered = filtered.filter(i => i.sku.toLowerCase().includes(search) || i.name.toLowerCase().includes(search));
    if (lowStock) filtered = filtered.filter(i => i.quantity < 10);

    return HttpResponse.json(paginate(filtered, page, pageSize));
  }),

  http.get(`${BASE}/inventory/barcode/:barcode`, async ({ params }) => {
    await delay(FAKE_DELAY);
    const item = INVENTORY_STOCK_ITEMS.find(i => i.barcode === decodeURIComponent(params.barcode as string));
    return HttpResponse.json(item ?? null);
  }),

  http.get(`${BASE}/inventory/locations`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json(LOCATIONS);
  }),

  http.get(`${BASE}/inventory/locations/:id`, async ({ params }) => {
    await delay(FAKE_DELAY);
    const loc = LOCATIONS.find(l => l.id === params.id);
    if (!loc) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(loc);
  }),

  http.post(`${BASE}/inventory/adjustments`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ message: 'Adjustment recorded', reference: `ADJ-${Date.now()}` });
  }),

  // ── Picking ────────────────────────────────────────────────────────────

  http.get(`${BASE}/picking`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const url = new URL(request.url);
    const assignedTo = searchParam(url, 'assignedTo');
    const filtered = assignedTo ? PICK_LISTS.filter(p => p.assignedTo === assignedTo) : PICK_LISTS;
    return HttpResponse.json(filtered);
  }),

  http.get(`${BASE}/picking/:id`, async ({ params }) => {
    await delay(FAKE_DELAY);
    const pl = PICK_LISTS.find(p => p.id === params.id);
    if (!pl) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(pl);
  }),

  http.post(`${BASE}/picking/confirm`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ message: 'Pick confirmed' });
  }),

  http.post(`${BASE}/picking/short`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ message: 'Short pick recorded' });
  }),

  // ── Packing ────────────────────────────────────────────────────────────

  http.get(`${BASE}/packing`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const url = new URL(request.url);
    const status = searchParam(url, 'status');
    const filtered = status ? PACK_ORDERS.filter(p => status.split(',').includes(p.status)) : PACK_ORDERS;
    return HttpResponse.json(filtered);
  }),

  http.get(`${BASE}/packing/:id`, async ({ params }) => {
    await delay(FAKE_DELAY);
    const order = PACK_ORDERS.find(p => p.id === params.id);
    if (!order) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(order);
  }),

  http.post(`${BASE}/packing/scan`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ message: 'Item scanned' });
  }),

  http.post(`${BASE}/packing/close`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ message: 'Carton closed' });
  }),

  // ── Putaway ────────────────────────────────────────────────────────────

  http.get(`${BASE}/putaway`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json(PUTAWAY_TASKS);
  }),

  http.get(`${BASE}/putaway/:id`, async ({ params }) => {
    await delay(FAKE_DELAY);
    const task = PUTAWAY_TASKS.find(t => t.id === params.id);
    if (!task) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(task);
  }),

  http.post(`${BASE}/putaway/complete`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ message: 'Putaway complete' });
  }),

  // ── Returns ────────────────────────────────────────────────────────────

  http.get(`${BASE}/returns`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const url = new URL(request.url);
    const status = searchParam(url, 'status');
    const filtered = status ? RETURNS.filter(r => status.split(',').includes(r.status)) : RETURNS;
    return HttpResponse.json(filtered);
  }),

  http.get(`${BASE}/returns/:id`, async ({ params }) => {
    await delay(FAKE_DELAY);
    const ret = RETURNS.find(r => r.id === params.id);
    if (!ret) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(ret);
  }),

  http.post(`${BASE}/returns/receive`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ message: 'Return received' });
  }),

  // ── Cycle Counting ─────────────────────────────────────────────────────

  http.get(`${BASE}/counts`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const url = new URL(request.url);
    const status = searchParam(url, 'status');
    const filtered = status ? CYCLE_COUNTS.filter(c => status.split(',').includes(c.status)) : CYCLE_COUNTS;
    return HttpResponse.json(filtered);
  }),

  http.get(`${BASE}/counts/:id`, async ({ params }) => {
    await delay(FAKE_DELAY);
    const count = CYCLE_COUNTS.find(c => c.id === params.id);
    if (!count) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(count);
  }),

  http.post(`${BASE}/counts/submit`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ message: 'Count submitted' });
  }),

  // ── Reports ────────────────────────────────────────────────────────────

  http.get(`${BASE}/reports/stock-valuation`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json(STOCK_ON_HAND.map(s => ({ ...s, costPrice: s.costPrice ?? 0, value: s.value ?? 0 })));
  }),

  http.get(`${BASE}/reports/shrinkage`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ data: [], summary: { totalShrinkage: 0, totalValue: 0 } });
  }),

  http.get(`${BASE}/reports/ageing`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json(EXPIRY_ROWS);
  }),

  // ── Users ──────────────────────────────────────────────────────────────

  http.get(`${BASE}/users`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json([
      { id: 'usr-001', name: 'Parag', role: 'admin', siteId: 'site-001' },
      { id: 'usr-002', name: 'Ravi', role: 'picker', siteId: 'site-001' },
      { id: 'usr-003', name: 'Suresh', role: 'packer', siteId: 'site-001' },
    ]);
  }),

  http.post(`${BASE}/users`, async ({ request }) => {
    await delay(FAKE_DELAY);
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ id: `usr-${Date.now()}`, ...body }, { status: 201 });
  }),

  // ── Settings ───────────────────────────────────────────────────────────

  http.get(`${BASE}/settings`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ lowStockThreshold: 10, defaultSiteId: 'site-001', timezone: 'Asia/Kolkata' });
  }),

  http.patch(`${BASE}/settings`, async () => {
    await delay(FAKE_DELAY);
    return HttpResponse.json({ message: 'Settings updated' });
  }),
];
