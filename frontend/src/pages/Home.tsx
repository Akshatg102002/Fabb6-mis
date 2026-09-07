import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  MapPin,
  Package,
  RotateCcw,
} from 'lucide-react';
import { DeskLayout } from '@/components/layout/DeskLayout';
import { Button } from '@/components/ui/Button';
import { useSessionStore } from '@/stores/sessionStore';
import { apiClient } from '@/api/client';

// ── Types ──────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalSkus: number;
  stockValue: number;
  lowStockAlerts: number;
  todayMovements: number;
  top10Skus: { skuCode: string; skuName: string; qty: number; value: number }[];
  brandStock: { brand: string; qty: number }[];
  recentActivity: {
    id: string;
    movementType: string;
    quantity: number;
    createdAt: string;
    skuCode: string;
    skuName: string;
    fromLoc: string | null;
    toLoc: string | null;
    userName: string | null;
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h <= 16) return 'Good afternoon';
  return 'Good evening';
}

function getDateLabel(): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());
}

function fmtINR(v: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(v);
}

function fmtNum(v: number): string {
  return v.toLocaleString('en-IN');
}

function fmtMovementType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  subtext,
  accent,
  loading,
}: {
  label: string;
  value: string;
  subtext?: string;
  accent?: string;
  loading: boolean;
}) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '20px 24px',
        minWidth: 0,
        borderLeft: accent ? `4px solid ${accent}` : undefined,
      }}
    >
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        {label}
      </div>
      {loading ? (
        <div style={{ height: '36px', borderRadius: '4px', background: 'var(--border)', width: '80px', animation: 'shimmer 1.4s ease infinite', backgroundSize: '200% 100%' }} />
      ) : (
        <>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {value}
          </div>
          {subtext && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{subtext}</div>
          )}
        </>
      )}
    </div>
  );
}

// ── Bar Chart (SVG) ────────────────────────────────────────────────────────

function HorizontalBarChart({ items }: { items: { label: string; value: number; subLabel?: string }[] }) {
  if (!items.length) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No data</p>;
  const max = Math.max(...items.map((i) => i.value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '120px', fontSize: '12px', color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }} title={item.label}>
            {item.label}
          </div>
          <div style={{ flex: 1, height: '20px', backgroundColor: 'var(--surface-sunken)', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: max > 0 ? `${(item.value / max) * 100}%` : '0',
                backgroundColor: 'var(--brand-primary)',
                borderRadius: '4px',
                transition: 'width 600ms ease',
              }}
            />
          </div>
          <div style={{ width: '70px', fontSize: '12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
            {item.subLabel ?? fmtNum(item.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Donut Chart (SVG) ──────────────────────────────────────────────────────

const DONUT_COLOURS = [
  '#0B4F9C', '#1A8C5F', '#C47700', '#7B52D0', '#4B6FE3',
  '#C42B1C', '#0E7A5A', '#8B5E3C', '#2E86AB', '#A23B72',
];

function DonutChart({ items }: { items: { label: string; value: number }[] }) {
  if (!items.length) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No data</p>;
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No stock</p>;

  const r = 60, cx = 70, cy = 70, stroke = 22;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const slices = items.slice(0, 10).map((item, i) => {
    const pct = item.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const slice = { pct, dash, gap, offset, color: DONUT_COLOURS[i % DONUT_COLOURS.length] };
    offset += dash;
    return slice;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset + circumference / 4}
            style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill="var(--text-muted)">Total</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text)">{fmtNum(total)}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
        {items.slice(0, 8).map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: DONUT_COLOURS[i % DONUT_COLOURS.length], flexShrink: 0 }} />
            <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', marginLeft: 'auto', flexShrink: 0, paddingLeft: '8px' }}>{fmtNum(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Quick Actions ──────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Receive GRN', icon: ArrowDownToLine, to: '/inward' },
  { label: 'Putaway', icon: MapPin, to: '/putaway' },
  { label: 'Pack Order', icon: Package, to: '/pack' },
  { label: 'Returns', icon: RotateCcw, to: '/returns' },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const user = useSessionStore((s) => s.user);
  const navigate = useNavigate();

  useEffect(() => { document.title = 'Fabb6 WMS — Home'; }, []);

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => apiClient<DashboardStats>('/dashboard/stats'),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const top10Items = (stats?.top10Skus ?? []).map((s) => ({
    label: s.skuCode,
    value: s.value,
    subLabel: fmtINR(s.value),
  }));

  const brandItems = (stats?.brandStock ?? []).map((b) => ({
    label: b.brand,
    value: b.qty,
  }));

  return (
    <DeskLayout heading="Home" title="Home">
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Greeting */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
          {getGreeting()}{user?.name ? `, ${user.name}` : ''}.
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-muted)' }}>
          {getDateLabel()}
        </p>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '28px' }}>
        <KpiCard label="Total SKUs" value={fmtNum(stats?.totalSkus ?? 0)} loading={isLoading} accent="#0B4F9C" />
        <KpiCard label="Stock Value" value={fmtINR(stats?.stockValue ?? 0)} loading={isLoading} accent="#1A8C5F" />
        <KpiCard
          label="Low Stock Alerts"
          value={fmtNum(stats?.lowStockAlerts ?? 0)}
          subtext="SKUs with qty < 10"
          loading={isLoading}
          accent={stats?.lowStockAlerts ? '#C42B1C' : '#9ca3af'}
        />
        <KpiCard label="Today's Movements" value={fmtNum(stats?.todayMovements ?? 0)} loading={isLoading} accent="#C47700" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {/* Top 10 SKUs by value */}
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
            Top 10 SKUs by Value
          </h3>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ height: '20px', backgroundColor: 'var(--border)', borderRadius: '4px', width: `${60 + (i * 7) % 35}%` }} />
              ))}
            </div>
          ) : (
            <HorizontalBarChart items={top10Items} />
          )}
        </div>

        {/* Stock by brand */}
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
            Stock by Brand (qty)
          </h3>
          {isLoading ? (
            <div style={{ height: '140px', backgroundColor: 'var(--border)', borderRadius: '50%', width: '140px', margin: '0 auto' }} />
          ) : (
            <DonutChart items={brandItems} />
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '28px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Recent Activity</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--surface-sunken)' }}>
                {['Time', 'SKU', 'Type', 'Qty', 'From → To', 'User'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} style={{ padding: '10px 16px' }}>
                        <div style={{ height: '13px', backgroundColor: 'var(--border)', borderRadius: '3px', width: `${50 + (j * 11) % 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : stats?.recentActivity.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No stock movements recorded yet
                  </td>
                </tr>
              ) : (
                stats?.recentActivity.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {relativeTime(a.createdAt)}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {a.skuCode}
                    </td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      {fmtMovementType(a.movementType)}
                    </td>
                    <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: 600 }}>
                      {fmtNum(a.quantity)}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {a.fromLoc && a.toLoc ? `${a.fromLoc} → ${a.toLoc}` : (a.fromLoc ?? a.toLoc ?? '—')}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {a.userName ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Quick Actions
        </h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {QUICK_ACTIONS.map(({ label, icon: Icon, to }) => (
            <Button key={to} variant="secondary" size="md" onClick={() => navigate(to)}>
              <Icon size={15} style={{ marginRight: '6px' }} />
              {label}
            </Button>
          ))}
        </div>
      </div>
    </DeskLayout>
  );
}
