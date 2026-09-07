import { type ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { SyncStatusBar } from './SyncStatusBar';
import { useSessionStore, type UserRole } from '@/stores/sessionStore';
import { Button } from '@/components/ui/Button';

// ── Nav definition (floor-mode subset) ───────────────────────────────────────

interface NavItem {
  label: string;
  to: string;
  roles: UserRole[];
}

interface NavSection {
  header: string;
  items: NavItem[];
}

const FLOOR_NAV_SECTIONS: NavSection[] = [
  {
    header: 'Operations',
    items: [
      {
        label: 'Home',
        to: '/home',
        roles: ['picker', 'packer', 'inward', 'returns', 'supervisor', 'admin', 'read_only'],
      },
      {
        label: 'Purchase Orders',
        to: '/inward/purchase-orders',
        roles: ['inward', 'supervisor', 'admin'],
      },
      {
        label: 'Putaway',
        to: '/putaway',
        roles: ['inward', 'supervisor', 'admin'],
      },
      {
        label: 'Picking',
        to: '/pick',
        roles: ['picker', 'supervisor', 'admin'],
      },
      {
        label: 'Packing',
        to: '/pack',
        roles: ['packer', 'supervisor', 'admin'],
      },
      {
        label: 'Returns',
        to: '/returns',
        roles: ['returns', 'supervisor', 'admin'],
      },
      {
        label: 'Cycle Counts',
        to: '/count',
        roles: ['supervisor', 'admin'],
      },
    ],
  },
  {
    header: 'Inventory',
    items: [
      {
        label: 'Stock on Hand',
        to: '/stock',
        roles: ['supervisor', 'admin', 'read_only'],
      },
    ],
  },
  {
    header: 'System',
    items: [
      {
        label: 'Settings',
        to: '/settings',
        roles: ['admin'],
      },
    ],
  },
];

// ── Props ────────────────────────────────────────────────────────────────────

interface FloorLayoutProps {
  /** Large heading shown at the top of the screen */
  heading: string;
  /** Optional secondary descriptor (location, task ref, etc.) */
  subheading?: string;
  /** Back link destination; renders a back button if provided */
  backTo?: string;
  /** Right-side of the header — action buttons, quantity display, etc. */
  headerRight?: ReactNode;
  children: ReactNode;
  /** Bottom CTA button row — pinned above SyncStatusBar */
  footer?: ReactNode;
}

/**
 * FloorLayout — full-screen scan-driven layout.
 *
 * Rules:
 *   - Single task visible
 *   - 32px+ text everywhere
 *   - 56px+ touch targets
 *   - One primary action visible at a time
 *   - No decorative motion
 */
export function FloorLayout({
  heading,
  subheading,
  backTo,
  headerRight,
  children,
  footer,
}: FloorLayoutProps) {
  const user = useSessionStore((s) => s.user);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Filter nav by role ────────────────────────────────────────────────────
  const role = user?.role ?? ('' as UserRole);
  const visibleSections = FLOOR_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="flex flex-col h-dvh bg-[var(--surface-sunken)] safe-top">
      {/* ── Navigation drawer backdrop ── */}
      {drawerOpen && (
        <div
          onClick={closeDrawer}
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
        />
      )}

      {/* ── Navigation drawer ── */}
      <nav
        aria-label="Main navigation"
        aria-hidden={!drawerOpen}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '280px',
          zIndex: 1000,
          backgroundColor: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 220ms ease',
          boxShadow: drawerOpen ? '4px 0 16px rgba(0,0,0,0.12)' : 'none',
          overflow: 'hidden',
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '56px',
            padding: '0 12px 0 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--brand-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Fabb6 WMS
          </span>
          <button
            onClick={closeDrawer}
            aria-label="Close navigation"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Nav sections */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 8px',
          }}
        >
          {visibleSections.map((section) => (
            <div key={section.header} style={{ marginBottom: '4px' }}>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  padding: '8px 12px 4px',
                  userSelect: 'none',
                }}
              >
                {section.header}
              </div>
              {section.items.map((item) => {
                const endMatch = item.to === '/home';
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={endMatch}
                    onClick={closeDrawer}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      height: '40px',
                      padding: '0 12px',
                      borderRadius: '6px',
                      marginBottom: '2px',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? '#FFFFFF' : 'var(--text)',
                      backgroundColor: isActive
                        ? 'var(--brand-primary)'
                        : 'transparent',
                      transition:
                        'background-color 150ms ease, color 150ms ease',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                    })}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLAnchorElement;
                      if (!el.style.backgroundColor.includes('var(--brand')) {
                        el.style.backgroundColor = 'var(--surface-sunken)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLAnchorElement;
                      if (!el.style.backgroundColor.includes('var(--brand')) {
                        el.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        {/* User info footer */}
        {user && (
          <div
            style={{
              borderTop: '1px solid var(--border)',
              padding: '12px 16px',
              flexShrink: 0,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user.name}
            </p>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: '11px',
                color: 'var(--text-muted)',
                textTransform: 'capitalize',
              }}
            >
              {user.role}
            </p>
          </div>
        )}
      </nav>

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 py-3 bg-[var(--brand-primary)] text-white shrink-0">
        {/* Hamburger — 44×44 touch target, leftmost */}
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          className="inline-flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors shrink-0"
          style={{ width: '44px', height: '44px' }}
        >
          <Menu size={24} aria-hidden="true" />
        </button>

        {backTo && (
          <NavLink
            to={backTo}
            className="inline-flex items-center justify-center h-14 w-14 rounded-xl hover:bg-white/10 transition-colors shrink-0"
            aria-label="Back"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </NavLink>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold leading-tight truncate">{heading}</h1>
          {subheading && (
            <p className="text-base opacity-80 truncate">{subheading}</p>
          )}
        </div>

        {headerRight && <div className="shrink-0">{headerRight}</div>}

        {user && (
          <div className="shrink-0 text-right hidden sm:block">
            <p className="text-sm opacity-70">{user.name}</p>
            <p className="text-xs opacity-50 uppercase tracking-wide">{user.role}</p>
          </div>
        )}
      </header>

      {/* ── Body (scrollable) ── */}
      <main className="flex-1 overflow-y-auto scroll-container px-4 py-4">
        {children}
      </main>

      {/* ── Pinned footer ── */}
      {footer && (
        <div className="shrink-0 px-4 py-3 bg-[var(--surface)] border-t border-[var(--border)]">
          {footer}
        </div>
      )}

      {/* ── Always-visible sync status ── */}
      <SyncStatusBar />
    </div>
  );
}

/** Convenience: large quantity display for floor screens */
export function FloorQuantity({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: number | string;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-sm text-[var(--text-muted)] font-medium uppercase tracking-wide">
        {label}
      </span>
      <span
        className={`text-5xl font-bold tabular leading-none ${highlight ? 'text-[var(--brand-accent)]' : 'text-[var(--text)]'}`}
      >
        {value}
      </span>
      {unit && (
        <span className="text-base text-[var(--text-muted)]">{unit}</span>
      )}
    </div>
  );
}

/** Large floor-mode action button  */
export function FloorAction({
  label,
  onClick,
  variant = 'primary',
  disabled = false,
  loading = false,
}: {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Button
      size="floor"
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      fullWidth
    >
      {label}
    </Button>
  );
}
