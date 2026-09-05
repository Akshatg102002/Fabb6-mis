import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type UserRole = 'picker' | 'packer' | 'inward' | 'returns' | 'supervisor' | 'admin' | 'read_only';

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  site_id: string | null;
}

export type ScanMode =
  | 'idle'
  | 'grn'
  | 'putaway'
  | 'picking'
  | 'packing'
  | 'cycle_count'
  | 'return';

export interface ScanSession {
  mode: ScanMode;
  taskId: string | null;
  locationId: string | null;
  startedAt: number | null;
  scansInSession: number;
  lastScanBarcode: string | null;
  lastScanOutcome: 'ok' | 'warn' | 'error' | null;
}

interface SessionState {
  user: AuthUser | null;
  token: string | null;
  deviceId: string;
  isAuthenticated: boolean;
  session: ScanSession;

  // Actions
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  startSession: (mode: ScanMode, taskId?: string, locationId?: string) => void;
  endSession: () => void;
  recordScan: (barcode: string, outcome: 'ok' | 'warn' | 'error') => void;
  setLocation: (locationId: string) => void;
}

const defaultSession: ScanSession = {
  mode: 'idle',
  taskId: null,
  locationId: null,
  startedAt: null,
  scansInSession: 0,
  lastScanBarcode: null,
  lastScanOutcome: null,
};

function getOrCreateDeviceId(): string {
  try {
    const key = 'fabb6-device-id';
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return 'device-' + Math.random().toString(36).slice(2);
  }
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      deviceId: getOrCreateDeviceId(),
      isAuthenticated: false,
      session: defaultSession,

      login: (user, token) =>
        set({
          user,
          token,
          isAuthenticated: true,
          session: defaultSession,
        }),

      logout: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          session: defaultSession,
        }),

      startSession: (mode, taskId = undefined, locationId = undefined) =>
        set((state) => ({
          session: {
            ...defaultSession,
            mode,
            taskId: taskId ?? null,
            locationId: locationId ?? null,
            startedAt: Date.now(),
            scansInSession: 0,
            lastScanBarcode: state.session.lastScanBarcode,
            lastScanOutcome: null,
          },
        })),

      endSession: () =>
        set((state) => ({
          session: {
            ...defaultSession,
            mode: 'idle',
            // Retain who the user is between tasks
            lastScanBarcode: state.session.lastScanBarcode,
          },
        })),

      recordScan: (barcode, outcome) =>
        set((state) => ({
          session: {
            ...state.session,
            scansInSession: state.session.scansInSession + 1,
            lastScanBarcode: barcode,
            lastScanOutcome: outcome,
          },
        })),

      setLocation: (locationId) =>
        set((state) => ({
          session: { ...state.session, locationId },
        })),
    }),
    {
      name: 'fabb6-session',
      storage: createJSONStorage(() => sessionStorage),
      // Do not persist the scan session itself — workers should start fresh
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        deviceId: state.deviceId,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
