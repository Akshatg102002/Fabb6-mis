import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FloorLayout } from '@/components/layout/FloorLayout';
import { Button } from '@/components/ui/Button';
import { useGRNList, type GRN as GRNType, type GRNStatus } from '@/api/queries/grn';
import { apiClient } from '@/api/client';

function statusBadge(status: GRNStatus) {
  const map: Record<GRNStatus, { label: string; color: string; bg: string }> = {
    draft: { label: 'Draft', color: '#5A6884', bg: '#F5F7FA' },
    open: { label: 'Open', color: '#0B4F9C', bg: '#E8F0FB' },
    partial: { label: 'Partial', color: '#C77700', bg: '#FFF7E6' },
    complete: { label: 'Complete', color: '#0E8A4F', bg: '#E8F7F0' },
    closed: { label: 'Closed', color: '#5A6884', bg: '#F5F7FA' },
  };
  const cfg = map[status] ?? map.open;
  return (
    <span
      style={{
        padding: '0.2rem 0.6rem',
        borderRadius: '6px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: cfg.color,
        backgroundColor: cfg.bg,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {cfg.label}
    </span>
  );
}

function GRNCard({ grn, onSelect }: { grn: GRNType; onSelect: () => void }) {
  const received = grn.lines.reduce((s, l) => s + l.receivedQty, 0);
  const expected = grn.lines.reduce((s, l) => s + l.expectedQty, 0);

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '1rem',
        backgroundColor: 'var(--surface)',
        border: '2px solid var(--border)',
        borderRadius: '12px',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        fontFamily: 'inherit',
        transition: 'border-color 80ms ease',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-primary)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text)' }}>
            {grn.reference}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {grn.supplierName}
          </div>
        </div>
        {statusBadge(grn.status)}
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        {grn.lines.length} line{grn.lines.length !== 1 ? 's' : ''} &middot;{' '}
        <span className="tabular">{received}</span> / <span className="tabular">{expected}</span> received
      </div>
      {grn.expectedAt && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Expected: {new Date(grn.expectedAt).toLocaleDateString('en-IN')}
        </div>
      )}
    </button>
  );
}

export default function GRN() {
  const navigate = useNavigate();
  const [blindRef, setBlindRef] = useState('');
  const [showBlind, setShowBlind] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: grns, isLoading, error } = useGRNList('open');

  async function startBlindReceive() {
    if (!blindRef.trim()) return;
    setCreating(true);
    try {
      const grn = await apiClient<GRNType>('/grn', {
        method: 'POST',
        body: { reference: blindRef.trim(), blind: true },
      });
      navigate(`/inward/receive/${grn.id}`);
    } catch {
      // error handled by apiClient
    } finally {
      setCreating(false);
    }
  }

  return (
    <FloorLayout
      heading="Receive (GRN)"
      backTo="/home"
      footer={
        <Button
          variant="secondary"
          size="floor"
          fullWidth
          onClick={() => setShowBlind((v) => !v)}
        >
          {showBlind ? 'Cancel' : 'Blind Receive'}
        </Button>
      }
    >
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Blind receive panel */}
        {showBlind && (
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '2px solid var(--brand-accent)',
              borderRadius: '12px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <p style={{ margin: 0, fontWeight: 600, fontSize: '1.0625rem' }}>
              Blind Receive — no PO
            </p>
            <input
              type="text"
              placeholder="Supplier invoice / reference"
              value={blindRef}
              onChange={(e) => setBlindRef(e.target.value)}
              style={{
                height: '56px',
                padding: '0 1rem',
                fontSize: '1.125rem',
                border: '2px solid var(--border)',
                borderRadius: '8px',
                backgroundColor: 'var(--surface-sunken)',
                color: 'var(--text)',
                fontFamily: 'inherit',
              }}
            />
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={creating}
              disabled={!blindRef.trim()}
              onClick={() => void startBlindReceive()}
            >
              Start Blind Receive
            </Button>
          </div>
        )}

        {/* Active GRNs */}
        <h2
          style={{
            margin: 0,
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Open GRNs
        </h2>

        {isLoading && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
            Loading…
          </p>
        )}

        {error && (
          <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>
            Failed to load GRNs
          </p>
        )}

        {grns && grns.length === 0 && !isLoading && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--text-muted)',
              padding: '3rem 1rem',
              fontSize: '1.0625rem',
            }}
          >
            No open GRNs.
            <br />
            Use Blind Receive or check with your supervisor.
          </div>
        )}

        {grns?.map((grn) => (
          <GRNCard
            key={grn.id}
            grn={grn}
            onSelect={() => navigate(`/inward/receive/${grn.id}`)}
          />
        ))}
      </div>
    </FloorLayout>
  );
}
