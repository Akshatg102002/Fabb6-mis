import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Printer, ArrowLeft, Check, ChevronRight } from 'lucide-react';
import { DeskLayout } from '@/components/layout/DeskLayout';
import { useVendors } from '@/api/queries/vendors';
import { useCreatePO, usePO } from '@/api/queries/pos';
import { apiClient } from '@/api/client';

// ── SKU search ────────────────────────────────────────────────────────────────

interface SkuResult {
  id: string;
  code: string;
  name: string;
  uom: string;
}

interface POLineRow {
  id: string;
  sku_id: string;
  sku_code: string;
  sku_name: string;
  ordered_qty: number;
  unit_cost: string;
}

function newRow(): POLineRow {
  return { id: crypto.randomUUID(), sku_id: '', sku_code: '', sku_name: '', ordered_qty: 1, unit_cost: '' };
}

// ── Print layout ──────────────────────────────────────────────────────────────

function PrintablePO({
  poNumber,
  vendorName,
  vendorGstin,
  expectedDate,
  notes,
  lines,
}: {
  poNumber: string;
  vendorName: string;
  vendorGstin: string;
  expectedDate: string;
  notes: string;
  lines: POLineRow[];
}) {
  const totalValue = lines.reduce((s, l) => s + l.ordered_qty * (parseFloat(l.unit_cost) || 0), 0);

  return (
    <div className="print-only" style={{ fontFamily: 'Georgia, serif', padding: '32px', color: '#000' }}>
      <style>{`
        @media print {
          body > *:not(.print-root) { display: none !important; }
          .print-only { display: block !important; }
          .no-print { display: none !important; }
        }
        @media screen {
          .print-only { display: none; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '28px', borderBottom: '2px solid #000', paddingBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>Fabb6 Cosmetics</div>
          <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>Purchase Order</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 700 }}>PO #{poNumber}</div>
          <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
            Date: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Vendor</div>
          <div style={{ fontWeight: 600 }}>{vendorName}</div>
          {vendorGstin && <div style={{ fontSize: '12px', color: '#555' }}>GSTIN: {vendorGstin}</div>}
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Delivery Details</div>
          <div style={{ fontSize: '13px' }}>Expected: {expectedDate || '—'}</div>
          {notes && <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>{notes}</div>}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '13px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #ccc' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>#</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>SKU Code</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>Description</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Qty</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Unit Cost (₹)</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={line.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '8px 12px' }}>{i + 1}</td>
              <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{line.sku_code}</td>
              <td style={{ padding: '8px 12px' }}>{line.sku_name}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>{line.ordered_qty.toLocaleString('en-IN')}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                {line.unit_cost ? Number(line.unit_cost).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                {line.unit_cost
                  ? (line.ordered_qty * parseFloat(line.unit_cost)).toLocaleString('en-IN', { minimumFractionDigits: 2 })
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #000', fontWeight: 700 }}>
            <td colSpan={3} style={{ padding: '10px 12px', textAlign: 'right' }}>Total</td>
            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
              {lines.reduce((s, l) => s + l.ordered_qty, 0).toLocaleString('en-IN')}
            </td>
            <td />
            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
              {totalValue > 0 ? `₹${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
            </td>
          </tr>
        </tfoot>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', marginTop: '48px' }}>
        {['Prepared by', 'Approved by'].map((label) => (
          <div key={label}>
            <div style={{ borderTop: '1px solid #000', paddingTop: '6px', fontSize: '12px', color: '#555' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SKU picker row ────────────────────────────────────────────────────────────

function LineRow({
  line,
  index,
  onChange,
  onRemove,
}: {
  line: POLineRow;
  index: number;
  onChange: (updated: POLineRow) => void;
  onRemove: () => void;
}) {
  const [skuSearch, setSkuSearch] = useState(line.sku_code);
  const [results, setResults] = useState<SkuResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSkuInput(value: string) {
    setSkuSearch(value);
    onChange({ ...line, sku_code: value, sku_id: '', sku_name: '' });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiClient<{ data: SkuResult[] }>(`/skus?search=${encodeURIComponent(value)}&per_page=8`);
        setResults(res.data ?? []);
        setShowDropdown(true);
      } catch (e) {
        console.error('SKU search failed', e);
        setResults([]);
      }
    }, 250);
  }

  function selectSku(sku: SkuResult) {
    setSkuSearch(sku.code);
    setShowDropdown(false);
    setResults([]);
    onChange({ ...line, sku_id: sku.id, sku_code: sku.code, sku_name: sku.name });
  }

  const inputStyle: React.CSSProperties = {
    height: '36px',
    padding: '0 10px',
    fontSize: '13px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    backgroundColor: 'var(--surface)',
    color: 'var(--text)',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <tr>
      <td style={{ padding: '6px 8px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>{index + 1}</td>
      <td style={{ padding: '6px 8px', position: 'relative', minWidth: '180px' }}>
        <input
          value={skuSearch}
          onChange={(e) => handleSkuInput(e.target.value)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          placeholder="Search SKU name…"
          style={inputStyle}
        />
        {showDropdown && results.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            maxHeight: '200px', overflowY: 'auto',
          }}>
            {results.map((s) => (
              <button
                key={s.id}
                onMouseDown={() => selectSku(s)}
                style={{
                  display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left',
                  border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '13px', color: 'var(--text)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface-sunken)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
              >
                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{s.code}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </td>
      <td style={{ padding: '6px 8px', minWidth: '200px' }}>
        <input
          value={line.sku_name}
          readOnly
          placeholder="Auto-filled"
          style={{ ...inputStyle, backgroundColor: 'var(--surface-sunken)', color: 'var(--text-muted)' }}
        />
      </td>
      <td style={{ padding: '6px 8px', width: '100px' }}>
        <input
          type="number" min={1} value={line.ordered_qty}
          onChange={(e) => onChange({ ...line, ordered_qty: Math.max(1, parseInt(e.target.value) || 1) })}
          style={{ ...inputStyle, textAlign: 'right' }}
        />
      </td>
      <td style={{ padding: '6px 8px', width: '120px' }}>
        <input
          type="number" min={0} step="0.01" placeholder="0.00" value={line.unit_cost}
          onChange={(e) => onChange({ ...line, unit_cost: e.target.value })}
          style={{ ...inputStyle, textAlign: 'right' }}
        />
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: '13px', whiteSpace: 'nowrap' }}>
        {line.unit_cost && !isNaN(parseFloat(line.unit_cost))
          ? `₹${(line.ordered_qty * parseFloat(line.unit_cost)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          : '—'}
      </td>
      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
        <button
          onClick={onRemove}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--scan-error)', padding: '4px' }}
          title="Remove line"
        >
          <Trash2 size={15} />
        </button>
      </td>
    </tr>
  );
}

// ── PO Detail / Print view (when :poId is present) ────────────────────────────

function PODetailView({ poId }: { poId: string }) {
  const { data: po, isLoading } = usePO(poId);
  const navigate = useNavigate();

  if (isLoading) return <DeskLayout heading="Purchase Order"><p style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading…</p></DeskLayout>;
  if (!po) return <DeskLayout heading="Purchase Order"><p style={{ color: 'var(--scan-error)', padding: '2rem' }}>Not found</p></DeskLayout>;

  const lines: POLineRow[] = (po.lines ?? []).map((l) => ({
    id: l.id,
    sku_id: l.sku_id,
    sku_code: l.sku_id,
    sku_name: '',
    ordered_qty: l.ordered_qty,
    unit_cost: l.unit_cost ?? '',
  }));

  return (
    <DeskLayout heading={`PO: ${po.po_number}`} title={`PO ${po.po_number}`}>
      <div className="no-print" style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
        <button
          onClick={() => navigate('/inward/purchase-orders')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--surface)', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <button
          onClick={() => window.print()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
        >
          <Printer size={14} /> Print PO
        </button>
      </div>
      <PrintablePO
        poNumber={po.po_number}
        vendorName=""
        vendorGstin=""
        expectedDate={po.expected_date ? new Date(po.expected_date).toLocaleDateString('en-IN') : ''}
        notes={po.notes ?? ''}
        lines={lines}
      />
    </DeskLayout>
  );
}

// ── Create PO form (two-step) ─────────────────────────────────────────────────

export default function CreatePO() {
  const { poId } = useParams<{ poId?: string }>();
  if (poId) return <PODetailView poId={poId} />;
  return <CreatePOForm />;
}

function CreatePOForm() {
  const navigate = useNavigate();
  const { data: vendorsData } = useVendors();
  const vendors = vendorsData?.data ?? [];
  const createPO = useCreatePO();

  // Step 1 fields
  const [step, setStep] = useState<1 | 2>(1);
  const [supplierId, setSupplierId] = useState('');
  const [poNumber, setPoNumber] = useState(() => `PO-${Date.now().toString(36).toUpperCase()}`);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');

  // Step 2 fields
  const [lines, setLines] = useState<POLineRow[]>([newRow()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Success state
  const [createdPO, setCreatedPO] = useState<{ id: string; po_number: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const selectedVendor = vendors.find((v) => v.id === supplierId);
  const totalValue = lines.reduce((s, l) => s + l.ordered_qty * (parseFloat(l.unit_cost) || 0), 0);

  function updateLine(index: number, updated: POLineRow) {
    setLines((prev) => prev.map((l, i) => (i === index ? updated : l)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  // Step 1 → Step 2: pure state transition, no API call
  function handleNext() {
    if (!supplierId) { setError('Select a vendor first'); return; }
    if (!poNumber.trim()) { setError('PO number is required'); return; }
    setError(null);
    setStep(2);
  }

  // Step 2: Save PO — calls POST /purchase-orders
  async function handleSave() {
    const validLines = lines.filter((l) => l.sku_id && l.ordered_qty > 0);
    if (validLines.length === 0) { setError('Add at least one SKU line with a selected SKU'); return; }
    setError(null);
    setSaving(true);

    // Resolve site_id from localStorage first, then API
    let siteId = '';
    try { siteId = localStorage.getItem('fabb6_site_id') ?? ''; } catch { /* ignore */ }
    if (!siteId) {
      try {
        const sites = await apiClient<Array<{ id: string; is_active: boolean }>>('/locations/sites');
        const active = sites.find((s) => s.is_active) ?? sites[0];
        siteId = active?.id ?? '';
      } catch (e) {
        console.error('Failed to fetch sites for PO creation', e);
      }
    }

    try {
      const result = await createPO.mutateAsync({
        supplier_id: supplierId,
        site_id: siteId,
        po_number: poNumber.trim(),
        expected_date: expectedDate || undefined,
        notes: notes || undefined,
        lines: validLines.map((l, i) => ({
          sku_id: l.sku_id,
          ordered_qty: l.ordered_qty,
          unit_cost: l.unit_cost ? parseFloat(l.unit_cost) : undefined,
          line_number: i + 1,
        })),
      });
      setCreatedPO({ id: result.id, po_number: result.po_number });
      setSubmitted(true);
    } catch (err) {
      console.error('Failed to create PO', err);
      setError(err instanceof Error ? err.message : 'Failed to create PO. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', height: '40px', padding: '0 12px', fontSize: '14px',
    border: '1px solid var(--border)', borderRadius: '6px',
    backgroundColor: 'var(--surface)', color: 'var(--text)',
    fontFamily: 'inherit', boxSizing: 'border-box',
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted && createdPO) {
    return (
      <DeskLayout heading="PO Created" title="Purchase Order Created">
        <div style={{ maxWidth: '480px', textAlign: 'center', margin: '64px auto', padding: '0 24px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#E8F7F0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Check size={32} style={{ color: '#0E8A4F' }} />
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700 }}>PO Created</h2>
          <p style={{ margin: '0 0 24px', color: 'var(--text-muted)' }}>
            Purchase Order <strong>{createdPO.po_number}</strong> has been created successfully.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--surface)', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
            >
              <Printer size={14} /> Print PO
            </button>
            <button
              onClick={() => navigate('/inward/purchase-orders')}
              style={{ padding: '10px 20px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
            >
              View All POs
            </button>
          </div>
        </div>
        <PrintablePO
          poNumber={createdPO.po_number}
          vendorName={selectedVendor?.name ?? ''}
          vendorGstin={selectedVendor?.gstin ?? ''}
          expectedDate={expectedDate ? new Date(expectedDate).toLocaleDateString('en-IN') : ''}
          notes={notes}
          lines={lines.filter((l) => l.sku_id)}
        />
      </DeskLayout>
    );
  }

  // ── Step 1: PO header details ───────────────────────────────────────────────
  if (step === 1) {
    return (
      <DeskLayout heading="Create Purchase Order" title="Create PO">
        <div style={{ maxWidth: '600px' }}>
          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', fontSize: '13px' }}>
            <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>Step 1</span>
            <span style={{ color: 'var(--text-muted)' }}>PO Details</span>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
            <span style={{ color: 'var(--text-muted)' }}>Step 2</span>
            <span style={{ color: 'var(--text-muted)' }}>Add Lines</span>
          </div>

          {vendors.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>No suppliers yet.</p>
              <button
                onClick={() => navigate('/vendors')}
                style={{ padding: '8px 16px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
              >
                Add Vendor first
              </button>
            </div>
          ) : (
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Vendor *</label>
                <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setError(null); }} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select vendor…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name} {v.city ? `(${v.city})` : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>PO Number *</label>
                <input type="text" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Expected Delivery Date</label>
                <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Notes</label>
                <textarea
                  value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'vertical' }}
                  placeholder="Delivery instructions, terms…"
                />
              </div>

              {error && <p role="alert" style={{ margin: 0, color: 'var(--scan-error)', fontSize: '13px', fontWeight: 500 }}>{error}</p>}

              <div style={{ display: 'flex', gap: '10px', paddingTop: '8px' }}>
                <button
                  onClick={() => navigate('/inward/purchase-orders')}
                  style={{ padding: '10px 20px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--surface)', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleNext}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit' }}
                >
                  Next: Add Lines <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </DeskLayout>
    );
  }

  // ── Step 2: Line items ──────────────────────────────────────────────────────
  return (
    <DeskLayout heading="Create Purchase Order" title="Create PO — Lines">
      <div style={{ maxWidth: '960px' }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-muted)' }}>Step 1</span>
          <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>Step 2</span>
          <span style={{ color: 'var(--brand-primary)' }}>Add Lines</span>
          {selectedVendor && (
            <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
              Vendor: <strong style={{ color: 'var(--text)' }}>{selectedVendor.name}</strong>
              {' · '}PO# <strong style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{poNumber}</strong>
            </span>
          )}
        </div>

        {/* Line items table */}
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Line Items</span>
            <button
              onClick={() => setLines((prev) => [...prev, newRow()])}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--surface)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}
            >
              <Plus size={12} /> Add Line
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-sunken)' }}>
                  {['#', 'SKU Code / Name', 'Description', 'Qty', 'Unit Cost (₹)', 'Amount', ''].map((h) => (
                    <th key={h} style={{ padding: '8px 8px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    index={i}
                    onChange={(updated) => updateLine(i, updated)}
                    onRemove={() => removeLine(i)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '24px', fontSize: '14px' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              Total units: <strong>{lines.reduce((s, l) => s + l.ordered_qty, 0).toLocaleString('en-IN')}</strong>
            </span>
            {totalValue > 0 && (
              <span style={{ color: 'var(--text-muted)' }}>
                Total value: <strong>₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
              </span>
            )}
          </div>
        </div>

        {error && <p role="alert" style={{ color: 'var(--scan-error)', fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { setError(null); setStep(1); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--surface)', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
          >
            <ArrowLeft size={14} /> Back
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            style={{ padding: '10px 24px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : 'Save PO'}
          </button>
        </div>
      </div>
    </DeskLayout>
  );
}
