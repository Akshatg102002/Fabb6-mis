import Dexie, { type EntityTable } from 'dexie';

export type MutationStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

export interface OfflineMutation {
  id?: number;
  timestamp: number;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body: unknown;
  idempotencyKey: string;
  retries: number;
  status: MutationStatus;
  lastError?: string;
  nextRetryAt?: number;
}

class Fabb6OfflineDB extends Dexie {
  mutations!: EntityTable<OfflineMutation, 'id'>;

  constructor() {
    super('fabb6-offline');

    this.version(1).stores({
      mutations:
        '++id, timestamp, endpoint, method, idempotencyKey, retries, status, nextRetryAt',
    });
  }
}

export const db = new Fabb6OfflineDB();

/** Add a mutation to the offline queue */
export async function enqueue(
  mutation: Omit<OfflineMutation, 'id' | 'timestamp' | 'retries' | 'status'>,
): Promise<number> {
  return db.mutations.add({
    ...mutation,
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
  });
}

/** Mark a mutation as successfully synced by deleting it */
export async function dequeue(id: number): Promise<void> {
  await db.mutations.delete(id);
}

/** Get all pending mutations ordered by timestamp */
export async function getPending(): Promise<OfflineMutation[]> {
  return db.mutations
    .where('status')
    .anyOf(['pending', 'failed'])
    .and((m) => !m.nextRetryAt || m.nextRetryAt <= Date.now())
    .sortBy('timestamp');
}

/** Count queued mutations (all non-conflict) */
export async function getQueueDepth(): Promise<number> {
  return db.mutations
    .where('status')
    .anyOf(['pending', 'syncing', 'failed'])
    .count();
}

/** Update mutation status and retry metadata */
export async function updateMutationStatus(
  id: number,
  updates: Partial<Pick<OfflineMutation, 'status' | 'retries' | 'lastError' | 'nextRetryAt'>>,
): Promise<void> {
  await db.mutations.update(id, updates);
}
