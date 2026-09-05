import { useState, useCallback } from 'react';
import { FloorLayout } from '@/components/layout/FloorLayout';
import { ScanResult } from '@/components/scan/ScanResult';
import { ManualEntry } from '@/components/scan/ManualEntry';
import { Button } from '@/components/ui/Button';
import { useScanner } from '@/hooks/useScanner';
import { useAudio } from '@/hooks/useAudio';
import { apiClient } from '@/api/client';

type Step = 'scan-awb' | 'scan-item' | 'grade' | 'done';
type ScanStatus = 'idle' | 'ok' | 'warn' | 'error';
type QcGrade = 'A' | 'B' | 'Damaged' | 'Expired';

interface ReturnItem {
  sku: string;
  name: string;
  barcode: string;
  qty: number;
  graded: boolean;
  grade: QcGrade | null;
}

interface ReturnOrder {
  awb: string;
  orderRef: string;
  items: ReturnItem[];
}

const GRADE_CONFIG: Record<QcGrade, { label: string; color: string; bg: string; disposition: string }> = {
  A: { label: 'Grade A', color: '#ffffff', bg: 'var(--scan-ok)', disposition: 'Restock' },
  B: { label: 'Grade B', color: '#ffffff', bg: 'var(--scan-warn)', disposition: 'Review' },
  Damaged: { label: 'Damaged', color: '#ffffff', bg: 'var(--scan-error)', disposition: 'Scrap / Write-off' },
  Expired: { label: 'Expired', color: '#ffffff', bg: 'var(--scan-error)', disposition: 'Destroy' },
};

export default function ReturnInward() {
  const [step, setStep] = useState<Step>('scan-awb');
  const [awb, setAwb] = useState('');
  const [returnOrder, setReturnOrder] = useState<ReturnOrder | null>(null);
  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanMessage, setScanMessage] = useState('Scan courier AWB');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { reject } = useAudio();

  async function loadAwb(barcode: string) {
    setLoading(true);
    try {
      const data = await apiClient<ReturnOrder>(`/returns/awb/${encodeURIComponent(barcode)}`);
      setAwb(barcode);
      setReturnOrder(data);
      setScanStatus('ok');
      setScanMessage('AWB found — scan items');
      setStep('scan-item');
      setCurrentItemIdx(0);
    } catch {
      setScanStatus('error');
      setScanMessage('AWB not found');
      reject();
      setTimeout(() => {
        setScanStatus('idle');
        setScanMessage('Scan courier AWB');
      }, 1500);
    } finally {
      setLoading(false);
    }
  }

  function handleItemScan(barcode: string) {
    if (!returnOrder) return;
    const item = returnOrder.items[currentItemIdx];
    if (!item) return;

    if (barcode !== item.barcode) {
      setScanStatus('warn');
      setScanMessage('Different item — check order');
      return;
    }
    setScanStatus('ok');
    setScanMessage('Item scanned — select grade');
    setStep('grade');
  }

  async function applyGrade(grade: QcGrade) {
    if (!returnOrder) return;
    const item = returnOrder.items[currentItemIdx];
    if (!item) return;

    const updatedItems = returnOrder.items.map((it, i) =>
      i === currentItemIdx ? { ...it, graded: true, grade } : it,
    );
    setReturnOrder({ ...returnOrder, items: updatedItems });

    setScanStatus(grade === 'A' ? 'ok' : grade === 'B' ? 'warn' : 'error');
    setScanMessage(`${GRADE_CONFIG[grade].label} — ${GRADE_CONFIG[grade].disposition}`);

    await new Promise((r) => setTimeout(r, 1000));

    const next = currentItemIdx + 1;
    if (next >= returnOrder.items.length) {
      setStep('done');
    } else {
      setCurrentItemIdx(next);
      setStep('scan-item');
      setScanStatus('idle');
      setScanMessage('Scan next item');
    }
  }

  async function submitReturn() {
    if (!returnOrder) return;
    setSubmitting(true);
    try {
      await apiClient('/returns/complete', {
        method: 'POST',
        body: {
          awb,
          grades: returnOrder.items.map((it) => ({ sku: it.sku, grade: it.grade })),
        },
      });
      setScanStatus('ok');
      setScanMessage('Return completed');
      setTimeout(reset, 2000);
    } catch {
      setScanStatus('error');
      setScanMessage('Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep('scan-awb');
    setAwb('');
    setReturnOrder(null);
    setCurrentItemIdx(0);
    setScanStatus('idle');
    setScanMessage('Scan courier AWB');
  }

  const handleScan = useCallback(
    (barcode: string) => {
      if (step === 'scan-awb') void loadAwb(barcode);
      else if (step === 'scan-item') handleItemScan(barcode);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, returnOrder, currentItemIdx],
  );

  const { submitManual } = useScanner(handleScan, {
    disabled: loading || step === 'grade' || step === 'done',
  });

  const currentItem = returnOrder?.items[currentItemIdx];

  return (
    <FloorLayout
      heading="Returns Inward"
      backTo="/home"
      headerRight={
        returnOrder ? (
          <span style={{ fontSize: '0.875rem', opacity: 0.75 }}>
            {currentItemIdx + 1}/{returnOrder.items.length}
          </span>
        ) : undefined
      }
      footer={
        step === 'done' ? (
          <Button
            variant="primary"
            size="floor"
            fullWidth
            loading={submitting}
            onClick={() => void submitReturn()}
          >
            Submit Return
          </Button>
        ) : undefined
      }
    >
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <ScanResult status={scanStatus} message={scanMessage} />

        {step === 'scan-awb' && (
          <ManualEntry
            label="Or type AWB number"
            placeholder="AWB…"
            onSubmit={submitManual}
          />
        )}

        {returnOrder && (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem 1rem' }}>
            <div style={{ fontWeight: 700 }}>{returnOrder.orderRef}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>AWB: {awb}</div>
          </div>
        )}

        {/* Current item info */}
        {currentItem && (step === 'scan-item' || step === 'grade') && (
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '2px solid var(--brand-primary)',
              borderRadius: '12px',
              padding: '1.25rem 1rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
              Scan this item
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{currentItem.name}</div>
            <div style={{ fontSize: '1rem', color: 'var(--text-muted)', fontFamily: "'IBM Plex Mono', monospace" }}>
              {currentItem.barcode}
            </div>
          </div>
        )}

        {/* Grade buttons */}
        {step === 'grade' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              QC Grade
            </div>
            {(Object.keys(GRADE_CONFIG) as QcGrade[]).map((grade) => {
              const cfg = GRADE_CONFIG[grade];
              return (
                <button
                  key={grade}
                  onClick={() => void applyGrade(grade)}
                  style={{
                    height: '64px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: cfg.bg,
                    color: cfg.color,
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 1.25rem',
                  }}
                >
                  <span>{cfg.label}</span>
                  <span style={{ fontSize: '0.9rem', opacity: 0.85 }}>{cfg.disposition}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Summary when done */}
        {step === 'done' && returnOrder && (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
              Summary
            </div>
            {returnOrder.items.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: '0.625rem 1rem',
                  borderBottom: i < returnOrder.items.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '0.9375rem' }}>{item.name}</span>
                {item.grade && (
                  <span
                    style={{
                      padding: '0.2rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      backgroundColor: GRADE_CONFIG[item.grade].bg,
                      color: GRADE_CONFIG[item.grade].color,
                    }}
                  >
                    {item.grade}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {step === 'scan-item' && (
          <ManualEntry
            label="Or type item barcode"
            placeholder={currentItem?.barcode}
            onSubmit={submitManual}
          />
        )}
      </div>
    </FloorLayout>
  );
}
