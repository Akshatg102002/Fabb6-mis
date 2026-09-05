import { useState, useCallback } from 'react';
import { FloorLayout } from '@/components/layout/FloorLayout';
import { ScanResult } from '@/components/scan/ScanResult';
import { ManualEntry } from '@/components/scan/ManualEntry';
import { Button } from '@/components/ui/Button';
import { useScanner } from '@/hooks/useScanner';
import { useAudio } from '@/hooks/useAudio';
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

interface PackOrder {
  orderId: string;
  orderRef: string;
  customerName: string;
  lines: PackLine[];
}

export default function PackOrder() {
  const [step, setStep] = useState<Step>('scan-tote');
  const [toteBarcode, setToteBarcode] = useState('');
  const [order, setOrder] = useState<PackOrder | null>(null);
  const [weight, setWeight] = useState('');
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanMessage, setScanMessage] = useState('Scan tote barcode');
  const [loading, setLoading] = useState(false);

  const { reject } = useAudio();

  async function loadTote(barcode: string) {
    setLoading(true);
    try {
      const data = await apiClient<PackOrder>(`/packing/tote/${encodeURIComponent(barcode)}`);
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
    const updated = order.lines.map((l, i) =>
      i === lineIdx ? { ...l, scanned: l.scanned + 1 } : l,
    );
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
        body: {
          orderId: order.orderId,
          toteBarcode,
          weight: weight ? Number(weight) : undefined,
        },
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

  return (
    <FloorLayout
      heading="Pack Order"
      backTo="/home"
      footer={
        step === 'enter-weight' ? (
          <Button
            variant="primary"
            size="floor"
            fullWidth
            loading={loading}
            onClick={() => void dispatch()}
          >
            Dispatch
          </Button>
        ) : step === 'scan-item' && allPacked ? (
          <Button
            variant="primary"
            size="floor"
            fullWidth
            onClick={() => setStep('enter-weight')}
          >
            Enter Weight & Dispatch
          </Button>
        ) : undefined
      }
    >
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <ScanResult status={scanStatus} message={scanMessage} />

        {step === 'scan-tote' && (
          <ManualEntry
            label="Or type tote barcode"
            placeholder="TOTE-…"
            onSubmit={submitManual}
          />
        )}

        {order && (
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-sunken)' }}>
              <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>{order.orderRef}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{order.customerName}</div>
            </div>
            {order.lines.map((line, i) => {
              const done = line.scanned >= line.qty;
              return (
                <div
                  key={i}
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: i < order.lines.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: done ? 0.55 : 1,
                  }}
                >
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: done ? 400 : 600, textDecoration: done ? 'line-through' : 'none' }}>
                      {line.name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {line.sku}
                    </div>
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '1.25rem',
                      color: done ? 'var(--scan-ok)' : 'var(--text)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {line.scanned}/{line.qty}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {step === 'scan-item' && !allPacked && (
          <ManualEntry
            label="Or type item barcode"
            placeholder="Scan barcode…"
            onSubmit={submitManual}
          />
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
              style={{
                height: '72px',
                padding: '0 1rem',
                fontSize: '2.5rem',
                fontWeight: 700,
                border: '2px solid var(--border)',
                borderRadius: '8px',
                backgroundColor: 'var(--surface-sunken)',
                color: 'var(--text)',
                fontFamily: "'IBM Plex Mono', monospace",
                textAlign: 'center',
              }}
            />
          </div>
        )}
      </div>
    </FloorLayout>
  );
}
