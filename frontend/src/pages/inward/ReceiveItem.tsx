import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { FloorLayout } from '@/components/layout/FloorLayout';
import { ScanResult } from '@/components/scan/ScanResult';
import { ManualEntry } from '@/components/scan/ManualEntry';
import { Button } from '@/components/ui/Button';
import { useScanner } from '@/hooks/useScanner';
import { useAudio } from '@/hooks/useAudio';
import { useGRN, useReceiveItem } from '@/api/queries/grn';
import { useItemByBarcode } from '@/api/queries/inventory';

type Step = 'scan-item' | 'enter-batch' | 'enter-expiry' | 'enter-qty' | 'confirm';
type ScanStatus = 'idle' | 'ok' | 'warn' | 'error';

export default function ReceiveItem() {
  const { grnId = '' } = useParams<{ grnId: string }>();
  const { reject, warning } = useAudio();

  const { data: grn, isLoading } = useGRN(grnId);
  const receiveItem = useReceiveItem();

  const [step, setStep] = useState<Step>('scan-item');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [qty, setQty] = useState('');
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanMessage, setScanMessage] = useState('Scan item barcode');
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { data: skuData } = useItemByBarcode(scannedBarcode, scannedBarcode.length > 0);

  const handleScan = useCallback(
    (barcode: string) => {
      if (step !== 'scan-item') return;
      setScannedBarcode(barcode);
      setScanStatus('ok');
      setScanMessage('Item found');
      setStep('enter-batch');
    },
    [step],
  );

  const { submitManual } = useScanner(handleScan, { disabled: step !== 'scan-item' });

  function handleAccept() {
    if (!grn || !scannedBarcode || !qty) return;
    const line = grn.lines.find((l) => l.barcode === scannedBarcode);
    if (!line) return;

    receiveItem.mutate(
      {
        grnId,
        lineId: line.id,
        barcode: scannedBarcode,
        qty: Number(qty),
        locationId: 'GRN-STAGING',
      },
      {
        onSuccess: () => {
          setScanStatus('ok');
          setScanMessage('Received');
          resetFlow();
        },
        onError: () => {
          setScanStatus('error');
          setScanMessage('Receive failed');
          reject();
        },
      },
    );
  }

  function handleReject() {
    warning();
    setRejecting(true);
  }

  function submitReject() {
    setScanStatus('warn');
    setScanMessage('Item rejected');
    setRejecting(false);
    resetFlow();
  }

  function resetFlow() {
    setTimeout(() => {
      setStep('scan-item');
      setScannedBarcode('');
      setBatch('');
      setExpiry('');
      setQty('');
      setScanStatus('idle');
      setScanMessage('Scan item barcode');
      setRejecting(false);
      setRejectReason('');
    }, 1500);
  }

  if (isLoading) {
    return (
      <FloorLayout heading="Receive Item" backTo="/inward">
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading GRN…
        </div>
      </FloorLayout>
    );
  }

  if (!grn) {
    return (
      <FloorLayout heading="Receive Item" backTo="/inward">
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--scan-error)' }}>
          GRN not found
        </div>
      </FloorLayout>
    );
  }

  return (
    <FloorLayout
      heading="Receive Item"
      subheading={grn.reference}
      backTo="/inward"
      footer={
        step === 'confirm' ? (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button
              variant="danger"
              size="floor"
              fullWidth
              onClick={handleReject}
            >
              Reject
            </Button>
            <Button
              variant="primary"
              size="floor"
              fullWidth
              loading={receiveItem.isPending}
              onClick={handleAccept}
            >
              Accept
            </Button>
          </div>
        ) : undefined
      }
    >
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Scan result panel */}
        <ScanResult status={scanStatus} message={scanMessage} />

        {/* Step: scan item */}
        {step === 'scan-item' && (
          <ManualEntry
            label="Or type barcode"
            placeholder="Barcode…"
            onSubmit={submitManual}
          />
        )}

        {/* SKU info after scan */}
        {scannedBarcode && skuData && (
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              SKU
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>
              {skuData.name}
            </div>
            <div style={{ fontSize: '1rem', color: 'var(--text-muted)', fontFamily: "'IBM Plex Mono', monospace" }}>
              {skuData.sku}
            </div>
          </div>
        )}

        {/* Step: batch */}
        {step === 'enter-batch' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Batch Number
            </label>
            <input
              type="text"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="Scan or type batch…"
              autoFocus
              style={{
                height: '56px',
                padding: '0 1rem',
                fontSize: '1.25rem',
                border: '2px solid var(--border)',
                borderRadius: '8px',
                backgroundColor: 'var(--surface-sunken)',
                color: 'var(--text)',
                fontFamily: 'inherit',
              }}
            />
            <Button
              variant="primary"
              size="floor"
              fullWidth
              disabled={!batch.trim()}
              onClick={() => setStep('enter-expiry')}
            >
              Next
            </Button>
          </div>
        )}

        {/* Step: expiry */}
        {step === 'enter-expiry' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Expiry Date
            </label>
            <input
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              autoFocus
              style={{
                height: '56px',
                padding: '0 1rem',
                fontSize: '1.25rem',
                border: '2px solid var(--border)',
                borderRadius: '8px',
                backgroundColor: 'var(--surface-sunken)',
                color: 'var(--text)',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button variant="ghost" size="lg" fullWidth onClick={() => { setExpiry(''); setStep('enter-qty'); }}>
                No Expiry
              </Button>
              <Button
                variant="primary"
                size="floor"
                fullWidth
                disabled={!expiry}
                onClick={() => setStep('enter-qty')}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step: quantity */}
        {step === 'enter-qty' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Quantity
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              autoFocus
              style={{
                height: '72px',
                padding: '0 1rem',
                fontSize: '2rem',
                fontWeight: 700,
                border: '2px solid var(--border)',
                borderRadius: '8px',
                backgroundColor: 'var(--surface-sunken)',
                color: 'var(--text)',
                fontFamily: "'IBM Plex Mono', monospace",
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'center',
              }}
            />
            <Button
              variant="primary"
              size="floor"
              fullWidth
              disabled={!qty || Number(qty) <= 0}
              onClick={() => setStep('confirm')}
            >
              Confirm
            </Button>
          </div>
        )}

        {/* Reject modal */}
        {rejecting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--scan-error)' }}>
              Rejection Reason
            </label>
            <select
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{
                height: '56px',
                padding: '0 1rem',
                fontSize: '1rem',
                border: '2px solid var(--scan-error)',
                borderRadius: '8px',
                backgroundColor: 'var(--surface)',
                color: 'var(--text)',
                fontFamily: 'inherit',
              }}
            >
              <option value="">Select reason…</option>
              <option value="damaged">Damaged</option>
              <option value="wrong_item">Wrong Item</option>
              <option value="short_expiry">Short Expiry</option>
              <option value="over_delivery">Over Delivery</option>
              <option value="other">Other</option>
            </select>
            <Button
              variant="danger"
              size="lg"
              fullWidth
              disabled={!rejectReason}
              onClick={submitReject}
            >
              Confirm Rejection
            </Button>
          </div>
        )}
      </div>
    </FloorLayout>
  );
}
