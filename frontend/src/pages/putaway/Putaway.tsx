import { useState, useCallback } from 'react';
import { FloorLayout } from '@/components/layout/FloorLayout';
import { ScanResult } from '@/components/scan/ScanResult';
import { ManualEntry } from '@/components/scan/ManualEntry';
import { Button } from '@/components/ui/Button';
import { useScanner } from '@/hooks/useScanner';
import { useAudio } from '@/hooks/useAudio';
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

export default function Putaway() {
  const [step, setStep] = useState<Step>('scan-tote');
  const [toteBarcode, setToteBarcode] = useState('');
  const [toteData, setToteData] = useState<ToteData | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanMessage, setScanMessage] = useState('Scan tote barcode');
  const [loading, setLoading] = useState(false);

  const { reject, accept } = useAudio();

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
      await apiClient('/putaway/confirm', {
        method: 'POST',
        body: { toteBarcode, binBarcode },
      });
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

  return (
    <FloorLayout
      heading="Putaway"
      backTo="/home"
      footer={
        toteData && step === 'scan-bin' ? (
          <Button variant="ghost" size="lg" fullWidth onClick={reset}>
            Cancel / New Tote
          </Button>
        ) : undefined
      }
    >
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        <ScanResult status={scanStatus} message={scanMessage} />

        {/* Tote scan fallback */}
        {step === 'scan-tote' && (
          <ManualEntry
            label="Or type tote barcode"
            placeholder="TOTE-…"
            onSubmit={submitManual}
          />
        )}

        {/* Tote contents */}
        {toteData && (
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
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>Tote {toteBarcode}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {toteData.items.length} item{toteData.items.length !== 1 ? 's' : ''}
              </span>
            </div>
            {toteData.items.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: '0.75rem 1rem',
                  borderBottom: i < toteData.items.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>{item.name}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem' }}>
                  <span>{item.sku}</span>
                  <span className="tabular">{item.qty} {item.uom}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Suggested bin — shown prominently */}
        {toteData && step === 'scan-bin' && (
          <div
            style={{
              backgroundColor: 'var(--brand-primary)',
              color: '#ffffff',
              borderRadius: '12px',
              padding: '1.5rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.875rem', opacity: 0.75, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Suggested Bin
            </div>
            <div
              style={{
                fontSize: '3rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                fontFamily: "'IBM Plex Mono', monospace",
                lineHeight: 1,
              }}
            >
              {toteData.suggestedBin}
            </div>
            <div style={{ fontSize: '0.875rem', opacity: 0.75, marginTop: '0.75rem' }}>
              Scan bin barcode to confirm
            </div>
          </div>
        )}

        {/* Bin scan fallback */}
        {step === 'scan-bin' && (
          <ManualEntry
            label="Or type bin barcode"
            placeholder={toteData?.suggestedBin ?? 'BIN-…'}
            onSubmit={submitManual}
          />
        )}
      </div>
    </FloorLayout>
  );
}
