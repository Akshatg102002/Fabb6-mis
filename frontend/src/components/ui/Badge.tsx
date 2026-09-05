import { type ReactNode } from 'react';

type BadgeVariant = 'default' | 'ok' | 'warn' | 'error' | 'info' | 'muted';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    'bg-[var(--surface-sunken)] text-[var(--text)] border border-[var(--border)]',
  ok: 'bg-[var(--scan-ok-bg)] text-[var(--scan-ok)] border border-[var(--scan-ok)]',
  warn: 'bg-[var(--scan-warn-bg)] text-[var(--scan-warn)] border border-[var(--scan-warn)]',
  error:
    'bg-[var(--scan-error-bg)] text-[var(--scan-error)] border border-[var(--scan-error)]',
  info: 'bg-blue-50 text-blue-700 border border-blue-200',
  muted: 'bg-transparent text-[var(--text-muted)] border border-[var(--border)]',
};

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tabular ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

// Status label badge for GRN/pick/pack/count statuses
type StatusKey = string;

const STATUS_VARIANT_MAP: Record<StatusKey, BadgeVariant> = {
  complete: 'ok',
  complete_: 'ok',
  packed: 'ok',
  dispatched: 'ok',
  received: 'ok',
  qc_done: 'ok',
  picked: 'ok',
  partial: 'warn',
  in_progress: 'warn',
  receiving: 'warn',
  syncing: 'warn',
  short: 'warn',
  over: 'warn',
  discrepancy: 'warn',
  pending: 'muted',
  awaiting: 'muted',
  scheduled: 'muted',
  assigned: 'muted',
  waiting: 'muted',
  draft: 'muted',
  open: 'info',
  failed: 'error',
  conflict: 'error',
  rejected: 'error',
  damaged: 'error',
  urgent: 'error',
  same_day: 'warn',
};

export function StatusBadge({ status }: { status: string }) {
  const variant: BadgeVariant = STATUS_VARIANT_MAP[status.toLowerCase()] ?? 'default';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge variant={variant}>{label}</Badge>;
}
