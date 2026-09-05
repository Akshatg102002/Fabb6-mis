import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning';

export interface ToastOptions {
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastEntry extends ToastOptions {
  id: number;
  leaving: boolean;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

// ── Single toast component ────────────────────────────────────────────────────

const ICON_MAP: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
};

const BG_MAP: Record<ToastType, string> = {
  success: 'var(--scan-ok)',
  error: 'var(--scan-error)',
  warning: 'var(--scan-warn)',
};

interface ToastItemProps {
  entry: ToastEntry;
  onDismiss: (id: number) => void;
}

function ToastItem({ entry, onDismiss }: ToastItemProps) {
  const Icon = ICON_MAP[entry.type];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`toast-item${entry.leaving ? ' toast-leaving' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '12px 14px',
        maxWidth: '360px',
        width: '100%',
        borderRadius: '8px',
        backgroundColor: BG_MAP[entry.type],
        color: '#FFFFFF',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.12)',
        pointerEvents: 'all',
      }}
    >
      <Icon
        size={18}
        aria-hidden="true"
        style={{ flexShrink: 0, marginTop: '1px' }}
      />
      <span
        style={{
          flex: 1,
          fontSize: '14px',
          lineHeight: '1.45',
          fontWeight: 500,
        }}
      >
        {entry.message}
      </span>
      <button
        onClick={() => onDismiss(entry.id)}
        aria-label="Dismiss notification"
        style={{
          background: 'none',
          border: 'none',
          padding: '0',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.75)',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          marginTop: '1px',
          transition: 'color 120ms ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color =
            'rgba(255,255,255,0.75)';
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    // Mark as leaving → triggers fade-out animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    );
    // Remove from DOM after animation completes (300ms)
    const removeTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, 320);
    timers.current.set(id, removeTimer);
  }, []);

  const toast = useCallback(
    ({ message, type, duration = 3000 }: ToastOptions) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, message, type, duration, leaving: false }]);

      // Auto-dismiss after duration
      const autoTimer = setTimeout(() => {
        dismiss(id);
      }, duration);
      timers.current.set(id, autoTimer);
    },
    [dismiss],
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Keyframe styles injected once */}
      <style>{`
        @keyframes toast-slide-in {
          from {
            opacity: 0;
            transform: translateX(24px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes toast-fade-out {
          from {
            opacity: 1;
            transform: translateX(0);
            max-height: 120px;
            margin-bottom: 8px;
          }
          to {
            opacity: 0;
            transform: translateX(24px);
            max-height: 0;
            margin-bottom: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes toast-slide-in { from { opacity: 0; } to { opacity: 1; } }
          @keyframes toast-fade-out { from { opacity: 1; } to { opacity: 0; } }
        }
        .toast-item {
          animation: toast-slide-in 220ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
          margin-bottom: 8px;
          will-change: transform, opacity;
        }
        .toast-leaving {
          animation: toast-fade-out 300ms ease forwards;
        }
      `}</style>

      {/* Toast portal — fixed top-right */}
      {toasts.length > 0 && (
        <div
          aria-label="Notifications"
          style={{
            position: 'fixed',
            top: '16px',
            right: '16px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            pointerEvents: 'none',
            maxWidth: '360px',
            width: 'calc(100vw - 32px)',
          }}
        >
          {toasts.map((entry) => (
            <ToastItem key={entry.id} entry={entry} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
