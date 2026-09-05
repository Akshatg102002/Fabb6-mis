import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SyncStatusBar } from './SyncStatusBar';
import { useSessionStore } from '@/stores/sessionStore';
import { Button } from '@/components/ui/Button';

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

  return (
    <div className="flex flex-col h-dvh bg-[var(--surface-sunken)] safe-top">
      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 py-3 bg-[var(--brand-primary)] text-white shrink-0">
        {backTo && (
          <Link
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
          </Link>
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
