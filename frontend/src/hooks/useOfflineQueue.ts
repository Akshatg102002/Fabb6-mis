import { useEffect, useCallback, useRef } from 'react';
import {
  enqueue,
  dequeue,
  getPending,
  getQueueDepth,
  updateMutationStatus,
  type OfflineMutation,
} from '@/db/offline';
import { useQueueStore } from '@/stores/queueStore';
import { apiClient } from '@/api/client';

const BASE_DELAY_MS = 2_000;
const MAX_RETRIES = 7;

function backoffDelay(retries: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** retries, 60_000);
}

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useOfflineQueue() {
  const { setDepth, setSyncState, addConflict, recordSuccessfulSync, setLastSyncError } =
    useQueueStore();

  const isSyncingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshDepth = useCallback(async () => {
    const depth = await getQueueDepth();
    setDepth(depth);
  }, [setDepth]);

  const syncOneMutation = useCallback(
    async (mutation: OfflineMutation): Promise<boolean> => {
      if (!mutation.id) return false;

      await updateMutationStatus(mutation.id, { status: 'syncing' });

      try {
        await apiClient(mutation.endpoint, {
          method: mutation.method,
          body: mutation.body,
          headers: {
            'Idempotency-Key': mutation.idempotencyKey,
          },
        });

        await dequeue(mutation.id);
        return true;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const isConflict =
          err instanceof Response
            ? err.status === 409
            : message.includes('409') || message.includes('conflict');

        if (isConflict) {
          await updateMutationStatus(mutation.id, {
            status: 'conflict',
            lastError: message,
          });
          addConflict({
            id: mutation.id,
            endpoint: mutation.endpoint,
            body: mutation.body,
            serverMessage: message,
          });
          return false;
        }

        const nextRetries = mutation.retries + 1;

        if (nextRetries >= MAX_RETRIES) {
          await updateMutationStatus(mutation.id, {
            status: 'failed',
            retries: nextRetries,
            lastError: message,
          });
        } else {
          await updateMutationStatus(mutation.id, {
            status: 'failed',
            retries: nextRetries,
            lastError: message,
            nextRetryAt: Date.now() + backoffDelay(nextRetries),
          });
        }

        return false;
      }
    },
    [addConflict],
  );

  const runSync = useCallback(async () => {
    if (isSyncingRef.current || !navigator.onLine) return;

    isSyncingRef.current = true;
    setSyncState('syncing');

    try {
      const pending = await getPending();
      let anyFailed = false;

      for (const mutation of pending) {
        const ok = await syncOneMutation(mutation);
        if (!ok) anyFailed = true;
      }

      await refreshDepth();

      if (anyFailed) {
        setSyncState('error');
        setLastSyncError('Some mutations failed to sync');
      } else {
        recordSuccessfulSync();
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [setSyncState, syncOneMutation, refreshDepth, recordSuccessfulSync, setLastSyncError]);

  // Sync on reconnect
  useEffect(() => {
    const onOnline = () => {
      setSyncState('idle');
      void runSync();
    };
    const onOffline = () => setSyncState('offline');

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    if (!navigator.onLine) setSyncState('offline');

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [runSync, setSyncState]);

  // Periodic sync every 30s
  useEffect(() => {
    void refreshDepth();
    void runSync();

    timerRef.current = setInterval(() => {
      void runSync();
      void refreshDepth();
    }, 30_000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [runSync, refreshDepth]);

  /** Queue a mutation for offline-first execution */
  const queueMutation = useCallback(
    async (
      endpoint: string,
      method: OfflineMutation['method'],
      body: unknown,
      idempotencyKey?: string,
    ): Promise<void> => {
      await enqueue({
        endpoint,
        method,
        body,
        idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
      });

      await refreshDepth();

      // Attempt immediate sync if online
      if (navigator.onLine) {
        void runSync();
      }
    },
    [runSync, refreshDepth],
  );

  return { queueMutation, runSync, refreshDepth };
}
