import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SyncStatusBar } from './SyncStatusBar';
import { useSessionStore } from '@/stores/sessionStore';
import { Button } from '@/components/ui/Button';

interface NavItem {
  label: string;
  to: string;
  icon?: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: '⊞' },
  { label: 'Inward', to: '/inward', icon: '↓', roles: ['floor_worker', 'supervisor', 'manager', 'admin'] },
  { label: 'Putaway', to: '/putaway', icon: '⊡', roles: ['floor_worker', 'supervisor', 'manager', 'admin'] },
  { label: 'Picking', to: '/picking', icon: '↑', roles: ['floor_worker', 'supervisor', 'manager', 'admin'] },
  { label: 'Packing', to: '/packing', icon: '◻', roles: ['floor_worker', 'supervisor', 'manager', 'admin'] },
  { label: 'Counts', to: '/counting', icon: '#', roles: ['floor_worker', 'supervisor', 'manager', 'admin'] },
  { label: 'Returns', to: '/returns', icon: '⟲', roles: ['floor_worker', 'supervisor', 'manager', 'admin'] },
  { label: 'Stock', to: '/stock', icon: '▤', roles: ['supervisor', 'manager', 'admin'] },
];

interface DeskLayoutProps {
  heading: string;
  /** Optional breadcrumbs rendered below the heading */
  breadcrumbs?: { label: string; to?: string }[];
  /** Toolbar content — search, filters, action buttons */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * DeskLayout — dense management layout for seated users with a mouse.
 *
 * Features a persistent sidebar nav and normal text sizing.
 */
export function DeskLayout({ heading, breadcrumbs, toolbar, children }: DeskLayoutProps) {
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const { pathname } = useLocation();

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  );

  return (
    <div className="flex h-dvh bg-[var(--surface-sunken)]">
      {/* ── Sidebar ── */}
      <aside className="w-52 shrink-0 flex flex-col bg-[var(--brand-primary)] text-white">
        <div className="px-4 py-4 border-b border-white/10">
          <p className="text-lg font-bold">Fabb6 WMS</p>
          {user && (
            <p className="text-xs opacity-60 mt-0.5 truncate">{user.name}</p>
          )}
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {visibleNav.map((item) => {
            const active =
              item.to === '/'
                ? pathname === '/'
                : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={[
                  'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10',
                ].join(' ')}
              >
                {item.icon && (
                  <span className="text-base w-5 text-center" aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-white/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-white/70 hover:text-white hover:bg-white/10 w-full justify-start"
          >
            Sign out
          </Button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Page header */}
        <header className="shrink-0 px-6 py-4 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between gap-4">
          <div>
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav aria-label="Breadcrumb" className="mb-1">
                <ol className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  {breadcrumbs.map((crumb, i) => (
                    <li key={i} className="flex items-center gap-1">
                      {i > 0 && <span aria-hidden="true">/</span>}
                      {crumb.to ? (
                        <Link to={crumb.to} className="hover:underline">
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
            <h1 className="text-xl font-semibold text-[var(--text)]">{heading}</h1>
          </div>

          {toolbar && <div className="flex items-center gap-2 shrink-0">{toolbar}</div>}
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto scroll-container px-6 py-6">
          {children}
        </main>

        <SyncStatusBar />
      </div>
    </div>
  );
}
