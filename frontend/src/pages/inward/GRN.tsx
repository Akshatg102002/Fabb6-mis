import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeskLayout } from '@/components/layout/DeskLayout';
import { Button } from '@/components/ui/Button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGRNList, type GRN as GRNType, type GRNStatus } from '@/api/queries/grn';
import { usePOList, type PurchaseOrder, type POStatus } from '@/api/queries/pos';
import { apiClient } from '@/api/client';
import { useSingleSite } from '@/hooks/useSingleSite';

// ── Status badges ──────────────────────────────────────────────────────────

function grnStatusBadge(status: GRNStatus) {
  const map: Record<GRNStatus, { label: string; color: string; bg: string }> = {
    draft: { label: 'Draft', color: '#5A6884', bg: '#F5F7FA' },
    open: { label: 'Open', color: '#0B4F9C', bg: '#E8F0FB' },
    partial: { label: 'Partial', color: '#C77700', bg: '#FFF7E6' },
    complete: { label: 'Complete', color: '#0E8A4F', bg: '#E8F7F0' },
    closed: { label: 'Closed', color: '#5A6884', bg: '#F5F7FA' },
  };
  const cfg = map[status] ?? map.open;
  return (
    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: cfg.color, backgroundColor: cfg.bg, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {cfg.label}
    </span>
  );
}

function poStatusBadge(status: POStatus) {
  const map: Record<POStatus, { label: string; color: string; bg: string }> = {
    draft: { label: 'Draft', color: '#5A6884', bg: '#F5F7FA' },
    confirmed: { label: 'Confirmed', color: '#0B4F9C', bg: '#E8F0FB' },
    partial: { label: 'Partial', color: '#C77700', bg: '#FFF7E6' },
    received: { label: 'Received', color: '#0E8A4F', bg: '#E8F7F0' },
    cancelled: { label: 'Cancelled', color: '#C42B1C', bg: '#FEE2E2' },
  };
  const cfg = map[status] ?? map.confirmed;
  return (
    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: cfg.color, backgroundColor: cfg.bg, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {cfg.label}
    </span>
  );
}

// ── GRN Card ────────────────────────────────────────────────────────────────

function GRNCard({ grn, onSelect }: { grn: GRNType; onSelect: () => void }) {
  const received = grn.lines.reduce((s, l) => s + l.receivedQty, 0);
  const expected = grn.lines.reduce((s, l) => s + l.expectedQty, 0);
  const lineCount = grn.lineCount ?? grn.lines.length;

  return (
    <button
      onClick={onSelect}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', backgroundColor: 'var(--surface)', border: '2px solid var(--border)', borderRadius: '12px', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit', transition: 'border-color 80ms ease' }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-primary)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text)' }}>{grn.reference}</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{grn.supplierName}</div>
        </div>
        {grnStatusBadge(grn.status)}
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        {lineCount} line{lineCount !== 1 ? 's' : ''} &middot;{' '}
        <span>{received}</span> / <span>{expected}</span> received
      </div>
      {grn.expectedAt && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Expected: {new Date(grn.expectedAt).toLocaleDateString('en-IN')}
        </div>
      )}
    </button>
  );
}

// ── PO Card ─────────────────────────────────────────────────────────────────

function POCard({ po, onReceive }: { po: PurchaseOrder; onReceive: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {po.po_number}
          </div>
          {po.expected_date && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Expected: {new Date(po.expected_date).toLocaleDateString('en-IN')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {poStatusBadge(po.status)}
          {(po.status === 'confirmed' || po.status === 'partial') && (
            <Button variant="primary" size="sm" onClick={onReceive}>
              Receive
            </Button>
          )}
        </div>
      </div>
      {po.notes && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{po.notes}</div>
      )}
    </div>
  );
}

// ── Create PO Modal ─────────────────────────────────────────────────────────

interface Vendor { id: string; name: string; vendor_code: string | null; }
interface PoLineInput { skuCode: string; skuId: string | null; skuName: string; orderedQty: number; unitCost: number | ''; err: string; }

const today = new Date().toISOString().split('T')[0]!;

async function lookupSkuByCode(code: string): Promise<{ id: string; name: string } | null> {
  try {
    const res = await apiClient<{ data: { id: string; name: string; code: string }[] }>(
      `/skus?code=${encodeURIComponent(code.trim())}`,
    );
    return res.data[0] ?? null;
  } catch {
    return null;
  }
}

function emptyLine(): PoLineInput {
  return { skuCode: '', skuId: null, skuName: '', orderedQty: 1, unitCost: '', err: '' };
}

function CreatePOModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { siteId } = useSingleSite();

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: () => apiClient<Vendor[]>('/vendors'),
    staleTime: 60_000,
  });

  const { data: nextRef } = useQuery<{ ref: string }>({
    queryKey: ['purchase-orders', 'next-ref'],
    queryFn: () => apiClient<{ ref: string }>('/purchase-orders/next-ref'),
    staleTime: 0,
  });

  const [step, setStep] = useState<'header' | 'lines'>('header');
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PoLineInput[]>([emptyLine()]);
  const [error, setError] = useState('');

  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (body: {
      supplier_id: string; site_id: string; po_number: string;
      expected_date?: string; notes?: string;
      lines: { sku_id: string; ordered_qty: number; unit_cost?: number; line_number: number }[];
    }) => apiClient('/purchase-orders', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      onCreated();
    },
    onError: () => setError('Failed to create PO. Please try again.'),
  });

  const fieldStyle: React.CSSProperties = {
    height: '40px', padding: '0 10px', fontSize: '14px', border: '1px solid var(--border)',
    borderRadius: '6px', backgroundColor: 'var(--surface-sunken)', color: 'var(--text)', fontFamily: 'inherit', width: '100%',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
  };

  const poNumber = nextRef?.ref ?? '';
  const canGoNext = !!supplierId && !!siteId && !!poNumber;
  const resolvedLines = lines.filter((l) => !!l.skuId);
  const canSubmit = canGoNext && resolvedLines.length > 0;

  async function resolveLineCode(idx: number) {
    const line = lines[idx];
    if (!line || !line.skuCode.trim()) return;
    const found = await lookupSkuByCode(line.skuCode.trim());
    setLines((prev) => prev.map((l, i) => i === idx
      ? { ...l, skuId: found?.id ?? null, skuName: found?.name ?? '', err: found ? '' : `SKU "${l.skuCode}" not found` }
      : l,
    ));
  }

  function addLine() { setLines((prev) => [...prev, emptyLine()]); }
  function removeLine(idx: number) { setLines((prev) => prev.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, patch: Partial<PoLineInput>) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }

  function submitPO() {
    const validLines = resolvedLines.map((l, i) => ({
      sku_id: l.skuId!,
      ordered_qty: l.orderedQty,
      unit_cost: l.unitCost !== '' ? Number(l.unitCost) : undefined,
      line_number: i + 1,
    }));
    create.mutate({
      supplier_id: supplierId,
      site_id: siteId!,
      po_number: poNumber,
      expected_date: expectedDate || undefined,
      notes: notes || undefined,
      lines: validLines,
    });
  }

  const noVendors = vendors !== undefined && vendors.length === 0;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <div style={{ backgroundColor: 'var(--surface)', borderRadius: '12px', width: '100%', maxWidth: '560px', maxHeight: '90dvh', overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Create Purchase Order</h2>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Step {step === 'header' ? '1' : '2'} of 2</span>
        </div>

        {step === 'header' && (
          <>
            {/* Auto-generated PO number */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>PO Number</label>
              <input type="text" value={poNumber || 'Generating…'} readOnly
                style={{ ...fieldStyle, backgroundColor: 'var(--surface)', color: poNumber ? 'var(--brand-primary)' : 'var(--text-muted)', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", cursor: 'default' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Supplier <span style={{ color: 'var(--scan-error)' }}>*</span></label>
              {noVendors ? (
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--scan-warn, #c77700)' }}>
                  No vendors found. <a href="/vendors" style={{ color: 'var(--brand-primary)' }}>Add a vendor first.</a>
                </p>
              ) : (
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={fieldStyle}>
                  <option value="">Select supplier…</option>
                  {vendors?.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}{v.vendor_code ? ` (${v.vendor_code})` : ''}</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Expected Date</label>
              <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} style={fieldStyle} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" rows={3}
                style={{ padding: '8px 10px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--surface-sunken)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
              <Button variant="primary" size="md" disabled={!canGoNext} onClick={() => setStep('lines')}>
                Next: Add Lines →
              </Button>
            </div>
          </>
        )}

        {step === 'lines' && (
          <>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              PO <strong style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text)' }}>{poNumber}</strong>
              {' · '}{vendors?.find((v) => v.id === supplierId)?.name ?? ''}
            </div>

            {/* Lines table */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                    {['SKU Code', 'Name', 'Qty', 'Cost (₹)', ''].map((h) => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', minWidth: '120px' }}>
                        <input
                          type="text"
                          value={line.skuCode}
                          placeholder="SKU001"
                          onChange={(e) => updateLine(idx, { skuCode: e.target.value, skuId: null, skuName: '', err: '' })}
                          onBlur={() => void resolveLineCode(idx)}
                          style={{ width: '100%', height: '32px', padding: '0 8px', fontSize: '13px', border: `1px solid ${line.err ? 'var(--scan-error)' : 'var(--border)'}`, borderRadius: '4px', backgroundColor: 'var(--surface-sunken)', color: 'var(--text)', fontFamily: "'IBM Plex Mono', monospace" }}
                        />
                        {line.err && <div style={{ fontSize: '11px', color: 'var(--scan-error)', marginTop: '2px' }}>{line.err}</div>}
                      </td>
                      <td style={{ padding: '6px 8px', color: line.skuId ? 'var(--text)' : 'var(--text-muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {line.skuName || (line.skuId ? '' : '—')}
                      </td>
                      <td style={{ padding: '6px 8px', width: '70px' }}>
                        <input type="number" min="1" value={line.orderedQty}
                          onChange={(e) => updateLine(idx, { orderedQty: Number(e.target.value) })}
                          style={{ width: '100%', height: '32px', padding: '0 6px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '4px', backgroundColor: 'var(--surface-sunken)', color: 'var(--text)', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '6px 8px', width: '90px' }}>
                        <input type="number" min="0" step="0.01" value={line.unitCost}
                          onChange={(e) => updateLine(idx, { unitCost: e.target.value === '' ? '' : Number(e.target.value) })}
                          placeholder="0.00"
                          style={{ width: '100%', height: '32px', padding: '0 6px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '4px', backgroundColor: 'var(--surface-sunken)', color: 'var(--text)', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        {lines.length > 1 && (
                          <button onClick={() => removeLine(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--scan-error)', fontSize: '16px', lineHeight: 1 }}>×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={addLine} style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--border)', borderRadius: '6px', padding: '6px 12px', fontSize: '13px', color: 'var(--brand-primary)', cursor: 'pointer', fontFamily: 'inherit' }}>
              + Add Line
            </button>

            {error && <p style={{ margin: 0, color: 'var(--scan-error)', fontSize: '13px' }}>{error}</p>}

            {resolvedLines.length === 0 && lines.some((l) => l.skuCode) && (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--scan-warn, #c77700)' }}>
                Enter valid SKU codes and tab out to resolve them before creating.
              </p>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="md" onClick={() => setStep('header')}>← Back</Button>
              <Button variant="primary" size="md" loading={create.isPending} disabled={!canSubmit} onClick={submitPO}>
                Create PO ({resolvedLines.length} line{resolvedLines.length !== 1 ? 's' : ''})
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function GRN() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'pos' | 'grns'>('grns');
  const [showBlind, setShowBlind] = useState(false);
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: grns, isLoading: grnsLoading, error: grnsError } = useGRNList('open');
  const { data: poData, isLoading: posLoading, error: posError } = usePOList('confirmed');
  const pos = poData?.data ?? [];

  const { data: nextGrnRef } = useQuery<{ ref: string }>({
    queryKey: ['grn', 'next-ref'],
    queryFn: () => apiClient<{ ref: string }>('/grn/next-ref'),
    staleTime: 0,
    enabled: showBlind,
  });

  async function startBlindReceive() {
    const ref = nextGrnRef?.ref;
    if (!ref) return;
    setCreating(true);
    try {
      const grn = await apiClient<GRNType>('/grn', { method: 'POST', body: { reference: ref, blind: true } });
      navigate(`/inward/receive/${grn.id}`);
    } catch {
      // error handled by apiClient
    } finally {
      setCreating(false);
    }
  }

  async function receiveAgainstPO(po: PurchaseOrder) {
    setCreating(true);
    try {
      const grn = await apiClient<GRNType>('/grn', {
        method: 'POST',
        body: { reference: po.po_number, supplier_id: po.supplier_id, po_id: po.id },
      });
      navigate(`/inward/receive/${grn.id}`);
    } catch {
      // error handled by apiClient
    } finally {
      setCreating(false);
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
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
  });

  return (
    <DeskLayout
      heading="GRN / Receiving"
      breadcrumbs={[{ label: 'Home', to: '/home' }, { label: 'GRN / Receiving' }]}
      toolbar={
        activeTab === 'pos' ? (
          <Button variant="primary" size="md" onClick={() => setShowCreatePO(true)}>
            + New PO
          </Button>
        ) : (
          <Button variant="secondary" size="md" onClick={() => setShowBlind((v) => !v)}>
            {showBlind ? 'Cancel' : 'Blind Receive'}
          </Button>
        )
      }
    >
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '16px', gap: '4px' }}>
        <button style={tabStyle(activeTab === 'grns')} onClick={() => setActiveTab('grns')}>GRNs</button>
        <button style={tabStyle(activeTab === 'pos')} onClick={() => setActiveTab('pos')}>Purchase Orders</button>
      </div>

      {/* GRNs Tab */}
      {activeTab === 'grns' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {showBlind && (
            <div style={{ backgroundColor: 'var(--surface)', border: '2px solid var(--brand-primary)', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '1.0625rem' }}>Blind Receive — no PO</p>
              <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Auto-assigned GRN number</div>
                <div style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--brand-primary)' }}>
                  {nextGrnRef?.ref ?? 'Generating…'}
                </div>
              </div>
              <Button variant="primary" size="lg" fullWidth loading={creating} disabled={!nextGrnRef?.ref} onClick={() => void startBlindReceive()}>
                Start Blind Receive
              </Button>
            </div>
          )}

          <h2 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Open GRNs
          </h2>

          {grnsLoading && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Loading…</p>}
          {grnsError && <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>Failed to load GRNs</p>}
          {grns && grns.length === 0 && !grnsLoading && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 1rem', fontSize: '1.0625rem' }}>
              No open GRNs.<br />Use Blind Receive or check with your supervisor.
            </div>
          )}
          {grns?.map((grn) => (
            <GRNCard key={grn.id} grn={grn} onSelect={() => navigate(`/inward/receive/${grn.id}`)} />
          ))}
        </div>
      )}

      {/* POs Tab */}
      {activeTab === 'pos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Confirmed Purchase Orders
          </h2>

          {posLoading && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Loading…</p>}
          {posError && <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>Failed to load purchase orders</p>}
          {pos.length === 0 && !posLoading && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 1rem', fontSize: '1.0625rem' }}>
              No confirmed POs.<br />Create a new PO or confirm a draft PO.
            </div>
          )}
          {pos.map((po) => (
            <POCard key={po.id} po={po} onReceive={() => void receiveAgainstPO(po)} />
          ))}
        </div>
      )}

      {showCreatePO && (
        <CreatePOModal onClose={() => setShowCreatePO(false)} onCreated={() => setShowCreatePO(false)} />
      )}
    </DeskLayout>
  );
}
