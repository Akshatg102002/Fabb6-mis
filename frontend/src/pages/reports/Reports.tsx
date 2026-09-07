import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DeskLayout } from '@/components/layout/DeskLayout';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/api/client';
import { useSessionStore } from '@/stores/sessionStore';

// ── CSV Helper ─────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const keys = Object.keys(rows[0] ?? {});
  const csvHeaders = headers.length ? headers : keys;
  const lines = [
    csvHeaders.join(','),
    ...rows.map((r) =>
      keys.map((k) => {
        const v = r[k];
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','),
    ),
  ];
  return lines.join('\n');
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Shared styles ──────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  height: '36px',
  padding: '0 10px',
  fontSize: '14px',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  backgroundColor: 'var(--surface-sunken)',
  color: 'var(--text)',
  fontFamily: 'inherit',
};

const tableHeaderStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  backgroundColor: 'var(--surface-sunken)',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: '13px',
  borderBottom: '1px solid var(--border)',
};

function fmtINR(v: number | string | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN');
}

// ── Site selector hook ─────────────────────────────────────────────────────

function useSites() {
  return useQuery<{ id: string; name: string; is_active: boolean }[]>({
    queryKey: ['sites'],
    queryFn: () => apiClient<{ id: string; name: string; is_active: boolean }[]>('/locations/sites'),
    staleTime: 300_000,
  });
}

function useSiteId(): string {
  const user = useSessionStore((s) => s.user);
  const { data: sites } = useSites();

  try {
    const stored = localStorage.getItem('fabb6_site_id');
    if (stored) return stored;
  } catch { /* ignore */ }

  if (user?.site_id) return user.site_id;
  if (sites && sites.length > 0) {
    const active = sites.find((s) => s.is_active) ?? sites[0];
    return active!.id;
  }
  return '';
}

// ── Loading / empty states ─────────────────────────────────────────────────

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
        Loading…
      </td>
    </tr>
  );
}

function EmptyRow({ cols, message = 'No data yet' }: { cols: number; message?: string }) {
  return (
    <tr>
      <td colSpan={cols} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
        {message}
      </td>
    </tr>
  );
}

// ── Tab 1: Stock Valuation ─────────────────────────────────────────────────

interface ValuationRow {
  sku_id: string;
  sku_code: string;
  sku_name: string;
  brand_name: string;
  location_code: string;
  uom: string;
  batch_number: string | null;
  expiry_date: string | null;
  total_qty: string;
  mrp: string | null;
  unit_cost: string;
  total_value: string;
}

interface ValuationResponse {
  as_of: string;
  site_id: string;
  data: ValuationRow[];
  grand_total_value: number;
}

function StockValuationTab() {
  const siteId = useSiteId();
  const { data: sites, isLoading: sitesLoading } = useSites();

  // Store siteId in state so the query re-runs when it resolves
  const [resolvedSiteId, setResolvedSiteId] = useState('');
  useEffect(() => {
    if (siteId) setResolvedSiteId(siteId);
    else if (!sitesLoading && sites && sites.length > 0) {
      const active = sites.find((s) => s.is_active) ?? sites[0];
      setResolvedSiteId(active!.id);
    }
  }, [siteId, sites, sitesLoading]);

  const { data, isLoading, error } = useQuery<ValuationResponse>({
    queryKey: ['reports', 'stock-valuation', resolvedSiteId],
    queryFn: () => apiClient<ValuationResponse>(`/reports/stock-valuation?site_id=${resolvedSiteId}`),
    enabled: !!resolvedSiteId,
    staleTime: 60_000,
  });

  const rows = data?.data ?? [];
  const COLS = ['SKU Code', 'SKU Name', 'Brand', 'Location', 'Batch', 'QTY', 'UOM', 'MRP (₹)', 'Stock Value (₹)'];

  function handleDownload() {
    if (!rows.length) return;
    const csv = toCSV(
      rows.map((r) => ({
        'SKU Code': r.sku_code,
        'SKU Name': r.sku_name,
        'Brand': r.brand_name,
        'Location': r.location_code,
        'Batch': r.batch_number ?? '',
        'Expiry': r.expiry_date ? fmtDate(r.expiry_date) : '',
        'QTY': Number(r.total_qty),
        'UOM': r.uom,
        'MRP (INR)': r.mrp ? Number(r.mrp) : '',
        'Unit Cost (INR)': Number(r.unit_cost),
        'Stock Value (INR)': Number(r.total_value),
      })),
      ['SKU Code', 'SKU Name', 'Brand', 'Location', 'Batch', 'Expiry', 'QTY', 'UOM', 'MRP (INR)', 'Unit Cost (INR)', 'Stock Value (INR)'],
    );
    downloadCSV(`stock-valuation-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const showLoading = isLoading || (sitesLoading && !resolvedSiteId);
  const noSite = !sitesLoading && !resolvedSiteId;

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        {rows.length > 0 && (
          <Button variant="secondary" size="sm" onClick={handleDownload}>↓ Download CSV</Button>
        )}
        {data && (
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            Grand Total: <strong style={{ color: 'var(--text)' }}>{fmtINR(data.grand_total_value)}</strong>
          </span>
        )}
      </div>

      {noSite && <p style={{ color: 'var(--scan-error)', textAlign: 'center', padding: '3rem 0' }}>No sites configured. Add a site first.</p>}
      {error && <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>Failed to load stock valuation.</p>}

      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'var(--surface)' }}>
          <thead>
            <tr>
              {COLS.map((h) => (
                <th key={h} style={{ ...tableHeaderStyle, textAlign: ['QTY', 'MRP (₹)', 'Stock Value (₹)'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showLoading ? (
              <LoadingRow cols={COLS.length} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={COLS.length} message="No stock found" />
            ) : rows.map((r, i) => (
              <tr key={i}>
                <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>{r.sku_code}</td>
                <td style={{ ...tdStyle, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sku_name}</td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{r.brand_name}</td>
                <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>{r.location_code}</td>
                <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'var(--text-muted)' }}>{r.batch_number ?? '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{Number(r.total_qty).toLocaleString('en-IN')} {r.uom}</td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{r.uom}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{r.mrp ? fmtINR(r.mrp) : '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtINR(r.total_value)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && data && (
            <tfoot>
              <tr style={{ backgroundColor: 'var(--surface-sunken)' }}>
                <td colSpan={5} style={{ ...tdStyle, fontWeight: 600 }}>Total</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {rows.reduce((s, r) => s + Number(r.total_qty), 0).toLocaleString('en-IN')}
                </td>
                <td colSpan={2} />
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtINR(data.grand_total_value)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab 2: Movement History ────────────────────────────────────────────────

interface MovementRow {
  id: string;
  sku_code: string;
  sku_name: string;
  from_location_code: string | null;
  to_location_code: string | null;
  quantity: number;
  movement_type: string;
  reference_type: string | null;
  created_at: string;
  user_name: string | null;
}

interface MovementsResponse {
  data: MovementRow[];
  meta: { page: number; limit: number; total: number; pages: number };
}

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function MovementHistoryTab() {
  const defaults = defaultDateRange();
  const [skuCode, setSkuCode] = useState('');
  const [movementType, setMovementType] = useState('');
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const params = new URLSearchParams();
  if (skuCode.trim()) params.set('sku_code', skuCode.trim());
  if (movementType) params.set('movement_type', movementType);
  if (fromDate) params.set('from_date', new Date(fromDate).toISOString());
  if (toDate) params.set('to_date', new Date(toDate + 'T23:59:59').toISOString());
  params.set('page', String(page));
  params.set('limit', String(LIMIT));

  const { data, isLoading, error } = useQuery<MovementsResponse>({
    queryKey: ['stock', 'movements', skuCode, movementType, fromDate, toDate, page],
    queryFn: () => apiClient<MovementsResponse>(`/stock/movements?${params.toString()}`),
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const totalPages = data?.meta.pages ?? 1;

  const MOVEMENT_TYPES = [
    'grn_receipt', 'putaway', 'pick', 'pack_confirm', 'dispatch',
    'customer_return', 'rto_receipt', 'transfer_out', 'transfer_receipt',
    'cycle_count_adjustment', 'stock_adjustment', 'writeoff', 'quarantine', 'unquarantine',
  ];

  function fmtType(t: string) {
    return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function handleDownload() {
    if (!rows.length) return;
    const csv = toCSV(
      rows.map((m) => ({
        'Date': new Date(m.created_at).toLocaleString('en-IN'),
        'SKU Code': m.sku_code,
        'SKU Name': m.sku_name,
        'Type': fmtType(m.movement_type),
        'Qty': m.quantity,
        'From': m.from_location_code ?? '',
        'To': m.to_location_code ?? '',
        'User': m.user_name ?? '',
      })),
      ['Date', 'SKU Code', 'SKU Name', 'Type', 'Qty', 'From', 'To', 'User'],
    );
    downloadCSV(`movements-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const COLS = ['Date', 'SKU Code', 'Name', 'Type', 'Qty', 'From → To', 'User'];

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="search" placeholder="SKU code…" value={skuCode}
          onChange={(e) => { setSkuCode(e.target.value); setPage(1); }}
          style={{ ...inputStyle, minWidth: '140px' }}
        />
        <select
          value={movementType}
          onChange={(e) => { setMovementType(e.target.value); setPage(1); }}
          style={{ ...inputStyle, minWidth: '180px' }}
        >
          <option value="">All types</option>
          {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{fmtType(t)}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} style={inputStyle} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>to</span>
        <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} style={inputStyle} />
        {rows.length > 0 && <Button variant="secondary" size="sm" onClick={handleDownload}>↓ CSV</Button>}
        {data && <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{data.meta.total.toLocaleString('en-IN')} records</span>}
      </div>

      {error && <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>Failed to load movements.</p>}

      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'var(--surface)' }}>
          <thead>
            <tr>
              {COLS.map((h) => (
                <th key={h} style={{ ...tableHeaderStyle, textAlign: h === 'Qty' ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <LoadingRow cols={COLS.length} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={COLS.length} message="No movements found for this period" />
            ) : rows.map((m) => (
              <tr key={m.id}>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                  {new Date(m.created_at).toLocaleDateString('en-IN')}{' '}
                  <span style={{ fontSize: '11px' }}>{new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </td>
                <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', whiteSpace: 'nowrap' }}>{m.sku_code}</td>
                <td style={{ ...tdStyle, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.sku_name}</td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtType(m.movement_type)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{Number(m.quantity).toLocaleString('en-IN')}</td>
                <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {m.from_location_code && m.to_location_code
                    ? `${m.from_location_code} → ${m.to_location_code}`
                    : (m.from_location_code ?? m.to_location_code ?? '—')}
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{m.user_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', gap: '8px' }}>
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Expiry Report ────────────────────────────────────────────────────

interface StockOnHandItem {
  id: string;
  skuCode: string;
  skuName: string;
  batch: string | null;
  locationCode: string;
  qty: number;
  uom: string;
  expiryDate: string | null;
}

interface PaginatedSOH {
  items: StockOnHandItem[];
  total: number;
}

function ExpiryReportTab() {
  const siteId = useSiteId();
  const { data: sites, isLoading: sitesLoading } = useSites();
  const [resolvedSiteId, setResolvedSiteId] = useState('');
  useEffect(() => {
    if (siteId) setResolvedSiteId(siteId);
    else if (!sitesLoading && sites && sites.length > 0) {
      const active = sites.find((s) => s.is_active) ?? sites[0];
      setResolvedSiteId(active!.id);
    }
  }, [siteId, sites, sitesLoading]);

  const params = new URLSearchParams({ pageSize: '500' });
  if (resolvedSiteId) params.set('siteId', resolvedSiteId);

  const { data, isLoading, error } = useQuery<PaginatedSOH>({
    queryKey: ['stock', 'on-hand', 'expiry-report', resolvedSiteId],
    queryFn: () => apiClient<PaginatedSOH>(`/stock/on-hand?${params.toString()}`),
    enabled: !!resolvedSiteId,
    staleTime: 60_000,
  });

  const rows = data?.items ?? [];

  function daysRemaining(d: string | null): number | null {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  }

  function expiryColor(days: number | null): string {
    if (days === null) return 'inherit';
    if (days <= 0) return 'var(--scan-error)';
    if (days <= 30) return 'var(--scan-error)';
    if (days <= 90) return 'var(--scan-warn, #C47700)';
    return '#0e8a4f';
  }

  function handleDownload() {
    if (!rows.length) return;
    const csv = toCSV(
      rows.map((r) => ({
        'SKU Code': r.skuCode,
        'SKU Name': r.skuName,
        'Batch': r.batch ?? '',
        'Location': r.locationCode,
        'QTY': r.qty,
        'UOM': r.uom,
        'Expiry Date': r.expiryDate ? fmtDate(r.expiryDate) : 'No expiry',
        'Days Remaining': daysRemaining(r.expiryDate) ?? 'N/A',
      })),
      ['SKU Code', 'SKU Name', 'Batch', 'Location', 'QTY', 'UOM', 'Expiry Date', 'Days Remaining'],
    );
    downloadCSV(`expiry-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const COLS = ['SKU Code', 'Name', 'Batch', 'Location', 'QTY', 'UOM', 'Expiry Date', 'Days Left'];
  const showLoading = isLoading || (sitesLoading && !resolvedSiteId);

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        {rows.length > 0 && <Button variant="secondary" size="sm" onClick={handleDownload}>↓ CSV</Button>}
        {data && (
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {data.total.toLocaleString('en-IN')} lines
          </span>
        )}
      </div>

      {error && <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>Failed to load expiry data.</p>}

      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'var(--surface)' }}>
          <thead>
            <tr>
              {COLS.map((h) => (
                <th key={h} style={{ ...tableHeaderStyle, textAlign: ['QTY', 'Days Left'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showLoading ? (
              <LoadingRow cols={COLS.length} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={COLS.length} message="No stock on hand" />
            ) : rows.map((item) => {
              const days = daysRemaining(item.expiryDate);
              const color = expiryColor(days);
              return (
                <tr key={item.id}>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>{item.skuCode}</td>
                  <td style={{ ...tdStyle, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.skuName}</td>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'var(--text-muted)' }}>{item.batch ?? '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>{item.locationCode}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{item.qty.toLocaleString('en-IN')}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{item.uom}</td>
                  <td style={{ ...tdStyle, color, fontWeight: days !== null && days <= 30 ? 600 : 400 }}>
                    {item.expiryDate ? fmtDate(item.expiryDate) : <span style={{ color: 'var(--text-muted)' }}>No expiry</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color, fontWeight: days !== null && days <= 30 ? 600 : 400 }}>
                    {days === null ? <span style={{ color: 'var(--text-muted)' }}>—</span> : days <= 0 ? 'Expired' : `${days}d`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab 4: Brand-wise Summary ───────────────────────────────────────────────

interface BrandRow {
  brand: string;
  qty: number;
  skuCount: number;
  totalValue: number;
}

interface DashboardStats {
  brandStock: BrandRow[];
}

function BrandSummaryTab() {
  const { data, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => apiClient<DashboardStats>('/dashboard/stats'),
    staleTime: 120_000,
  });

  const rows = data?.brandStock ?? [];
  const totalQty = rows.reduce((s, b) => s + b.qty, 0);
  const totalValue = rows.reduce((s, b) => s + (b.totalValue ?? 0), 0);

  function handleDownload() {
    if (!rows.length) return;
    const csv = toCSV(
      rows.map((b) => ({
        'Brand': b.brand,
        'SKU Count': b.skuCount ?? '',
        'Total QTY': b.qty,
        'Total Value (INR)': b.totalValue ?? '',
        'Share %': totalQty > 0 ? ((b.qty / totalQty) * 100).toFixed(1) : '0',
      })),
      ['Brand', 'SKU Count', 'Total QTY', 'Total Value (INR)', 'Share %'],
    );
    downloadCSV(`brand-summary-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const COLS = ['Brand', 'SKU Count', 'Total QTY', 'Total Value (₹)', 'Share', 'Bar'];

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
        {rows.length > 0 && <Button variant="secondary" size="sm" onClick={handleDownload}>↓ CSV</Button>}
        {data && (
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {rows.length} brands · {totalQty.toLocaleString('en-IN')} units · {fmtINR(totalValue)}
          </span>
        )}
      </div>

      {error && <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>Failed to load brand data.</p>}

      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'var(--surface)' }}>
          <thead>
            <tr>
              {COLS.map((h) => (
                <th key={h} style={{ ...tableHeaderStyle, textAlign: ['Total QTY', 'Total Value (₹)', 'Share', 'SKU Count'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <LoadingRow cols={COLS.length} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={COLS.length} message="No brand data" />
            ) : rows.map((b, i) => {
              const pct = totalQty > 0 ? (b.qty / totalQty) * 100 : 0;
              return (
                <tr key={i}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{b.brand}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{(b.skuCount ?? 0).toLocaleString('en-IN')}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b.qty.toLocaleString('en-IN')}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtINR(b.totalValue ?? 0)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{pct.toFixed(1)}%</td>
                  <td style={{ ...tdStyle, width: '200px', minWidth: '120px' }}>
                    <div style={{ height: '16px', backgroundColor: 'var(--surface-sunken)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: 'var(--brand-primary)', borderRadius: '4px' }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ backgroundColor: 'var(--surface-sunken)' }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>Total</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {rows.reduce((s, b) => s + (b.skuCount ?? 0), 0).toLocaleString('en-IN')}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {totalQty.toLocaleString('en-IN')}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtINR(totalValue)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'valuation' | 'movements' | 'expiry' | 'brands';

const TABS: { id: Tab; label: string }[] = [
  { id: 'valuation', label: 'Stock Valuation' },
  { id: 'movements', label: 'Movement History' },
  { id: 'expiry', label: 'Expiry Report' },
  { id: 'brands', label: 'Brand Summary' },
];

export default function Reports() {
  const [tab, setTab] = useState<Tab>('valuation');

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: active ? 600 : 500,
    color: active ? 'var(--brand-primary)' : 'var(--text-muted)',
    background: 'none',
    border: 'none',
    borderBottom: `2px solid ${active ? 'var(--brand-primary)' : 'transparent'}`,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 120ms ease',
    whiteSpace: 'nowrap',
  });

  return (
    <DeskLayout heading="Reports" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: 'Reports' }]}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '20px', gap: '4px', overflowX: 'auto' }}>
        {TABS.map(({ id, label }) => (
          <button key={id} style={tabBtnStyle(tab === id)} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'valuation' && <StockValuationTab />}
      {tab === 'movements' && <MovementHistoryTab />}
      {tab === 'expiry' && <ExpiryReportTab />}
      {tab === 'brands' && <BrandSummaryTab />}
    </DeskLayout>
  );
}
