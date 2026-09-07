import { useState, useCallback } from 'react';
import { DeskLayout } from '@/components/layout/DeskLayout';
import { ScanResult } from '@/components/scan/ScanResult';
import { ManualEntry } from '@/components/scan/ManualEntry';
import { Button } from '@/components/ui/Button';
import { useScanner } from '@/hooks/useScanner';
import { useAudio } from '@/hooks/useAudio';
import { usePendingPutaway, type PutawayTask } from '@/api/queries/putaway';
import { apiClient } from '@/api/client';

type Step = 'scan-tote' | 'scan-bin' | 'confirming';
type ScanStatus = 'idle' | 'ok' | 'warn' | 'error';

interface ToteItem {
  sku: string;
  name: string;
  qty: number;
  uom: string;
  suggestedBin: string;
}

interface ToteData {
  toteBarcode: string;
  items: ToteItem[];
  suggestedBin: string;
}

function statusBadge(status: PutawayTask['status']) {
  const cfg = {
    pending: { label: 'Pending', color: '#C77700', bg: '#FFF7E6' },
    in_progress: { label: 'In Progress', color: '#0B4F9C', bg: '#E8F0FB' },
    complete: { label: 'Complete', color: '#0E8A4F', bg: '#E8F7F0' },
  }[status] ?? { label: status, color: '#5A6884', bg: '#F5F7FA' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: cfg.color, backgroundColor: cfg.bg }}>
      {cfg.label}
    </span>
  );
}

export default function Putaway() {
  const [step, setStep] = useState<Step>('scan-tote');
  const [toteBarcode, setToteBarcode] = useState('');
  const [toteData, setToteData] = useState<ToteData | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanMessage, setScanMessage] = useState('Scan tote barcode');
  const [loading, setLoading] = useState(false);
  const [showTasks, setShowTasks] = useState(true);

  const { reject, accept } = useAudio();
  const { data: pendingTasks } = usePendingPutaway();

  async function lookupTote(barcode: string) {
    setLoading(true);
    try {
      const data = await apiClient<ToteData>(`/putaway/tote/${encodeURIComponent(barcode)}`);
      setToteBarcode(barcode);
      setToteData(data);
      setScanStatus('ok');
      setScanMessage('Tote found');
      setStep('scan-bin');
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

  async function confirmBin(binBarcode: string) {
    if (!toteData) return;
    if (binBarcode !== toteData.suggestedBin) {
      setScanStatus('warn');
      setScanMessage('Wrong bin — scan suggested bin');
      reject();
      return;
    }
    setStep('confirming');
    try {
      await apiClient('/putaway/confirm', { method: 'POST', body: { toteBarcode, binBarcode } });
      setScanStatus('ok');
      setScanMessage('Putaway confirmed');
      accept();
      setTimeout(reset, 2000);
    } catch {
      setScanStatus('error');
      setScanMessage('Confirm failed');
      reject();
      setStep('scan-bin');
    }
  }

  function reset() {
    setStep('scan-tote');
    setToteBarcode('');
    setToteData(null);
    setScanStatus('idle');
    setScanMessage('Scan tote barcode');
  }

  const handleScan = useCallback(
    (barcode: string) => {
      if (step === 'scan-tote') void lookupTote(barcode);
      else if (step === 'scan-bin') void confirmBin(barcode);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, toteData, toteBarcode],
  );

  const { submitManual } = useScanner(handleScan, { disabled: loading || step === 'confirming' });

  const hasPending = pendingTasks && pendingTasks.length > 0;

  return (
    <DeskLayout
      heading="Putaway"
      breadcrumbs={[{ label: 'Home', to: '/home' }, { label: 'Putaway' }]}
      footer={
        toteData && step === 'scan-bin' ? (
          <Button variant="ghost" size="lg" fullWidth onClick={reset}>
            Cancel / New Tote
          </Button>
        ) : undefined
      }
    >
      {/* Pending tasks section */}
      {hasPending && (
        <div style={{ marginBottom: '1.5rem', backgroundColor: '#FFFFFF', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          <button
            onClick={() => setShowTasks((v) => !v)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
              Pending Putaway Tasks ({pendingTasks.length})
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{showTasks ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {showTasks && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-sunken)', borderTop: '1px solid var(--border)' }}>
                    {['GRN', 'SKU', 'Name', 'Qty', 'Suggested Bin', 'Status'].map((h) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingTasks.map((task) => (
                    <tr
                      key={task.id}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--surface-sunken)')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent')}
                      onClick={() => {
                        setStep('scan-tote');
                        setScanMessage(`Scan tote for GRN ${task.grnReference}`);
                      }}
                    >
                      <td style={{ padding: '8px 12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{task.grnReference}</td>
                      <td style={{ padding: '8px 12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', whiteSpace: 'nowrap' }}>{task.sku}</td>
                      <td style={{ padding: '8px 12px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.skuName}</td>
                      <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{task.quantity} {task.uom}</td>
                      <td style={{ padding: '8px 12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', whiteSpace: 'nowrap' }}>{task.suggestedLocationCode}</td>
                      <td style={{ padding: '8px 12px' }}>{statusBadge(task.status)}</td>
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

        {toteData && (
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>Tote {toteBarcode}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{toteData.items.length} item{toteData.items.length !== 1 ? 's' : ''}</span>
            </div>
            {toteData.items.map((item, i) => (
              <div key={i} style={{ padding: '0.75rem 1rem', borderBottom: i < toteData.items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>{item.name}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem' }}>
                  <span>{item.sku}</span>
                  <span>{item.qty} {item.uom}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {toteData && step === 'scan-bin' && (
          <div style={{ backgroundColor: 'var(--brand-primary)', color: '#ffffff', borderRadius: '12px', padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.875rem', opacity: 0.75, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Suggested Bin</div>
            <div style={{ fontSize: '3rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>
              {toteData.suggestedBin}
            </div>
            <div style={{ fontSize: '0.875rem', opacity: 0.75, marginTop: '0.75rem' }}>Scan bin barcode to confirm</div>
          </div>
        )}

        {step === 'scan-bin' && (
          <ManualEntry label="Or type bin barcode" placeholder={toteData?.suggestedBin ?? 'BIN-…'} onSubmit={submitManual} />
        )}
      </div>
    </DeskLayout>
  );
}
