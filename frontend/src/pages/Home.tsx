import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/stores/sessionStore';
import { FloorLayout } from '@/components/layout/FloorLayout';

interface Tile {
  label: string;
  to: string;
  emoji: string;
  roles: string[];
  accent?: string;
}

const TILES: Tile[] = [
  {
    label: 'Pick Lists',
    to: '/pick',
    emoji: '🛒',
    roles: ['floor_worker', 'supervisor', 'admin'],
  },
  {
    label: 'Pack Orders',
    to: '/pack',
    emoji: '📦',
    roles: ['floor_worker', 'supervisor', 'admin'],
  },
  {
    label: 'Receive GRN',
    to: '/inward',
    emoji: '📥',
    roles: ['floor_worker', 'supervisor', 'admin'],
  },
  {
    label: 'Returns Inward',
    to: '/returns',
    emoji: '↩️',
    roles: ['floor_worker', 'supervisor', 'admin'],
  },
  {
    label: 'Putaway',
    to: '/putaway',
    emoji: '🗄️',
    roles: ['floor_worker', 'supervisor', 'admin'],
  },
  {
    label: 'Cycle Count',
    to: '/count',
    emoji: '🔢',
    roles: ['supervisor', 'admin'],
  },
  {
    label: 'Stock on Hand',
    to: '/stock',
    emoji: '📋',
    roles: ['supervisor', 'manager', 'admin'],
  },
];

export default function Home() {
  const user = useSessionStore((s) => s.user);
  const navigate = useNavigate();

  const role = user?.role ?? '';
  const visibleTiles = TILES.filter((t) => t.roles.includes(role));

  return (
    <FloorLayout heading="Home" subheading={user ? `Hello, ${user.name}` : undefined}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '1rem',
          padding: '1rem',
        }}
      >
        {visibleTiles.map((tile) => (
          <button
            key={tile.to}
            onClick={() => navigate(tile.to)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              padding: '1.5rem 1rem',
              minHeight: '140px',
              backgroundColor: 'var(--surface)',
              border: '2px solid var(--border)',
              borderRadius: '16px',
              cursor: 'pointer',
              transition: 'border-color 80ms ease, background-color 80ms ease',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--brand-primary)';
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f0f6ff';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface)';
            }}
          >
            <span style={{ fontSize: '2.5rem', lineHeight: 1 }} aria-hidden="true">
              {tile.emoji}
            </span>
            <span
              style={{
                fontSize: '1.0625rem',
                fontWeight: 600,
                color: 'var(--text)',
                textAlign: 'center',
                lineHeight: 1.3,
              }}
            >
              {tile.label}
            </span>
          </button>
        ))}
      </div>

      {visibleTiles.length === 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            padding: '3rem',
            color: 'var(--text-muted)',
            fontSize: '1.125rem',
            textAlign: 'center',
          }}
        >
          No tasks available for your role.
          <br />
          Contact your supervisor.
        </div>
      )}
    </FloorLayout>
  );
}
