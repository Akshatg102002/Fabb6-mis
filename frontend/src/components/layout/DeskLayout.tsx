import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowDownToLine,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  MapPin,
  Package,
  RotateCcw,
  Settings as SettingsIcon,
  ShoppingCart,
} from 'lucide-react';
import { SyncStatusBar } from './SyncStatusBar';
import { useSessionStore, type UserRole } from '@/stores/sessionStore';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DeskLayoutProps {
  heading: string;
  /** Sets document.title to "Fabb6 WMS — {title}" */
  title?: string;
  breadcrumbs?: { label: string; to?: string }[];
  toolbar?: ReactNode;
  children: ReactNode;
}

interface NavItem {
  label: string;
  to: string;
  icon: typeof ArrowDownToLine;
  roles: UserRole[];
}

type NavSection = {
  header: string;
  items: NavItem[];
};

// ── Nav definition ────────────────────────────────────────────────────────────

const NAV_SECTIONS: NavSection[] = [
  {
    header: 'Operations',
    items: [
      {
        label: 'Inward',
        to: '/inward',
        icon: ArrowDownToLine,
        roles: ['inward', 'supervisor', 'admin'],
      },
      {
        label: 'Putaway',
        to: '/putaway',
        icon: MapPin,
        roles: ['inward', 'supervisor', 'admin'],
      },
      {
        label: 'Picking',
        to: '/pick',
        icon: ShoppingCart,
        roles: ['picker', 'supervisor', 'admin'],
      },
      {
        label: 'Packing',
        to: '/pack',
        icon: Package,
        roles: ['packer', 'supervisor', 'admin'],
      },
      {
        label: 'Returns',
        to: '/returns',
        icon: RotateCcw,
        roles: ['returns', 'supervisor', 'admin'],
      },
      {
        label: 'Cycle Counts',
        to: '/count',
        icon: ClipboardCheck,
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
        icon: BarChart3,
        roles: ['supervisor', 'admin', 'read_only'],
      },
      {
        label: 'Reports',
        to: '/reports',
        icon: FileText,
        roles: ['admin', 'read_only'],
      },
    ],
  },
  {
    header: 'System',
    items: [
      {
        label: 'Settings',
        to: '/settings',
        icon: SettingsIcon,
        roles: ['admin'],
      },
    ],
  },
];

const STORAGE_KEY = 'fabb6-sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    // ignore
  }
}

// ── Role-based initials avatar ────────────────────────────────────────────────

const ROLE_COLOURS: Record<UserRole, string> = {
  picker: '#4B6FE3',
  packer: '#7B52D0',
  inward: '#1A8C5F',
  returns: '#C47700',
  supervisor: '#0B4F9C',
  admin: '#C42B1C',
  read_only: '#5A6884',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function DeskLayout({
  heading,
  title,
  breadcrumbs,
  toolbar,
  children,
}: DeskLayoutProps) {
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const { pathname } = useLocation();

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // ── Document title ──────────────────────────────────────────────────────
  useEffect(() => {
    document.title = title ? `Fabb6 WMS — ${title}` : 'Fabb6 WMS';
    return () => {
      document.title = 'Fabb6 WMS';
    };
  }, [title]);

  // ── Persist collapse state ──────────────────────────────────────────────
  const toggle = useCallback(() => {
    if (isMobile) {
      setDrawerOpen((v) => !v);
    } else {
      setCollapsed((v) => {
        writeCollapsed(!v);
        return !v;
      });
    }
  }, [isMobile]);

  // ── Keyboard shortcut: backslash ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if focus is in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '\\') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  // ── Auto-collapse on viewport resize ───────────────────────────────────
  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(false);
        setDrawerOpen(false);
      }
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ── Close drawer on backdrop click ──────────────────────────────────────
  const handleBackdropClick = () => setDrawerOpen(false);

  // ── Filter nav by role ──────────────────────────────────────────────────
  const role = user?.role ?? ('' as UserRole);
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.roles.includes(role),
    ),
  })).filter((section) => section.items.length > 0);

  // ── Effective sidebar width ─────────────────────────────────────────────
  const isCollapsed = !isMobile && collapsed;
  const sidebarWidth = isCollapsed ? 64 : 240;

  // ── User initials ───────────────────────────────────────────────────────
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  const avatarBg = user?.role ? (ROLE_COLOURS[user.role] ?? 'var(--brand-primary)') : 'var(--brand-primary)';

  // ── Sidebar content ─────────────────────────────────────────────────────
  const sidebarContent = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#FFFFFF',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Logo + toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '56px',
          padding: isCollapsed ? '0' : '0 12px 0 16px',
          borderBottom: '1px solid var(--border)',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          flexShrink: 0,
        }}
      >
        {!isCollapsed && (
          <span
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--brand-primary)',
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
            }}
          >
            Fabb6 WMS
          </span>
        )}
        <button
          onClick={toggle}
          title={isCollapsed ? 'Expand sidebar (\\)' : 'Collapse sidebar (\\)'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            transition: 'background-color 120ms ease, color 120ms ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'var(--surface-sunken)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'transparent';
            (e.currentTarget as HTMLButtonElement).style.color =
              'var(--text-muted)';
          }}
        >
          {isCollapsed ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronLeft size={16} />
          )}
        </button>
      </div>

      {/* Nav sections */}
      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 8px',
        }}
        aria-label="Main navigation"
      >
        {visibleSections.map((section) => (
          <div key={section.header} style={{ marginBottom: '4px' }}>
            {/* Section header — hidden when collapsed */}
            {!isCollapsed && (
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
            )}
            {section.items.map((item) => {
              const active =
                item.to === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.to);
              const Icon = item.icon;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={isCollapsed ? item.label : undefined}
                  onClick={() => isMobile && setDrawerOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: isCollapsed ? 0 : '12px',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    height: '40px',
                    padding: isCollapsed ? '0' : '0 12px',
                    borderRadius: '6px',
                    marginBottom: '2px',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: active ? 600 : 500,
                    color: active ? '#FFFFFF' : 'var(--text)',
                    backgroundColor: active
                      ? 'var(--brand-primary)'
                      : 'transparent',
                    transition: 'background-color 150ms ease, color 150ms ease',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                        'var(--surface-sunken)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                        'transparent';
                    }
                  }}
                >
                  <Icon
                    size={20}
                    aria-hidden="true"
                    style={{ flexShrink: 0 }}
                  />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User info + sign out */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: isCollapsed ? '12px 0' : '12px',
          flexShrink: 0,
        }}
      >
        {isCollapsed ? (
          <div
            style={{ display: 'flex', justifyContent: 'center' }}
            title={user ? `${user.name} (${user.role})` : 'User'}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: avatarBg,
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700,
                flexShrink: 0,
                userSelect: 'none',
              }}
            >
              {initials}
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '10px',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: avatarBg,
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user?.name ?? 'Unknown'}
                </div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    marginTop: '2px',
                    padding: '1px 7px',
                    borderRadius: '4px',
                    backgroundColor: avatarBg,
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    textTransform: 'capitalize',
                  }}
                >
                  {user?.role ?? ''}
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              style={{
                width: '100%',
                height: '34px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-muted)',
                transition: 'background-color 120ms ease, color 120ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'var(--scan-error-bg)';
                (e.currentTarget as HTMLButtonElement).style.color =
                  'var(--scan-error)';
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  'var(--scan-error)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'transparent';
                (e.currentTarget as HTMLButtonElement).style.color =
                  'var(--text-muted)';
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  'var(--border)';
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        height: '100dvh',
        backgroundColor: 'var(--surface-sunken)',
        overflow: 'hidden',
      }}
    >
      {/* ── Mobile backdrop ── */}
      {isMobile && drawerOpen && (
        <div
          onClick={handleBackdropClick}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        ref={sidebarRef}
        style={{
          width: isMobile
            ? drawerOpen
              ? '240px'
              : '0'
            : `${sidebarWidth}px`,
          transition: 'width 200ms ease',
          flexShrink: 0,
          overflow: 'hidden',
          position: isMobile ? 'fixed' : 'relative',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: isMobile ? 50 : 'auto',
        }}
      >
        <div style={{ width: isMobile ? '240px' : '100%', height: '100%' }}>
          {sidebarContent}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {/* Page header */}
        <header
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            padding: '0 24px',
            height: '56px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav aria-label="Breadcrumb" style={{ marginBottom: '2px' }}>
                <ol
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                >
                  {breadcrumbs.map((crumb, i) => (
                    <li
                      key={i}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      {i > 0 && <span aria-hidden="true">/</span>}
                      {crumb.to ? (
                        <Link
                          to={crumb.to}
                          style={{
                            color: 'var(--text-muted)',
                            textDecoration: 'none',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLAnchorElement).style.textDecoration =
                              'underline';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLAnchorElement).style.textDecoration =
                              'none';
                          }}
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span>{crumb.label}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            <h1
              style={{
                margin: 0,
                fontSize: '17px',
                fontWeight: 700,
                color: 'var(--text)',
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {heading}
            </h1>
          </div>

          {toolbar && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexShrink: 0,
              }}
            >
              {toolbar}
            </div>
          )}
        </header>

        {/* Scrollable content */}
        <main
          className="scroll-container"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
          }}
        >
          {children}
        </main>

        <SyncStatusBar />
      </div>
    </div>
  );
}
