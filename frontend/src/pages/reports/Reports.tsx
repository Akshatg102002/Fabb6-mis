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

function fmtINR(v: number | string | null): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN');
}

// ── Site selector hook ─────────────────────────────────────────────────────

function useSites() {
  return useQuery<{ id: string; name: string }[]>({
    queryKey: ['sites'],
    queryFn: () => apiClient<{ id: string; name: string }[]>('/locations/sites'),
    staleTime: 300_000,
  });
}

// ── Tab 1: Stock Valuation ─────────────────────────────────────────────────

interface ValuationRow {
  sku_id: string;
  sku_code: string;
  sku_name: string;
  batch_number: string | null;
  expiry_date: string | null;
  total_qty: string;
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
  const user = useSessionStore((s) => s.user);
  const { data: sites } = useSites();
  const [siteId, setSiteId] = useState(user?.site_id ?? '');

  useEffect(() => {
    if (!siteId && sites && sites.length > 0) setSiteId(sites[0]!.id);
  }, [sites, siteId]);

  const { data, isLoading, error } = useQuery<ValuationResponse>({
    queryKey: ['reports', 'stock-valuation', siteId],
    queryFn: () => apiClient<ValuationResponse>(`/reports/stock-valuation?site_id=${siteId}`),
    enabled: !!siteId,
    staleTime: 60_000,
  });

  function handleDownload() {
    if (!data?.data.length) return;
    const csv = toCSV(
      data.data.map((r) => ({
        'SKU Code': r.sku_code,
        'SKU Name': r.sku_name,
        'Batch': r.batch_number ?? '',
        'Expiry Date': r.expiry_date ? fmtDate(r.expiry_date) : '',
        'Qty': Number(r.total_qty),
        'Unit Cost (INR)': Number(r.unit_cost),
        'Total Value (INR)': Number(r.total_value),
      })),
      ['SKU Code', 'SKU Name', 'Batch', 'Expiry Date', 'Qty', 'Unit Cost (INR)', 'Total Value (INR)'],
    );
    downloadCSV(`stock-valuation-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={{ ...inputStyle, minWidth: '200px' }}>
          <option value="">Select site…</option>
          {sites?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {data && (
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            ↓ Download CSV
          </Button>
        )}
        {data && (
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            Grand Total: <strong style={{ color: 'var(--text)' }}>{fmtINR(data.grand_total_value)}</strong>
          </span>
        )}
      </div>

      {!siteId && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>Select a site to view stock valuation.</p>}
      {isLoading && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>Loading…</p>}
      {error && <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>Failed to load stock valuation.</p>}

      {data && (
        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'var(--surface)' }}>
            <thead>
              <tr>
                {['SKU Code', 'Name', 'Batch', 'Expiry', 'Qty', 'Unit Cost', 'Total Value'].map((h) => (
                  <th key={h} style={{ ...tableHeaderStyle, textAlign: h === 'Qty' || h === 'Unit Cost' || h === 'Total Value' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.length === 0 ? (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No stock found</td></tr>
              ) : data.data.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>{r.sku_code}</td>
                  <td style={{ ...tdStyle, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sku_name}</td>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'var(--text-muted)' }}>{r.batch_number ?? '—'}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDate(r.expiry_date)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{Number(r.total_qty).toLocaleString('en-IN')}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{fmtINR(r.unit_cost)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtINR(r.total_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Movement History ────────────────────────────────────────────────

interface MovementItem {
  id: string;
  skuCode: string;
  skuName: string;
  fromLocationCode: string | null;
  toLocationCode: string | null;
  qty: number;
  movementType: string;
  reference: string | null;
  createdAt: string;
  createdBy: string;
}

interface PaginatedMovements {
  items: MovementItem[];
  total: number;
  page: number;
  pageSize: number;
}

function MovementHistoryTab() {
  const [skuSearch, setSkuSearch] = useState('');
  const [movementType, setMovementType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const params = new URLSearchParams();
  if (skuSearch) params.set('skuCode', skuSearch);
  if (movementType) params.set('movementType', movementType);
  if (fromDate) params.set('fromDate', new Date(fromDate).toISOString());
  if (toDate) params.set('toDate', new Date(toDate + 'T23:59:59').toISOString());
  params.set('page', String(page));
  params.set('pageSize', String(PAGE_SIZE));

  const { data, isLoading, error } = useQuery<PaginatedMovements>({
    queryKey: ['stock', 'movements', skuSearch, movementType, fromDate, toDate, page],
    queryFn: () => apiClient<PaginatedMovements>(`/stock/movements?${params.toString()}`),
    staleTime: 30_000,
  });

  function handleDownload() {
    if (!data?.items.length) return;
    const csv = toCSV(
      data.items.map((m) => ({
        'Date': new Date(m.createdAt).toLocaleString('en-IN'),
        'SKU Code': m.skuCode,
        'SKU Name': m.skuName,
        'Type': m.movementType,
        'Qty': m.qty,
        'From': m.fromLocationCode ?? '',
        'To': m.toLocationCode ?? '',
        'Reference': m.reference ?? '',
        'User': m.createdBy,
      })),
      ['Date', 'SKU Code', 'SKU Name', 'Type', 'Qty', 'From', 'To', 'Reference', 'User'],
    );
    downloadCSV(`movements-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const MOVEMENT_TYPES = [
    'grn_receipt', 'putaway', 'pick', 'pack_confirm', 'dispatch',
    'customer_return', 'rto_receipt', 'transfer_out', 'transfer_receipt',
    'cycle_count_adjustment', 'stock_adjustment', 'writeoff', 'quarantine', 'unquarantine',
  ];

  function fmtType(t: string) {
    return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input type="search" placeholder="SKU code…" value={skuSearch} onChange={(e) => { setSkuSearch(e.target.value); setPage(1); }} style={{ ...inputStyle, minWidth: '140px' }} />
        <select value={movementType} onChange={(e) => { setMovementType(e.target.value); setPage(1); }} style={{ ...inputStyle, minWidth: '180px' }}>
          <option value="">All types</option>
          {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{fmtType(t)}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} style={inputStyle} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>to</span>
        <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} style={inputStyle} />
        {data?.items.length ? (
          <Button variant="secondary" size="sm" onClick={handleDownload}>↓ CSV</Button>
        ) : null}
        {data && <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{data.total.toLocaleString('en-IN')} records</span>}
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>Loading…</p>}
      {error && <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>Failed to load movements.</p>}

      {data && (
        <>
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'var(--surface)' }}>
              <thead>
                <tr>
                  {['Date', 'SKU', 'Name', 'Type', 'Qty', 'From → To', 'User'].map((h) => (
                    <th key={h} style={{ ...tableHeaderStyle, textAlign: h === 'Qty' ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No movements found</td></tr>
                ) : data.items.map((m) => (
                  <tr key={m.id}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{new Date(m.createdAt).toLocaleDateString('en-IN')}</td>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', whiteSpace: 'nowrap' }}>{m.skuCode}</td>
                    <td style={{ ...tdStyle, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.skuName}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtType(m.movementType)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{m.qty.toLocaleString('en-IN')}</td>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {m.fromLocationCode && m.toLocationCode ? `${m.fromLocationCode} → ${m.toLocationCode}` : (m.fromLocationCode ?? m.toLocationCode ?? '—')}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{m.createdBy}</td>
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
        </>
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
  const [bucket, setBucket] = useState<'expired' | 'lt30' | 'lt60' | 'gt60'>('lt30');

  const { data, isLoading, error } = useQuery<PaginatedSOH>({
    queryKey: ['stock', 'on-hand', 'expiry', bucket],
    queryFn: () => apiClient<PaginatedSOH>(`/stock/on-hand?expiryBucket=${bucket}&pageSize=500`),
    staleTime: 60_000,
  });

  function expiryColour(d: string | null): string {
    if (!d) return 'inherit';
    const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    if (days <= 0) return 'var(--scan-error)';
    if (days <= 30) return 'var(--scan-error)';
    if (days <= 60) return 'var(--scan-warn, #C47700)';
    return 'inherit';
  }

  function bucketLabel(b: string) {
    return { expired: 'Expired', lt30: '< 30 Days', lt60: '30–60 Days', gt60: '> 60 Days' }[b] ?? b;
  }

  function handleDownload() {
    if (!data?.items.length) return;
    const csv = toCSV(
      data.items.map((r) => ({
        'SKU Code': r.skuCode,
        'SKU Name': r.skuName,
        'Batch': r.batch ?? '',
        'Location': r.locationCode,
        'Qty': r.qty,
        'UOM': r.uom,
        'Expiry Date': r.expiryDate ? fmtDate(r.expiryDate) : '',
        'Days Remaining': r.expiryDate ? Math.ceil((new Date(r.expiryDate).getTime() - Date.now()) / 86400000) : '',
      })),
      ['SKU Code', 'SKU Name', 'Batch', 'Location', 'Qty', 'UOM', 'Expiry Date', 'Days Remaining'],
    );
    downloadCSV(`expiry-${bucket}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['expired', 'lt30', 'lt60', 'gt60'] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              style={{
                padding: '6px 14px', fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
                border: '1px solid var(--border)', borderRadius: '6px',
                backgroundColor: bucket === b ? 'var(--brand-primary)' : 'var(--surface)',
                color: bucket === b ? '#FFF' : 'var(--text)',
                fontWeight: bucket === b ? 600 : 400,
              }}
            >
              {bucketLabel(b)}
            </button>
          ))}
        </div>
        {data?.items.length ? <Button variant="secondary" size="sm" onClick={handleDownload}>↓ CSV</Button> : null}
        {data && <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{data.total.toLocaleString('en-IN')} lines</span>}
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>Loading…</p>}
      {error && <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>Failed to load expiry data.</p>}

      {data && (
        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'var(--surface)' }}>
            <thead>
              <tr>
                {['SKU Code', 'Name', 'Batch', 'Location', 'Qty', 'Expiry Date', 'Days Left'].map((h) => (
                  <th key={h} style={{ ...tableHeaderStyle, textAlign: h === 'Qty' || h === 'Days Left' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No items in this expiry bucket</td></tr>
              ) : data.items.map((item) => {
                const days = item.expiryDate ? Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000) : null;
                return (
                  <tr key={item.id}>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>{item.skuCode}</td>
                    <td style={{ ...tdStyle, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.skuName}</td>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'var(--text-muted)' }}>{item.batch ?? '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>{item.locationCode}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{item.qty.toLocaleString('en-IN')}</td>
                    <td style={{ ...tdStyle, color: expiryColour(item.expiryDate), fontWeight: days !== null && days <= 30 ? 600 : 400 }}>
                      {item.expiryDate ? fmtDate(item.expiryDate) : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: expiryColour(item.expiryDate), fontWeight: days !== null && days <= 30 ? 600 : 400 }}>
                      {days === null ? '—' : days <= 0 ? 'Expired' : `${days}d`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Brand-wise Summary ───────────────────────────────────────────────

interface BrandRow {
  brand: string;
  qty: number;
  skuCount?: number;
}

interface DashboardStats {
  brandStock: BrandRow[];
  top10Skus: { skuCode: string; skuName: string; qty: number; value: number }[];
}

function BrandSummaryTab() {
  const { data, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => apiClient<DashboardStats>('/dashboard/stats'),
    staleTime: 120_000,
  });

  function handleDownload() {
    if (!data?.brandStock.length) return;
    const total = data.brandStock.reduce((s, b) => s + b.qty, 0);
    const csv = toCSV(
      data.brandStock.map((b) => ({
        'Brand': b.brand,
        'Total Qty': b.qty,
        'Share %': total > 0 ? ((b.qty / total) * 100).toFixed(1) : '0',
      })),
      ['Brand', 'Total Qty', 'Share %'],
    );
    downloadCSV(`brand-summary-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const total = data?.brandStock.reduce((s, b) => s + b.qty, 0) ?? 0;

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
        {data?.brandStock.length ? <Button variant="secondary" size="sm" onClick={handleDownload}>↓ CSV</Button> : null}
        {data && <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{data.brandStock.length} brands, {total.toLocaleString('en-IN')} units total</span>}
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>Loading…</p>}
      {error && <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>Failed to load brand data.</p>}

      {data && (
        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'var(--surface)' }}>
            <thead>
              <tr>
                {['Brand', 'Total Qty', 'Share', 'Bar'].map((h) => (
                  <th key={h} style={{ ...tableHeaderStyle, textAlign: h === 'Total Qty' || h === 'Share' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.brandStock.length === 0 ? (
                <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No brand data</td></tr>
              ) : data.brandStock.map((b, i) => {
                const pct = total > 0 ? (b.qty / total) * 100 : 0;
                return (
                  <tr key={i}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{b.brand}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b.qty.toLocaleString('en-IN')}</td>
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
          </table>
        </div>
      )}
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
