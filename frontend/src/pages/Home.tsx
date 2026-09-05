import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine,
  BarChart3,
  ClipboardCheck,
  MapPin,
  Package,
  RotateCcw,
  Settings as SettingsIcon,
  ShoppingCart,
} from 'lucide-react';
import { DeskLayout } from '@/components/layout/DeskLayout';
import { useSessionStore, type UserRole } from '@/stores/sessionStore';
import { apiClient } from '@/api/client';

// ── Greeting ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h <= 16) return 'Good afternoon';
  return 'Good evening';
}

function getDateLabel(): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

// ── KPI cards ─────────────────────────────────────────────────────────────────

interface KpiConfig {
  label: string;
  endpoint: string;
}

const KPI_CARDS: KpiConfig[] = [
  { label: 'Total SKUs', endpoint: '/skus?per_page=1' },
  { label: 'Stock Locations', endpoint: '/locations?per_page=1' },
  { label: 'Pending Putaways', endpoint: '/putaway/tasks?status=pending&per_page=1' },
  { label: 'Open Pick Lists', endpoint: '/pick-lists?status=pending,assigned,in_progress&per_page=1' },
];

interface PaginatedResponse {
  total?: number;
  meta?: { total?: number };
}

function useKpiValue(endpoint: string) {
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient<PaginatedResponse>(endpoint)
      .then((data) => {
        if (!cancelled) {
          const total = data?.total ?? data?.meta?.total ?? 0;
          setValue(total);
        }
      })
      .catch(() => {
        if (!cancelled) setValue(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [endpoint]);

  return { value, loading };
}

function KpiCard({ label, endpoint }: KpiConfig) {
  const { value, loading } = useKpiValue(endpoint);

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '20px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: '13px',
          color: 'var(--text-muted)',
          fontWeight: 500,
          marginBottom: '8px',
        }}
      >
        {label}
      </div>

      {loading ? (
        <div
          style={{
            height: '36px',
            borderRadius: '4px',
            background:
              'linear-gradient(90deg, var(--border) 25%, var(--surface-sunken) 50%, var(--border) 75%)',
            backgroundSize: '200% 100%',
            animation: 'kpi-shimmer 1.4s ease infinite',
            width: '64px',
          }}
        />
      ) : (
        <div
          style={{
            fontSize: '32px',
            fontWeight: 700,
            color: 'var(--text)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.1,
          }}
        >
          {value?.toLocaleString('en-IN') ?? '0'}
        </div>
      )}
    </div>
  );
}

// ── Module tiles ──────────────────────────────────────────────────────────────

interface TileConfig {
  icon: typeof ArrowDownToLine;
  label: string;
  to: string;
  description: string;
  roles: UserRole[];
}

const TILES: TileConfig[] = [
  {
    icon: ArrowDownToLine,
    label: 'Receive GRN',
    to: '/inward',
    description: 'Receive stock against a purchase order',
    roles: ['inward', 'supervisor', 'admin'],
  },
  {
    icon: MapPin,
    label: 'Putaway',
    to: '/putaway',
    description: 'Assign received stock to bin locations',
    roles: ['inward', 'supervisor', 'admin'],
  },
  {
    icon: ShoppingCart,
    label: 'Pick Lists',
    to: '/pick',
    description: 'Pick items for outgoing orders',
    roles: ['picker', 'supervisor', 'admin'],
  },
  {
    icon: Package,
    label: 'Pack Orders',
    to: '/pack',
    description: 'Pack and dispatch picked orders',
    roles: ['packer', 'supervisor', 'admin'],
  },
  {
    icon: RotateCcw,
    label: 'Returns Inward',
    to: '/returns',
    description: 'Process customer returns and RTOs',
    roles: ['returns', 'supervisor', 'admin'],
  },
  {
    icon: ClipboardCheck,
    label: 'Cycle Count',
    to: '/count',
    description: 'Blind count bin locations for accuracy',
    roles: ['supervisor', 'admin'],
  },
  {
    icon: BarChart3,
    label: 'Stock on Hand',
    to: '/stock',
    description: 'View current inventory across all bins',
    roles: ['supervisor', 'admin', 'read_only'],
  },
  {
    icon: SettingsIcon,
    label: 'Settings',
    to: '/settings',
    description: 'Configure device, scanner, and system',
    roles: ['admin'],
  },
];

interface ModuleTileProps {
  tile: TileConfig;
}

function ModuleTile({ tile }: ModuleTileProps) {
  const navigate = useNavigate();
  const Icon = tile.icon;
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onClick={() => navigate(tile.to)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '24px',
        backgroundColor: '#FFFFFF',
        border: `1px solid ${hovered ? 'var(--brand-primary)' : 'var(--border)'}`,
        borderRadius: '8px',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        transition:
          'border-color 150ms ease, box-shadow 150ms ease, transform 100ms ease',
        boxShadow: hovered
          ? '0 0 0 3px rgba(11,79,156,0.08)'
          : '0 1px 3px rgba(0,0,0,0.04)',
        transform: pressed ? 'scale(0.98)' : 'scale(1)',
      }}
    >
      <Icon
        size={28}
        aria-hidden="true"
        style={{ color: 'var(--brand-primary)', flexShrink: 0 }}
      />
      <div
        style={{
          fontSize: '16px',
          fontWeight: 600,
          color: 'var(--text)',
          marginTop: '12px',
          lineHeight: 1.3,
        }}
      >
        {tile.label}
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'var(--text-muted)',
          marginTop: '4px',
          lineHeight: 1.45,
        }}
      >
        {tile.description}
      </div>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const user = useSessionStore((s) => s.user);
  const role = (user?.role ?? '') as UserRole;

  const visibleTiles = TILES.filter((t) => t.roles.includes(role));

  return (
    <DeskLayout heading="Home" title="Home">
      <style>{`
        @keyframes kpi-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Greeting */}
      <div style={{ marginBottom: '28px' }}>
        <h2
          style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.015em',
          }}
        >
          {getGreeting()}{user?.name ? `, ${user.name}` : ''}.
        </h2>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: '14px',
            color: 'var(--text-muted)',
          }}
        >
          {getDateLabel()}
        </p>
      </div>

      {/* KPI bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '32px',
        }}
      >
        {KPI_CARDS.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Module tiles */}
      {visibleTiles.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          {visibleTiles.map((tile) => (
            <ModuleTile key={tile.to} tile={tile} />
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '15px',
          }}
        >
          No modules available for your role.
          <br />
          Contact your supervisor.
        </div>
      )}
    </DeskLayout>
  );
}
