import { useState, useCallback } from 'react';
import { DeskLayout } from '@/components/layout/DeskLayout';
import { ScanResult } from '@/components/scan/ScanResult';
import { ManualEntry } from '@/components/scan/ManualEntry';
import { Button } from '@/components/ui/Button';
import { useScanner } from '@/hooks/useScanner';
import { useAudio } from '@/hooks/useAudio';
import { usePackingQueue, type PackOrder as PackOrderType } from '@/api/queries/packing';
import { apiClient } from '@/api/client';

type Step = 'scan-tote' | 'scan-item' | 'enter-weight' | 'dispatching';
type ScanStatus = 'idle' | 'ok' | 'warn' | 'error';

interface PackLine {
  sku: string;
  name: string;
  qty: number;
  scanned: number;
  uom: string;
}

interface PackOrderData {
  orderId: string;
  orderRef: string;
  customerName: string;
  lines: PackLine[];
}

function priorityBadge(priority: PackOrderType['priority']) {
  const cfg = {
    normal: { label: 'Normal', color: '#5A6884', bg: '#F5F7FA' },
    urgent: { label: 'Urgent', color: '#C47700', bg: '#FFF7E6' },
    same_day: { label: 'Same Day', color: '#C42B1C', bg: '#FEE2E2' },
  }[priority] ?? { label: priority, color: '#5A6884', bg: '#F5F7FA' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: cfg.color, backgroundColor: cfg.bg }}>
      {cfg.label}
    </span>
  );
}

export default function PackOrder() {
  const [step, setStep] = useState<Step>('scan-tote');
  const [toteBarcode, setToteBarcode] = useState('');
  const [order, setOrder] = useState<PackOrderData | null>(null);
  const [weight, setWeight] = useState('');
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanMessage, setScanMessage] = useState('Scan tote barcode');
  const [loading, setLoading] = useState(false);
  const [showQueue, setShowQueue] = useState(true);

  const { reject } = useAudio();
  const { data: queue } = usePackingQueue();

  async function loadTote(barcode: string) {
    setLoading(true);
    try {
      const data = await apiClient<PackOrderData>(`/packing/tote/${encodeURIComponent(barcode)}`);
      setToteBarcode(barcode);
      setOrder(data);
      setScanStatus('ok');
      setScanMessage('Tote loaded — scan items');
      setStep('scan-item');
    } catch {
      setScanStatus('error');
      setScanMessage('Tote not found');
      reject();
      setTimeout(() => {
        setScanStatus('idle');
        setScanMessage('Scan tote barcode');
      }, 1500);
    } finally {
      setLoading(false);
    }
  }

  function handleItemScan(barcode: string) {
    if (!order) return;
    const lineIdx = order.lines.findIndex((l) => l.sku === barcode);
    if (lineIdx === -1) {
      setScanStatus('error');
      setScanMessage('Item not in order');
      reject();
      return;
    }
    const line = order.lines[lineIdx];
    if (line.scanned >= line.qty) {
      setScanStatus('warn');
      setScanMessage('Already packed');
      return;
    }
    const updated = order.lines.map((l, i) => i === lineIdx ? { ...l, scanned: l.scanned + 1 } : l);
    setOrder({ ...order, lines: updated });
    setScanStatus('ok');
    setScanMessage(`${line.name} scanned`);
    const allDone = updated.every((l) => l.scanned >= l.qty);
    if (allDone) {
      setScanMessage('All items packed — enter weight');
      setStep('enter-weight');
    }
  }

  const handleScan = useCallback(
    (barcode: string) => {
      if (step === 'scan-tote') void loadTote(barcode);
      else if (step === 'scan-item') handleItemScan(barcode);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, order],
  );

  const { submitManual } = useScanner(handleScan, {
    disabled: loading || step === 'enter-weight' || step === 'dispatching',
  });

  async function dispatch() {
    if (!order) return;
    setStep('dispatching');
    setLoading(true);
    try {
      await apiClient('/packing/dispatch', {
        method: 'POST',
        body: { orderId: order.orderId, toteBarcode, weight: weight ? Number(weight) : undefined },
      });
      setScanStatus('ok');
      setScanMessage('Dispatched!');
      setTimeout(reset, 2000);
    } catch {
      setScanStatus('error');
      setScanMessage('Dispatch failed — retry');
      setStep('enter-weight');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep('scan-tote');
    setToteBarcode('');
    setOrder(null);
    setWeight('');
    setScanStatus('idle');
    setScanMessage('Scan tote barcode');
  }

  const allPacked = order?.lines.every((l) => l.scanned >= l.qty) ?? false;
  const hasQueue = queue && queue.length > 0;

  return (
    <DeskLayout
      heading="Pack Order"
      breadcrumbs={[{ label: 'Home', to: '/home' }, { label: 'Pack Order' }]}
      footer={
        step === 'enter-weight' ? (
          <Button variant="primary" size="floor" fullWidth loading={loading} onClick={() => void dispatch()}>
            Dispatch
          </Button>
        ) : step === 'scan-item' && allPacked ? (
          <Button variant="primary" size="floor" fullWidth onClick={() => setStep('enter-weight')}>
            Enter Weight & Dispatch
          </Button>
        ) : undefined
      }
    >
      {/* Packing queue */}
      {hasQueue && (
        <div style={{ marginBottom: '1.5rem', backgroundColor: '#FFFFFF', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          <button
            onClick={() => setShowQueue((v) => !v)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
              Ready to Pack ({queue.length})
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{showQueue ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {showQueue && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-sunken)', borderTop: '1px solid var(--border)' }}>
                    {['Order', 'Customer', 'Priority', 'Items', 'Due'].map((h) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queue.map((ord) => (
                    <tr
                      key={ord.id}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--surface-sunken)')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '8px 12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', whiteSpace: 'nowrap' }}>{ord.orderRef}</td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{ord.customerName}</td>
                      <td style={{ padding: '8px 12px' }}>{priorityBadge(ord.priority)}</td>
                      <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>{ord.items.length}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {ord.dueAt ? new Date(ord.dueAt).toLocaleDateString('en-IN') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Scan section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <ScanResult status={scanStatus} message={scanMessage} />

        {step === 'scan-tote' && (
          <ManualEntry label="Or type tote barcode" placeholder="TOTE-…" onSubmit={submitManual} />
        )}

        {order && (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-sunken)' }}>
              <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>{order.orderRef}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{order.customerName}</div>
            </div>
            {order.lines.map((line, i) => {
              const done = line.scanned >= line.qty;
              return (
                <div key={i} style={{ padding: '0.75rem 1rem', borderBottom: i < order.lines.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: done ? 0.55 : 1 }}>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: done ? 400 : 600, textDecoration: done ? 'line-through' : 'none' }}>{line.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: "'IBM Plex Mono', monospace" }}>{line.sku}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1.25rem', color: done ? 'var(--scan-ok)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {line.scanned}/{line.qty}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {step === 'scan-item' && !allPacked && (
          <ManualEntry label="Or type item barcode" placeholder="Scan barcode…" onSubmit={submitManual} />
        )}

        {step === 'enter-weight' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Parcel Weight (kg) — optional
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="0.00"
              autoFocus
              style={{ height: '72px', padding: '0 1rem', fontSize: '2.5rem', fontWeight: 700, border: '2px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--surface-sunken)', color: 'var(--text)', fontFamily: "'IBM Plex Mono', monospace", textAlign: 'center' }}
            />
          </div>
        )}
      </div>
    </DeskLayout>
  );
}
