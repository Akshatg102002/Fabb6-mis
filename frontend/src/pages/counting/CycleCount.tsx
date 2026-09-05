import { useState, useCallback } from 'react';
import { FloorLayout, FloorQuantity } from '@/components/layout/FloorLayout';
import { ScanResult } from '@/components/scan/ScanResult';
import { ManualEntry } from '@/components/scan/ManualEntry';
import { Button } from '@/components/ui/Button';
import { useScanner } from '@/hooks/useScanner';
import { useAudio } from '@/hooks/useAudio';
import { apiClient } from '@/api/client';

type Step = 'idle' | 'counting' | 'submitting' | 'done';
type ScanStatus = 'idle' | 'ok' | 'warn' | 'error';

interface CountAssignment {
  countId: string;
  locationCode: string;
  locationId: string;
}

interface ScannedItem {
  barcode: string;
  sku: string | null;
  name: string | null;
  qty: number;
}

export default function CycleCount() {
  const [step, setStep] = useState<Step>('idle');
  const [assignment, setAssignment] = useState<CountAssignment | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanMessage, setScanMessage] = useState('Load your assigned count location');
  const [loading, setLoading] = useState(false);

  const { reject } = useAudio();

  async function loadAssignment() {
    setLoading(true);
    try {
      const data = await apiClient<CountAssignment>('/cycle-count/my-assignment');
      setAssignment(data);
      setStep('counting');
      setScanStatus('ok');
      setScanMessage(`Count location ${data.locationCode}`);
    } catch {
      setScanStatus('error');
      setScanMessage('No assignment found');
      reject();
    } finally {
      setLoading(false);
    }
  }

  async function handleItemScan(barcode: string) {
    // Look up SKU via scan cache or API
    let sku: string | null = null;
    let name: string | null = null;
    try {
      const res = await apiClient<{ sku: string; name: string } | null>(
        `/gtins/lookup?barcode=${encodeURIComponent(barcode)}`,
      );
      sku = res?.sku ?? null;
      name = res?.name ?? null;
    } catch {
      // proceed with unknown SKU
    }

    setScannedItems((prev) => {
      const existing = prev.findIndex((it) => it.barcode === barcode);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], qty: updated[existing].qty + 1 };
        setScanStatus('ok');
        setScanMessage(`+1 — ${updated[existing].name ?? barcode}`);
        return updated;
      }
      setScanStatus('ok');
      setScanMessage(`Added: ${name ?? barcode}`);
      return [...prev, { barcode, sku, name, qty: 1 }];
    });
  }

  const handleScan = useCallback(
    (barcode: string) => {
      if (step === 'counting') void handleItemScan(barcode);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step],
  );

  const { submitManual } = useScanner(handleScan, { disabled: step !== 'counting' });

  async function submitCount() {
    if (!assignment) return;
    setStep('submitting');
    try {
      await apiClient('/cycle-count/submit', {
        method: 'POST',
        body: {
          countId: assignment.countId,
          locationId: assignment.locationId,
          items: scannedItems.map((it) => ({ barcode: it.barcode, qty: it.qty })),
        },
      });
      setStep('done');
      setScanStatus('ok');
      setScanMessage('Count submitted — thank you!');
    } catch {
      setScanStatus('error');
      setScanMessage('Submit failed — try again');
      setStep('counting');
    }
  }

  function removeItem(barcode: string) {
    setScannedItems((prev) => prev.filter((it) => it.barcode !== barcode));
  }

  return (
    <FloorLayout
      heading="Cycle Count"
      subheading={assignment ? assignment.locationCode : undefined}
      backTo="/home"
      footer={
        step === 'counting' && scannedItems.length > 0 ? (
          <Button
            variant="primary"
            size="floor"
            fullWidth
            onClick={() => void submitCount()}
          >
            Submit Count ({scannedItems.reduce((s, it) => s + it.qty, 0)} items)
          </Button>
        ) : step === 'done' ? (
          <Button
            variant="secondary"
            size="floor"
            fullWidth
            onClick={() => {
              setStep('idle');
              setAssignment(null);
              setScannedItems([]);
              setScanStatus('idle');
              setScanMessage('Load your assigned count location');
            }}
          >
            New Count
          </Button>
        ) : undefined
      }
    >
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <ScanResult status={scanStatus} message={scanMessage} />

        {/* Load assignment */}
        {step === 'idle' && (
          <Button
            variant="primary"
            size="floor"
            fullWidth
            loading={loading}
            onClick={() => void loadAssignment()}
          >
            Load My Count Assignment
          </Button>
        )}

        {/* Active counting */}
        {assignment && step === 'counting' && (
          <>
            <div
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: '#ffffff',
                borderRadius: '12px',
                padding: '1rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.75rem', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Location
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>
                {assignment.locationCode}
              </div>
              <div style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: '0.5rem' }}>
                Blind count — system qty hidden
              </div>
            </div>

            <ManualEntry
              label="Or type barcode"
              placeholder="Scan items in this location"
              onSubmit={submitManual}
            />
          </>
        )}

        {/* Scanned items list */}
        {scannedItems.length > 0 && (
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '0.625rem 1rem',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--surface-sunken)',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Counted Items</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {scannedItems.length} SKU{scannedItems.length !== 1 ? 's' : ''}
              </span>
            </div>

            {scannedItems.map((item, i) => (
              <div
                key={item.barcode}
                style={{
                  padding: '0.75rem 1rem',
                  borderBottom: i < scannedItems.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name ?? item.barcode}
                  </div>
                  {item.sku && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {item.sku}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  <FloorQuantity label="" value={item.qty} />
                  {step === 'counting' && (
                    <button
                      onClick={() => removeItem(item.barcode)}
                      aria-label={`Remove ${item.name ?? item.barcode}`}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--scan-error)',
                        fontSize: '1.25rem',
                        padding: '0.25rem',
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div
              style={{
                padding: '0.625rem 1rem',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 700,
                backgroundColor: 'var(--surface-sunken)',
              }}
            >
              <span>Total</span>
              <span className="tabular">{scannedItems.reduce((s, it) => s + it.qty, 0)}</span>
            </div>
          </div>
        )}
      </div>
    </FloorLayout>
  );
}
