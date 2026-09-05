import { create } from 'zustand';

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline';

interface ConflictRecord {
  id: number;
  endpoint: string;
  body: unknown;
  serverMessage: string;
  occurredAt: number;
}

interface QueueState {
  depth: number;
  syncState: SyncState;
  conflicts: ConflictRecord[];
  lastSyncAt: number | null;
  lastSyncError: string | null;

  // Actions
  setDepth: (depth: number) => void;
  setSyncState: (state: SyncState) => void;
  addConflict: (conflict: Omit<ConflictRecord, 'occurredAt'>) => void;
  dismissConflict: (id: number) => void;
  clearConflicts: () => void;
  recordSuccessfulSync: () => void;
  setLastSyncError: (err: string | null) => void;
}

export const useQueueStore = create<QueueState>()((set) => ({
  depth: 0,
  syncState: 'idle',
  conflicts: [],
  lastSyncAt: null,
  lastSyncError: null,

  setDepth: (depth) => set({ depth }),

  setSyncState: (syncState) => set({ syncState }),

  addConflict: (conflict) =>
    set((state) => ({
      conflicts: [
        ...state.conflicts,
        { ...conflict, occurredAt: Date.now() },
      ],
    })),

  dismissConflict: (id) =>
    set((state) => ({
      conflicts: state.conflicts.filter((c) => c.id !== id),
    })),

  clearConflicts: () => set({ conflicts: [] }),

  recordSuccessfulSync: () =>
    set({ lastSyncAt: Date.now(), lastSyncError: null, syncState: 'idle' }),

  setLastSyncError: (err) => set({ lastSyncError: err }),
}));
