import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCopy } from 'lucide-react';
import { DeskLayout } from '@/components/layout/DeskLayout';
import { useSessionStore, type UserRole } from '@/stores/sessionStore';
import { useQueueStore } from '@/stores/queueStore';
import { useToast } from '@/components/toast/ToastProvider';
import { apiClient, type ApiError } from '@/api/client';

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '20px 24px',
        marginBottom: '16px',
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        color: 'var(--text-muted)',
        marginBottom: '12px',
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'block',
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text)',
        marginBottom: '6px',
      }}
    >
      {children}
    </label>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  style,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { id?: string }) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        width: '100%',
        height: '36px',
        padding: '0 10px',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        fontSize: '13px',
        color: 'var(--text)',
        backgroundColor: '#FFFFFF',
        outline: 'none',
        fontFamily: 'inherit',
        transition: 'border-color 120ms ease',
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--brand-primary)';
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(11,79,156,0.1)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
      {...rest}
    />
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
}

function ToggleSwitch({ checked, onChange, id }: ToggleSwitchProps) {
  return (
    <button
      role="switch"
      id={id}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        padding: '2px',
        border: 'none',
        cursor: 'pointer',
        backgroundColor: checked ? 'var(--brand-primary)' : 'var(--border)',
        transition: 'background-color 200ms ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'block',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: '#FFFFFF',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform 200ms ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}

// ── Tab 1: Device & Scanner ───────────────────────────────────────────────────

function readLS(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

interface ScanResult {
  barcode: string;
  ms: number;
}

function DeviceScannerTab() {
  const deviceId = useSessionStore((s) => s.deviceId);
  const { toast } = useToast();

  // Scanner mode
  const [scanMode, setScanMode] = useState<'hid' | 'manual'>(
    () => (readLS('fabb6-scanner-mode', 'hid') as 'hid' | 'manual'),
  );

  const handleScanModeChange = (v: boolean) => {
    const next = v ? 'hid' : 'manual';
    setScanMode(next);
    writeLS('fabb6-scanner-mode', next);
  };

  // Scanner test
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const scanBufferRef = useRef('');
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanStartRef = useRef<number>(0);

  const handleScanKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = performance.now();

    if (scanTimerRef.current === null) {
      // First keydown in this burst
      scanStartRef.current = now;
      scanBufferRef.current = '';
    } else {
      clearTimeout(scanTimerRef.current);
    }

    if (e.key === 'Enter') {
      // Commit
      const barcode = scanBufferRef.current;
      if (barcode) {
        setScanResult({ barcode, ms: Math.round(now - scanStartRef.current) });
      }
      scanBufferRef.current = '';
      scanTimerRef.current = null;
      e.preventDefault();
      return;
    }

    if (e.key.length === 1) {
      scanBufferRef.current += e.key;
    }

    // Reset buffer after 40ms of silence → treat as final if no Enter
    scanTimerRef.current = setTimeout(() => {
      const barcode = scanBufferRef.current;
      if (barcode) {
        setScanResult({ barcode, ms: Math.round(performance.now() - scanStartRef.current) });
      }
      scanBufferRef.current = '';
      scanTimerRef.current = null;
    }, 40);
  }, []);

  // Printer settings
  const [printerHost, setPrinterHost] = useState(() => readLS('fabb6-printer-host', ''));
  const [printerPort, setPrinterPort] = useState(() => readLS('fabb6-printer-port', '9100'));
  const [testPrinting, setTestPrinting] = useState(false);

  const handlePrinterHostChange = (v: string) => {
    setPrinterHost(v);
    writeLS('fabb6-printer-host', v);
  };

  const handlePrinterPortChange = (v: string) => {
    setPrinterPort(v);
    writeLS('fabb6-printer-port', v);
  };

  const handleTestPrint = async () => {
    setTestPrinting(true);
    try {
      await apiClient('/print-jobs/test', { method: 'POST' });
      toast({ message: 'Test page sent to printer', type: 'success' });
    } catch (err) {
      const msg =
        (err as ApiError)?.message ?? 'Failed to send test page to printer';
      toast({ message: msg, type: 'error' });
    } finally {
      setTestPrinting(false);
    }
  };

  return (
    <div>
      {/* Device ID */}
      <SectionCard>
        <SectionLabel>Device</SectionLabel>
        <FieldLabel>Device ID</FieldLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <code
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: 'var(--surface-sunken)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
              fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
              color: 'var(--text)',
              wordBreak: 'break-all',
            }}
          >
            {deviceId}
          </code>
          <button
            title="Copy Device ID"
            aria-label="Copy Device ID"
            onClick={() => {
              navigator.clipboard.writeText(deviceId).then(() => {
                toast({ message: 'Device ID copied to clipboard', type: 'success' });
              }).catch(() => {
                toast({ message: 'Could not copy to clipboard', type: 'error' });
              });
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              flexShrink: 0,
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              transition: 'background-color 120ms ease, color 120ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface-sunken)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
            }}
          >
            <ClipboardCopy size={16} />
          </button>
        </div>
      </SectionCard>

      {/* Scanner mode */}
      <SectionCard>
        <SectionLabel>Scanner Input</SectionLabel>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
              USB HID / Keyboard wedge
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {scanMode === 'hid'
                ? 'Barcode scanner sends keypresses — active'
                : 'Manual entry only — scanner input disabled'}
            </div>
          </div>
          <ToggleSwitch
            checked={scanMode === 'hid'}
            onChange={handleScanModeChange}
            id="scanner-mode-toggle"
          />
        </div>
      </SectionCard>

      {/* Scanner test */}
      <SectionCard>
        <SectionLabel>Scanner Test</SectionLabel>
        <FieldLabel htmlFor="scanner-test-input">
          Scan a barcode to test
        </FieldLabel>
        <TextInput
          id="scanner-test-input"
          placeholder="Click here, then scan a barcode…"
          onKeyDown={handleScanKeyDown}
          readOnly
          style={{ marginBottom: '10px', cursor: 'text' }}
        />
        {scanResult && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              backgroundColor: 'var(--scan-ok-bg)',
              border: '1px solid var(--scan-ok)',
              borderRadius: '6px',
            }}
          >
            <code
              style={{
                flex: 1,
                fontSize: '13px',
                fontFamily: "'IBM Plex Mono', monospace",
                color: 'var(--scan-ok)',
                wordBreak: 'break-all',
              }}
            >
              {scanResult.barcode}
            </code>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--scan-ok)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {scanResult.ms} ms
            </span>
            <button
              aria-label="Clear scan result"
              onClick={() => setScanResult(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--text-muted)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontFamily: 'inherit',
              }}
            >
              Clear
            </button>
          </div>
        )}
      </SectionCard>

      {/* Thermal printer */}
      <SectionCard>
        <SectionLabel>Thermal Printer</SectionLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '12px',
            marginBottom: '14px',
          }}
        >
          <div>
            <FieldLabel htmlFor="printer-host">Printer Host (IP)</FieldLabel>
            <TextInput
              id="printer-host"
              value={printerHost}
              onChange={(e) => handlePrinterHostChange(e.target.value)}
              placeholder="192.168.1.100"
            />
          </div>
          <div>
            <FieldLabel htmlFor="printer-port">Port</FieldLabel>
            <TextInput
              id="printer-port"
              value={printerPort}
              onChange={(e) => handlePrinterPortChange(e.target.value)}
              placeholder="9100"
              style={{ width: '90px' }}
            />
          </div>
        </div>

        <button
          onClick={handleTestPrint}
          disabled={testPrinting}
          style={{
            height: '36px',
            padding: '0 18px',
            borderRadius: '6px',
            border: '1px solid var(--brand-primary)',
            backgroundColor: 'var(--brand-primary)',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: testPrinting ? 'not-allowed' : 'pointer',
            opacity: testPrinting ? 0.6 : 1,
            transition: 'opacity 120ms ease',
          }}
        >
          {testPrinting ? 'Sending…' : 'Test Print'}
        </button>
      </SectionCard>
    </div>
  );
}

// ── Tab 2: System Status ──────────────────────────────────────────────────────

type StatusLevel = 'ok' | 'warn' | 'error' | 'unknown';

interface StatusCardData {
  title: string;
  value: string;
  level: StatusLevel;
  subtitle?: string;
}

const DOT_COLOURS: Record<StatusLevel, string> = {
  ok: 'var(--scan-ok)',
  warn: 'var(--scan-warn)',
  error: 'var(--scan-error)',
  unknown: 'var(--text-muted)',
};

function StatusCard({ title, value, level, subtitle }: StatusCardData) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
        }}
      >
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: DOT_COLOURS[level],
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text)',
          }}
        >
          {title}
        </span>
      </div>
      <div
        style={{
          fontSize: '20px',
          fontWeight: 700,
          color: level === 'ok' ? 'var(--scan-ok)' : level === 'error' ? 'var(--scan-error)' : level === 'warn' ? 'var(--scan-warn)' : 'var(--text-muted)',
          textTransform: 'capitalize',
        }}
      >
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

interface HealthResponse {
  db?: 'ok' | 'error';
  status?: 'ok' | 'error';
}

function SystemStatusTab() {
  const depth = useQueueStore((s) => s.depth);
  const [dbStatus, setDbStatus] = useState<StatusLevel>('unknown');
  const [apiStatus, setApiStatus] = useState<StatusLevel>('unknown');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const shopifySync = (() => {
    try {
      return localStorage.getItem('fabb6-last-shopify-sync') ?? null;
    } catch {
      return null;
    }
  })();

  const formatSyncTime = (raw: string | null): string => {
    if (!raw) return 'Never';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return 'Never';
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  };

  const fetchHealth = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await apiClient<HealthResponse>('/health');
      setDbStatus(data?.db === 'ok' ? 'ok' : 'error');
      setApiStatus('ok');
    } catch {
      setApiStatus('error');
      setDbStatus('unknown');
    } finally {
      setRefreshing(false);
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const checkedLabel = lastChecked
    ? `Checked ${new Intl.DateTimeFormat('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(lastChecked)}`
    : 'Checking…';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          {checkedLabel} · auto-refreshes every 30 s
        </div>
        <button
          onClick={fetchHealth}
          disabled={refreshing}
          style={{
            height: '32px',
            padding: '0 14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'none',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text)',
            fontFamily: 'inherit',
            opacity: refreshing ? 0.5 : 1,
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh all'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        <StatusCard
          title="Database"
          value={dbStatus === 'unknown' ? 'Unknown' : dbStatus === 'ok' ? 'Healthy' : 'Error'}
          level={dbStatus}
          subtitle={checkedLabel}
        />
        <StatusCard
          title="Backend API"
          value={apiStatus === 'unknown' ? 'Unknown' : apiStatus === 'ok' ? 'Reachable' : 'Unreachable'}
          level={apiStatus}
          subtitle={checkedLabel}
        />
        <StatusCard
          title="Shopify Sync"
          value={shopifySync ? 'Synced' : 'Never synced'}
          level={shopifySync ? 'ok' : 'warn'}
          subtitle={`Last: ${formatSyncTime(shopifySync)}`}
        />
        <StatusCard
          title="Offline Queue"
          value={depth === 0 ? 'Empty' : `${depth} queued`}
          level={depth === 0 ? 'ok' : 'warn'}
          subtitle={depth > 0 ? `${depth} change${depth === 1 ? '' : 's'} pending sync` : 'All changes synced'}
        />
      </div>
    </div>
  );
}

// ── Tab 3: About ──────────────────────────────────────────────────────────────

const ROLE_COLOURS: Record<UserRole, string> = {
  picker: '#4B6FE3',
  packer: '#7B52D0',
  inward: '#1A8C5F',
  returns: '#C47700',
  supervisor: '#0B4F9C',
  admin: '#C42B1C',
  read_only: '#5A6884',
};

function AboutTab() {
  const user = useSessionStore((s) => s.user);

  const shopifySync = (() => {
    try {
      return localStorage.getItem('fabb6-last-shopify-sync') ?? null;
    } catch {
      return null;
    }
  })();

  const formatSyncTime = (raw: string | null): string => {
    if (!raw) return 'Never';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return 'Never';
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  };

  const roleColor = user?.role ? (ROLE_COLOURS[user.role] ?? 'var(--brand-primary)') : 'var(--brand-primary)';

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: 'Application',
      value: (
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>Fabb6 WMS</span>
      ),
    },
    {
      label: 'Version',
      value: (
        <code
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            backgroundColor: 'var(--surface-sunken)',
            padding: '2px 7px',
            borderRadius: '4px',
            color: 'var(--text)',
          }}
        >
          v1.0.0
        </code>
      ),
    },
    {
      label: 'Signed in as',
      value: user ? (
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{user.name}</span>
      ) : (
        '—'
      ),
    },
    {
      label: 'Role',
      value: user?.role ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor: roleColor,
            color: '#FFFFFF',
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'capitalize',
          }}
        >
          {user.role.replace('_', ' ')}
        </span>
      ) : (
        '—'
      ),
    },
    {
      label: 'Site ID',
      value: user?.site_id ? (
        <code
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            backgroundColor: 'var(--surface-sunken)',
            padding: '2px 7px',
            borderRadius: '4px',
            color: 'var(--text)',
          }}
        >
          {user.site_id}
        </code>
      ) : (
        <span style={{ color: 'var(--text-muted)' }}>Not assigned</span>
      ),
    },
    {
      label: 'Last Shopify sync',
      value: (
        <span style={{ color: shopifySync ? 'var(--text)' : 'var(--text-muted)' }}>
          {formatSyncTime(shopifySync)}
        </span>
      ),
    },
    {
      label: 'Support',
      value: (
        <a
          href="mailto:wms@fabb6.com"
          style={{
            color: 'var(--brand-primary)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none';
          }}
        >
          wms@fabb6.com
        </a>
      ),
    },
  ];

  return (
    <SectionCard>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}
      >
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.label}
              style={{
                borderBottom:
                  i < rows.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <td
                style={{
                  padding: '12px 0',
                  paddingRight: '24px',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  width: '160px',
                  verticalAlign: 'middle',
                }}
              >
                {row.label}
              </td>
              <td
                style={{
                  padding: '12px 0',
                  fontSize: '14px',
                  color: 'var(--text)',
                  verticalAlign: 'middle',
                }}
              >
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'device' | 'status' | 'about';

interface TabDef {
  id: Tab;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'device', label: 'Device & Scanner' },
  { id: 'status', label: 'System Status' },
  { id: 'about', label: 'About' },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('device');

  return (
    <DeskLayout
      heading="Settings"
      title="Settings"
      breadcrumbs={[{ label: 'Home', to: '/home' }, { label: 'Settings' }]}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '0',
          borderBottom: '2px solid var(--border)',
          marginBottom: '24px',
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                height: '42px',
                padding: '0 18px',
                border: 'none',
                borderBottom: active
                  ? '2px solid var(--brand-primary)'
                  : '2px solid transparent',
                marginBottom: '-2px',
                background: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--brand-primary)' : 'var(--text-muted)',
                fontFamily: 'inherit',
                transition: 'color 120ms ease, border-color 120ms ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                }
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'device' && <DeviceScannerTab />}
      {activeTab === 'status' && <SystemStatusTab />}
      {activeTab === 'about' && <AboutTab />}
    </DeskLayout>
  );
}
