import { useState, useCallback } from 'react';
import { FloorLayout, FloorQuantity } from '@/components/layout/FloorLayout';
import { ScanResult } from '@/components/scan/ScanResult';
import { ManualEntry } from '@/components/scan/ManualEntry';
import { Button } from '@/components/ui/Button';
import { useScanner } from '@/hooks/useScanner';
import { useAudio } from '@/hooks/useAudio';
import { useSessionStore } from '@/stores/sessionStore';
import { useMyPickLists, usePickList, useConfirmPick, useShortPick, type PickLine } from '@/api/queries/picking';

type ScanStep = 'scan-bin' | 'scan-item' | 'enter-qty' | 'done';
type ScanStatus = 'idle' | 'ok' | 'warn' | 'error';

const SHORT_REASONS = ['Not in location', 'Insufficient qty', 'Damaged', 'Expired', 'Other'];

function PickLineCard({ line }: { line: PickLine }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--surface)',
        border: '2px solid var(--brand-primary)',
        borderRadius: '16px',
        padding: '1.25rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
      }}
    >
      {/* Bin — largest element */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Bin
        </div>
        <div
          style={{
            fontSize: '3rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--brand-primary)',
            fontFamily: "'IBM Plex Mono', monospace",
            lineHeight: 1.1,
          }}
        >
          {line.locationCode}
        </div>
      </div>

      {/* Product name */}
      <div style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>
        {line.skuName}
      </div>

      {/* Batch if present */}
      {line.sku && (
        <div style={{ textAlign: 'center', fontSize: '1rem', color: 'var(--text-muted)', fontFamily: "'IBM Plex Mono', monospace" }}>
          {line.sku}
        </div>
      )}

      {/* Quantity */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <FloorQuantity
          label="Pick Qty"
          value={line.requiredQty}
          unit={line.uom}
          highlight
        />
      </div>
    </div>
  );
}

export default function PickList() {
  const user = useSessionStore((s) => s.user);
  const userId = user?.id ?? '';

  const { data: lists, isLoading: listsLoading } = useMyPickLists(userId);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const { data: pickList } = usePickList(activeListId ?? '');

  const confirmPick = useConfirmPick();
  const shortPick = useShortPick();

  const [lineIndex, setLineIndex] = useState(0);
  const [scanStep, setScanStep] = useState<ScanStep>('scan-bin');
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanMessage, setScanMessage] = useState('Scan bin barcode');
  const [qtyInput, setQtyInput] = useState('');
  const [showShort, setShowShort] = useState(false);
  const [shortReason, setShortReason] = useState('');

  const { reject } = useAudio();

  const currentLine = pickList?.lines[lineIndex];

  const handleScan = useCallback(
    (barcode: string) => {
      if (!currentLine) return;

      if (scanStep === 'scan-bin') {
        if (barcode !== currentLine.locationCode) {
          setScanStatus('error');
          setScanMessage('Wrong bin — check location');
          reject();
          return;
        }
        setScanStatus('ok');
        setScanMessage('Bin confirmed — scan item');
        setScanStep('scan-item');
        return;
      }

      if (scanStep === 'scan-item') {
        if (barcode !== currentLine.barcode) {
          setScanStatus('error');
          setScanMessage('Wrong item');
          reject();
          return;
        }
        setScanStatus('ok');
        setScanMessage('Item confirmed — enter qty');
        setScanStep('enter-qty');
        setQtyInput(String(currentLine.requiredQty));
      }
    },
    [scanStep, currentLine, reject],
  );

  const { submitManual } = useScanner(handleScan, {
    disabled: scanStep === 'enter-qty' || scanStep === 'done',
  });

  function submitQty() {
    if (!currentLine || !pickList) return;
    const qty = Number(qtyInput);
    if (qty <= 0) return;

    confirmPick.mutate(
      {
        pickListId: pickList.id,
        lineId: currentLine.id,
        barcode: currentLine.barcode,
        pickedQty: qty,
        locationId: currentLine.locationId,
      },
      {
        onSuccess: () => {
          const next = lineIndex + 1;
          if (next >= (pickList?.lines.length ?? 0)) {
            setScanStep('done');
            setScanStatus('ok');
            setScanMessage('Pick list complete!');
          } else {
            setLineIndex(next);
            setScanStep('scan-bin');
            setScanStatus('idle');
            setScanMessage('Scan bin barcode');
            setQtyInput('');
          }
        },
        onError: () => {
          setScanStatus('error');
          setScanMessage('Failed to confirm — retry');
          reject();
        },
      },
    );
  }

  function submitShort() {
    if (!currentLine || !pickList || !shortReason) return;
    shortPick.mutate(
      { pickListId: pickList.id, lineId: currentLine.id, reason: shortReason },
      {
        onSuccess: () => {
          const next = lineIndex + 1;
          if (next >= (pickList?.lines.length ?? 0)) {
            setScanStep('done');
            setScanStatus('warn');
            setScanMessage('Pick list complete (with shorts)');
          } else {
            setLineIndex(next);
            setScanStep('scan-bin');
            setScanStatus('idle');
            setScanMessage('Scan bin barcode');
            setQtyInput('');
            setShowShort(false);
            setShortReason('');
          }
        },
      },
    );
  }

  // No active list yet — show list picker
  if (!activeListId) {
    return (
      <FloorLayout heading="Pick Lists" backTo="/home">
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {listsLoading && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>Loading…</p>
          )}

          {!listsLoading && (!lists || lists.length === 0) && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 1rem', fontSize: '1.125rem' }}>
              No pick lists assigned to you.
            </div>
          )}

          {lists?.map((list) => (
            <button
              key={list.id}
              onClick={() => {
                setActiveListId(list.id);
                setLineIndex(0);
                setScanStep('scan-bin');
                setScanStatus('idle');
                setScanMessage('Scan bin barcode');
              }}
              style={{
                padding: '1rem',
                backgroundColor: 'var(--surface)',
                border: '2px solid var(--border)',
                borderRadius: '12px',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>{list.reference}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Order: {list.orderRef} &middot; {list.lines.length} lines
                {list.dueAt && ` · Due: ${new Date(list.dueAt).toLocaleDateString('en-IN')}`}
              </div>
            </button>
          ))}
        </div>
      </FloorLayout>
    );
  }

  return (
    <FloorLayout
      heading="Picking"
      subheading={pickList?.reference}
      backTo={undefined}
      headerRight={
        <span style={{ fontSize: '0.875rem', opacity: 0.75 }}>
          {lineIndex + 1} / {pickList?.lines.length ?? '?'}
        </span>
      }
      footer={
        scanStep === 'enter-qty' ? (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="danger" size="lg" onClick={() => setShowShort(true)}>
              Short
            </Button>
            <Button
              variant="primary"
              size="floor"
              fullWidth
              loading={confirmPick.isPending}
              disabled={!qtyInput || Number(qtyInput) <= 0}
              onClick={submitQty}
            >
              Confirm Pick
            </Button>
          </div>
        ) : scanStep === 'done' ? (
          <Button
            variant="secondary"
            size="floor"
            fullWidth
            onClick={() => {
              setActiveListId(null);
              setScanStep('scan-bin');
              setScanStatus('idle');
              setScanMessage('Scan bin barcode');
              setLineIndex(0);
            }}
          >
            Back to Lists
          </Button>
        ) : undefined
      }
    >
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <ScanResult status={scanStatus} message={scanMessage} />

        {currentLine && scanStep !== 'done' && (
          <PickLineCard line={currentLine} />
        )}

        {/* Quantity input */}
        {scanStep === 'enter-qty' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Quantity Picked
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              autoFocus
              style={{
                height: '72px',
                padding: '0 1rem',
                fontSize: '2.5rem',
                fontWeight: 700,
                border: '2px solid var(--brand-primary)',
                borderRadius: '8px',
                backgroundColor: 'var(--surface-sunken)',
                color: 'var(--text)',
                fontFamily: "'IBM Plex Mono', monospace",
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'center',
              }}
            />
          </div>
        )}

        {/* Manual scan fallback */}
        {(scanStep === 'scan-bin' || scanStep === 'scan-item') && (
          <ManualEntry
            label={scanStep === 'scan-bin' ? 'Or type bin code' : 'Or type barcode'}
            placeholder={scanStep === 'scan-bin' ? currentLine?.locationCode : currentLine?.barcode}
            onSubmit={submitManual}
          />
        )}

        {/* Short pick panel */}
        {showShort && (
          <div
            style={{
              backgroundColor: 'var(--scan-error-bg)',
              border: '2px solid var(--scan-error)',
              borderRadius: '12px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--scan-error)', fontSize: '1rem' }}>
              Short Pick Reason
            </p>
            <select
              value={shortReason}
              onChange={(e) => setShortReason(e.target.value)}
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
              {SHORT_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button variant="ghost" size="lg" onClick={() => { setShowShort(false); setShortReason(''); }}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="lg"
                fullWidth
                disabled={!shortReason}
                loading={shortPick.isPending}
                onClick={submitShort}
              >
                Record Short
              </Button>
            </div>
          </div>
        )}
      </div>
    </FloorLayout>
  );
}
