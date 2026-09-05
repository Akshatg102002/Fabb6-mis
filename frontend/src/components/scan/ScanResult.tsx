interface ScanResultProps {
  status: 'ok' | 'warn' | 'error' | 'idle';
  message: string;
  detail?: string;
}

const CONFIG = {
  ok: {
    bg: 'var(--scan-ok)',
    bgLight: 'var(--scan-ok-bg)',
    textColor: '#ffffff',
    icon: (
      <svg
        width="72"
        height="72"
        viewBox="0 0 72 72"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="36" cy="36" r="34" fill="rgba(255,255,255,0.2)" />
        <polyline
          points="20,38 31,50 52,24"
          stroke="#ffffff"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  warn: {
    bg: 'var(--scan-warn)',
    bgLight: 'var(--scan-warn-bg)',
    textColor: '#ffffff',
    icon: (
      <svg
        width="72"
        height="72"
        viewBox="0 0 72 72"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="36" cy="36" r="34" fill="rgba(255,255,255,0.2)" />
        <line x1="36" y1="22" x2="36" y2="44" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
        <circle cx="36" cy="52" r="3" fill="#ffffff" />
      </svg>
    ),
  },
  error: {
    bg: 'var(--scan-error)',
    bgLight: 'var(--scan-error-bg)',
    textColor: '#ffffff',
    icon: (
      <svg
        width="72"
        height="72"
        viewBox="0 0 72 72"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="36" cy="36" r="34" fill="rgba(255,255,255,0.2)" />
        <line x1="24" y1="24" x2="48" y2="48" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
        <line x1="48" y1="24" x2="24" y2="48" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
      </svg>
    ),
  },
  idle: {
    bg: 'var(--surface-sunken)',
    bgLight: 'var(--surface-sunken)',
    textColor: 'var(--text-muted)',
    icon: (
      <svg
        width="72"
        height="72"
        viewBox="0 0 72 72"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="36" cy="36" r="34" stroke="var(--border)" strokeWidth="2" />
        <rect x="26" y="28" width="20" height="3" rx="1.5" fill="var(--border)" />
        <rect x="26" y="35" width="20" height="3" rx="1.5" fill="var(--border)" />
        <rect x="26" y="42" width="14" height="3" rx="1.5" fill="var(--border)" />
      </svg>
    ),
  },
} as const;

export function ScanResult({ status, message, detail }: ScanResultProps) {
  const cfg = CONFIG[status];

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.25rem',
        padding: '2rem 1.5rem',
        backgroundColor: cfg.bg,
        color: cfg.textColor,
        borderRadius: '16px',
        textAlign: 'center',
        minHeight: '240px',
      }}
    >
      {cfg.icon}

      <div>
        <p
          style={{
            margin: 0,
            fontSize: '2rem',
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          {message}
        </p>
        {detail && (
          <p
            style={{
              margin: '0.5rem 0 0',
              fontSize: '1.125rem',
              opacity: 0.85,
            }}
          >
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

export default ScanResult;
