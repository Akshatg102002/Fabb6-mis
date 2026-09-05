import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type UserRole = 'floor_worker' | 'supervisor' | 'manager' | 'admin';

export interface AuthUser {
  id: string;
  name: string;
  pin: string; // hashed, never plaintext after login
  role: UserRole;
  badgeId: string;
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
  isAuthenticated: boolean;
  session: ScanSession;

  // Actions
  login: (user: AuthUser) => void;
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

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      session: defaultSession,

      login: (user) =>
        set({
          user,
          isAuthenticated: true,
          session: defaultSession,
        }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          session: defaultSession,
        }),

      startSession: (mode, taskId = null, locationId = null) =>
        set((state) => ({
          session: {
            ...defaultSession,
            mode,
            taskId,
            locationId,
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
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
