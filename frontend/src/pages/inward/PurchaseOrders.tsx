import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { DeskLayout } from '@/components/layout/DeskLayout';
import { usePOList, type PurchaseOrder, type POStatus } from '@/api/queries/pos';

const STATUS_TABS: { label: string; value: POStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Draft', value: 'draft' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Partial', value: 'partial' },
  { label: 'Received', value: 'received' },
];

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  draft:     { color: '#5A6884', bg: '#F5F7FA' },
  confirmed: { color: '#0B4F9C', bg: '#E8F0FB' },
  partial:   { color: '#C77700', bg: '#FFF7E6' },
  received:  { color: '#0E8A4F', bg: '#E8F7F0' },
  cancelled: { color: '#C42B1C', bg: '#FEF0EF' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_STYLE[status] ?? STATUS_STYLE['draft']!;
  return (
    <span style={{
      padding: '2px 10px',
      borderRadius: '6px',
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: cfg.color,
      backgroundColor: cfg.bg,
    }}>
      {status}
    </span>
  );
}

function PORow({ po, onClick }: { po: PurchaseOrder; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: 'pointer',
        backgroundColor: hovered ? 'var(--surface-sunken)' : 'transparent',
        transition: 'background-color 100ms ease',
      }}
    >
      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--brand-primary)', fontSize: '14px' }}>
        {po.po_number}
      </td>
      <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
        {po.expected_date
          ? new Date(po.expected_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : '—'}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <StatusBadge status={po.status} />
      </td>
      <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'right' }}>
        {po.total_value ? `₹${Number(po.total_value).toLocaleString('en-IN')}` : '—'}
      </td>
      <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
        {new Date(po.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
      </td>
    </tr>
  );
}

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<POStatus | undefined>(undefined);
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = usePOList(activeTab);
  const allPOs = data?.data ?? [];
  const filtered = search.trim()
    ? allPOs.filter((po) => po.po_number.toLowerCase().includes(search.toLowerCase()))
    : allPOs;

  return (
    <DeskLayout heading="Purchase Orders" title="Purchase Orders">
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '340px' }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            placeholder="Search PO number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              height: '36px',
              paddingLeft: '32px',
              paddingRight: '12px',
              fontSize: '13px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => navigate('/inward/purchase-orders/create')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '36px',
              padding: '0 16px',
              backgroundColor: 'var(--brand-primary)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Plus size={15} />
            New PO
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(tab.value)}
            style={{
              height: '36px',
              padding: '0 14px',
              border: 'none',
              borderBottom: activeTab === tab.value ? '2px solid var(--brand-primary)' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === tab.value ? 'var(--brand-primary)' : 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: activeTab === tab.value ? 600 : 400,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'color 120ms ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading && (
        <p style={{ color: 'var(--text-muted)', padding: '2rem 0', textAlign: 'center' }}>Loading…</p>
      )}
      {error && (
        <p style={{ color: 'var(--scan-error)', padding: '2rem 0', textAlign: 'center' }}>
          Failed to load purchase orders
        </p>
      )}

      {!isLoading && !error && (
        filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)', fontSize: '15px' }}>
            No purchase orders found.
            <br />
            <button
              onClick={() => navigate('/inward/purchase-orders/create')}
              style={{
                marginTop: '16px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 20px',
                backgroundColor: 'var(--brand-primary)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Plus size={14} /> Create First PO
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['PO Number', 'Expected Date', 'Status', 'Value', 'Created'].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 16px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--text-muted)',
                        textAlign: i === 3 ? 'right' : 'left',
                        backgroundColor: 'var(--surface-sunken)',
                        position: 'sticky',
                        top: 0,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((po) => (
                  <PORow
                    key={po.id}
                    po={po}
                    onClick={() => navigate(`/inward/purchase-orders/${po.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </DeskLayout>
  );
}
