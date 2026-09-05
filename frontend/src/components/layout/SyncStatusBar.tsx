import { useQueueStore, type SyncState } from '@/stores/queueStore';

const stateConfig: Record<
  SyncState,
  { label: string; colorClass: string; dotClass: string }
> = {
  idle: {
    label: 'Synced',
    colorClass: 'text-[var(--scan-ok)]',
    dotClass: 'bg-[var(--scan-ok)]',
  },
  syncing: {
    label: 'Syncing…',
    colorClass: 'text-[var(--scan-warn)]',
    dotClass: 'bg-[var(--scan-warn)] animate-pulse',
  },
  error: {
    label: 'Sync error',
    colorClass: 'text-[var(--scan-error)]',
    dotClass: 'bg-[var(--scan-error)]',
  },
  offline: {
    label: 'Offline',
    colorClass: 'text-[var(--text-muted)]',
    dotClass: 'bg-[var(--text-muted)]',
  },
};

/**
 * SyncStatusBar — always-visible queue depth and sync state indicator.
 *
 * Render this at the bottom of every layout so floor workers can see
 * how many mutations are queued and whether the device is online.
 */
export function SyncStatusBar() {
  const { depth, syncState, conflicts, lastSyncAt } = useQueueStore();
  const cfg = stateConfig[syncState];

  const formattedLastSync = lastSyncAt
    ? new Intl.DateTimeFormat('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(lastSyncAt))
    : null;

  return (
    <div
      role="status"
      aria-label="Synchronisation status"
      className="flex items-center gap-4 px-4 py-2 bg-[var(--surface-sunken)] border-t border-[var(--border)] text-xs select-none"
    >
      {/* Status dot + label */}
      <div className={`flex items-center gap-1.5 font-medium ${cfg.colorClass}`}>
        <span className={`inline-block h-2 w-2 rounded-full ${cfg.dotClass}`} aria-hidden="true" />
        {cfg.label}
      </div>

      {/* Queue depth */}
      {depth > 0 && (
        <div className="flex items-center gap-1 text-[var(--text-muted)]">
          <span className="font-mono tabular font-semibold text-[var(--brand-accent)]">
            {depth}
          </span>
          <span>{depth === 1 ? 'change' : 'changes'} queued</span>
        </div>
      )}

      {/* Conflict count */}
      {conflicts.length > 0 && (
        <div className="flex items-center gap-1 text-[var(--scan-error)] font-semibold">
          <span>⚠</span>
          <span>{conflicts.length} {conflicts.length === 1 ? 'conflict' : 'conflicts'}</span>
        </div>
      )}

      {/* Last sync time — right-aligned */}
      {formattedLastSync && (
        <span className="ml-auto text-[var(--text-muted)]">
          Last sync {formattedLastSync}
        </span>
      )}
    </div>
  );
}
