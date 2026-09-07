import { useEffect, useState } from 'react';
import {
  Building2,
  Scan,
  Cog,
  Plug,
  Users,
  Printer,
  Upload,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { DeskLayout } from '@/components/layout/DeskLayout';
import StockImport from './StockImport';
import { useSessionStore } from '@/stores/sessionStore';

// ── Shared UI ─────────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '1.25rem 1.5rem',
  marginBottom: '1.25rem',
};

const LABEL: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: '0.4rem',
};

const INPUT: React.CSSProperties = {
  width: '100%',
  height: '36px',
  padding: '0 12px',
  fontSize: '14px',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  backgroundColor: 'var(--surface)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const SELECT: React.CSSProperties = { ...INPUT };

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={LABEL}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        {description && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {description}
          </div>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        style={{
          width: '42px',
          height: '24px',
          borderRadius: '12px',
          border: 'none',
          backgroundColor: checked ? 'var(--brand-primary)' : 'var(--border)',
          cursor: 'pointer',
          position: 'relative',
          transition: 'background-color 200ms',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: checked ? '21px' : '3px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            transition: 'left 200ms',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </button>
    </div>
  );
}

function SaveButton({ onClick, saved }: { onClick: () => void; saved: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: '36px',
        padding: '0 16px',
        backgroundColor: saved ? '#0e8a4f' : 'var(--brand-primary)',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background-color 300ms',
      }}
    >
      {saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
      {saved ? 'Saved' : 'Save Changes'}
    </button>
  );
}

// ── Persistence helpers ───────────────────────────────────────────────────────

function loadSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`fabb6-settings-${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveSetting<T>(key: string, value: T) {
  try {
    localStorage.setItem(`fabb6-settings-${key}`, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// ── TAB: Warehouse ─────────────────────────────────────────────────────────────

interface WarehouseConfig {
  name: string;
  address: string;
  city: string;
  pincode: string;
  gstin: string;
  timezone: string;
  currency: string;
  weightUnit: string;
}

function WarehouseSettings() {
  const [cfg, setCfg] = useState<WarehouseConfig>(() =>
    loadSetting('warehouse', {
      name: 'Fabb6 Main Warehouse',
      address: 'Plot 12, MIDC Industrial Area',
      city: 'Mumbai',
      pincode: '400093',
      gstin: '27AABCF1234G1Z5',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      weightUnit: 'kg',
    }),
  );
  const [saved, setSaved] = useState(false);

  const update = (k: keyof WarehouseConfig, v: string) => setCfg((c) => ({ ...c, [k]: v }));

  const handleSave = () => {
    saveSetting('warehouse', cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={CARD}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 1rem' }}>Site Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1rem' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <FieldGroup label="Warehouse Name">
              <input style={INPUT} value={cfg.name} onChange={(e) => update('name', e.target.value)} />
            </FieldGroup>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <FieldGroup label="Address">
              <input style={INPUT} value={cfg.address} onChange={(e) => update('address', e.target.value)} />
            </FieldGroup>
          </div>
          <FieldGroup label="City">
            <input style={INPUT} value={cfg.city} onChange={(e) => update('city', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="PIN Code">
            <input style={INPUT} value={cfg.pincode} onChange={(e) => update('pincode', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="GSTIN">
            <input
              style={{ ...INPUT, fontFamily: 'monospace', textTransform: 'uppercase' }}
              value={cfg.gstin}
              onChange={(e) => update('gstin', e.target.value.toUpperCase())}
              maxLength={15}
            />
          </FieldGroup>
          <FieldGroup label="Timezone">
            <select style={SELECT} value={cfg.timezone} onChange={(e) => update('timezone', e.target.value)}>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              <option value="UTC">UTC</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Currency">
            <select style={SELECT} value={cfg.currency} onChange={(e) => update('currency', e.target.value)}>
              <option value="INR">INR — Indian Rupee (₹)</option>
              <option value="USD">USD — US Dollar ($)</option>
              <option value="AED">AED — UAE Dirham</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Weight Unit">
            <select style={SELECT} value={cfg.weightUnit} onChange={(e) => update('weightUnit', e.target.value)}>
              <option value="kg">Kilograms (kg)</option>
              <option value="g">Grams (g)</option>
              <option value="lb">Pounds (lb)</option>
            </select>
          </FieldGroup>
        </div>
      </div>
      <SaveButton onClick={handleSave} saved={saved} />
    </div>
  );
}

// ── TAB: Scanner ──────────────────────────────────────────────────────────────

interface ScannerConfig {
  type: string;
  prefix: string;
  suffix: string;
  scanDelay: number;
  audio: boolean;
  vibration: boolean;
  minLength: number;
  maxLength: number;
  commitKey: string;
}

function ScannerSettings() {
  const [cfg, setCfg] = useState<ScannerConfig>(() =>
    loadSetting('scanner', {
      type: 'usb_hid',
      prefix: '',
      suffix: '\r',
      scanDelay: 100,
      audio: true,
      vibration: true,
      minLength: 4,
      maxLength: 50,
      commitKey: 'Enter',
    }),
  );
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof ScannerConfig>(k: K, v: ScannerConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const handleSave = () => {
    saveSetting('scanner', cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={CARD}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 1rem' }}>Device Type</h3>
        <FieldGroup label="Scanner Interface">
          <select style={SELECT} value={cfg.type} onChange={(e) => update('type', e.target.value)}>
            <option value="usb_hid">USB HID (keyboard emulation)</option>
            <option value="bluetooth">Bluetooth HID</option>
            <option value="camera">Camera (QR / DataMatrix)</option>
            <option value="serial">Serial / RS-232</option>
            <option value="rfid">RFID Reader</option>
          </select>
        </FieldGroup>
        <FieldGroup label="Commit Key">
          <select style={SELECT} value={cfg.commitKey} onChange={(e) => update('commitKey', e.target.value)}>
            <option value="Enter">Enter</option>
            <option value="Tab">Tab</option>
            <option value="\r">CR (carriage return)</option>
            <option value="\n">LF (line feed)</option>
          </select>
        </FieldGroup>
      </div>

      <div style={CARD}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 1rem' }}>Barcode Formatting</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1rem' }}>
          <FieldGroup label="Strip Prefix (chars)">
            <input
              style={{ ...INPUT, fontFamily: 'monospace' }}
              placeholder="e.g. 010"
              value={cfg.prefix}
              onChange={(e) => update('prefix', e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Strip Suffix (chars)">
            <input
              style={{ ...INPUT, fontFamily: 'monospace' }}
              placeholder="e.g. \\r"
              value={cfg.suffix}
              onChange={(e) => update('suffix', e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Min Barcode Length">
            <input
              style={INPUT}
              type="number"
              min={1}
              max={50}
              value={cfg.minLength}
              onChange={(e) => update('minLength', Number(e.target.value))}
            />
          </FieldGroup>
          <FieldGroup label="Max Barcode Length">
            <input
              style={INPUT}
              type="number"
              min={1}
              max={128}
              value={cfg.maxLength}
              onChange={(e) => update('maxLength', Number(e.target.value))}
            />
          </FieldGroup>
          <FieldGroup label="Scan Debounce (ms)">
            <input
              style={INPUT}
              type="number"
              min={0}
              max={1000}
              step={50}
              value={cfg.scanDelay}
              onChange={(e) => update('scanDelay', Number(e.target.value))}
            />
          </FieldGroup>
        </div>
      </div>

      <div style={CARD}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 0.5rem' }}>Feedback</h3>
        <Toggle
          checked={cfg.audio}
          onChange={(v) => update('audio', v)}
          label="Audio Beep"
          description="Play a beep sound on successful scan"
        />
        <Toggle
          checked={cfg.vibration}
          onChange={(v) => update('vibration', v)}
          label="Vibration"
          description="Vibrate device on scan (mobile devices only)"
        />
      </div>

      <SaveButton onClick={handleSave} saved={saved} />
    </div>
  );
}

// ── TAB: Operations ───────────────────────────────────────────────────────────

interface OpsConfig {
  pickStrategy: string;
  overReceiveTolerance: number;
  autoConfirmGRN: boolean;
  requirePOForGRN: boolean;
  allowPartialPick: boolean;
  requireWeightOnDispatch: boolean;
  negativeStockAllowed: boolean;
  cycleCountVarianceThreshold: number;
  putawayStrategy: string;
  lotTracking: boolean;
  expiryTracking: boolean;
}

function OperationsSettings() {
  const [cfg, setCfg] = useState<OpsConfig>(() =>
    loadSetting('ops', {
      pickStrategy: 'FEFO',
      overReceiveTolerance: 5,
      autoConfirmGRN: false,
      requirePOForGRN: true,
      allowPartialPick: true,
      requireWeightOnDispatch: false,
      negativeStockAllowed: false,
      cycleCountVarianceThreshold: 2,
      putawayStrategy: 'directed',
      lotTracking: true,
      expiryTracking: true,
    }),
  );
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof OpsConfig>(k: K, v: OpsConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const handleSave = () => {
    saveSetting('ops', cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={CARD}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 1rem' }}>Picking Rules</h3>
        <FieldGroup label="Pick Strategy">
          <select style={SELECT} value={cfg.pickStrategy} onChange={(e) => update('pickStrategy', e.target.value)}>
            <option value="FEFO">FEFO — First Expired, First Out</option>
            <option value="FIFO">FIFO — First In, First Out</option>
            <option value="LIFO">LIFO — Last In, First Out</option>
            <option value="MANUAL">Manual location selection</option>
          </select>
        </FieldGroup>
        <Toggle
          checked={cfg.allowPartialPick}
          onChange={(v) => update('allowPartialPick', v)}
          label="Allow Partial Pick"
          description="Pickers can confirm partial quantities and continue"
        />
        <Toggle
          checked={cfg.requireWeightOnDispatch}
          onChange={(v) => update('requireWeightOnDispatch', v)}
          label="Require Weight on Dispatch"
          description="Packing step must capture parcel weight before dispatch"
        />
      </div>

      <div style={CARD}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 1rem' }}>Inbound Rules</h3>
        <FieldGroup label="Over-Receive Tolerance (%)">
          <input
            style={INPUT}
            type="number"
            min={0}
            max={100}
            value={cfg.overReceiveTolerance}
            onChange={(e) => update('overReceiveTolerance', Number(e.target.value))}
          />
        </FieldGroup>
        <Toggle
          checked={cfg.requirePOForGRN}
          onChange={(v) => update('requirePOForGRN', v)}
          label="Require PO for GRN"
          description="Goods receipt must be linked to an approved Purchase Order"
        />
        <Toggle
          checked={cfg.autoConfirmGRN}
          onChange={(v) => update('autoConfirmGRN', v)}
          label="Auto-confirm GRN on Full Receipt"
          description="Automatically mark GRN complete when all PO lines are received"
        />
      </div>

      <div style={CARD}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 1rem' }}>Putaway</h3>
        <FieldGroup label="Putaway Strategy">
          <select style={SELECT} value={cfg.putawayStrategy} onChange={(e) => update('putawayStrategy', e.target.value)}>
            <option value="directed">Directed — system assigns bin</option>
            <option value="fixed">Fixed location per SKU</option>
            <option value="floating">Floating — worker chooses bin</option>
            <option value="zone">Zone-based rules</option>
          </select>
        </FieldGroup>
      </div>

      <div style={CARD}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 0.5rem' }}>Traceability</h3>
        <Toggle
          checked={cfg.lotTracking}
          onChange={(v) => update('lotTracking', v)}
          label="Batch / Lot Tracking"
          description="Track stock movements at batch level"
        />
        <Toggle
          checked={cfg.expiryTracking}
          onChange={(v) => update('expiryTracking', v)}
          label="Expiry Date Tracking"
          description="Enforce expiry visibility on all inbound receipts"
        />
        <Toggle
          checked={cfg.negativeStockAllowed}
          onChange={(v) => update('negativeStockAllowed', v)}
          label="Allow Negative Stock"
          description="Permit stock levels to go below zero (not recommended)"
        />
      </div>

      <div style={CARD}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 1rem' }}>Cycle Count</h3>
        <FieldGroup label="Variance Alert Threshold (%)">
          <input
            style={INPUT}
            type="number"
            min={0}
            max={100}
            value={cfg.cycleCountVarianceThreshold}
            onChange={(e) => update('cycleCountVarianceThreshold', Number(e.target.value))}
          />
        </FieldGroup>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          Count discrepancies above this % will require supervisor approval before posting.
        </p>
      </div>

      <SaveButton onClick={handleSave} saved={saved} />
    </div>
  );
}

// ── TAB: Integrations ─────────────────────────────────────────────────────────

interface IntegrationConfig {
  shopifyStore: string;
  shopifyApiKey: string;
  shopifyLocationId: string;
  delhiveryWebhookUrl: string;
  delhiveryApiKey: string;
  emailNotifications: boolean;
  emailRecipients: string;
  lowStockAlert: boolean;
  lowStockThreshold: number;
}

function IntegrationSettings() {
  const [cfg, setCfg] = useState<IntegrationConfig>(() =>
    loadSetting('integrations', {
      shopifyStore: '',
      shopifyApiKey: '',
      shopifyLocationId: '',
      delhiveryWebhookUrl: '/api/v1/shipping/webhook',
      delhiveryApiKey: '',
      emailNotifications: false,
      emailRecipients: '',
      lowStockAlert: true,
      lowStockThreshold: 10,
    }),
  );
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof IntegrationConfig>(k: K, v: IntegrationConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const handleSave = () => {
    saveSetting('integrations', cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#96BF48', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: '12px', fontWeight: 700 }}>S</span>
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Shopify</h3>
          <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#e8f7f0', color: '#0e8a4f', borderRadius: '4px', fontWeight: 600 }}>SYNC</span>
        </div>
        <FieldGroup label="Store Domain">
          <input
            style={INPUT}
            placeholder="your-store.myshopify.com"
            value={cfg.shopifyStore}
            onChange={(e) => update('shopifyStore', e.target.value)}
          />
        </FieldGroup>
        <FieldGroup label="Admin API Access Token">
          <input
            style={{ ...INPUT, fontFamily: 'monospace' }}
            type="password"
            placeholder="shpat_…"
            value={cfg.shopifyApiKey}
            onChange={(e) => update('shopifyApiKey', e.target.value)}
          />
        </FieldGroup>
        <FieldGroup label="Inventory Location ID">
          <input
            style={{ ...INPUT, fontFamily: 'monospace' }}
            placeholder="gid://shopify/Location/…"
            value={cfg.shopifyLocationId}
            onChange={(e) => update('shopifyLocationId', e.target.value)}
          />
        </FieldGroup>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: '12px', fontWeight: 700 }}>D</span>
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Delhivery / Courier</h3>
          <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#fff7e6', color: '#c77700', borderRadius: '4px', fontWeight: 600 }}>WEBHOOK</span>
        </div>
        <FieldGroup label="Inbound Webhook URL (share with courier)">
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              style={{ ...INPUT, fontFamily: 'monospace', flex: 1 }}
              value={cfg.delhiveryWebhookUrl}
              onChange={(e) => update('delhiveryWebhookUrl', e.target.value)}
            />
            <button
              onClick={() => void navigator.clipboard.writeText(window.location.origin + cfg.delhiveryWebhookUrl)}
              style={{ height: '36px', padding: '0 12px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--surface)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              Copy
            </button>
          </div>
        </FieldGroup>
        <FieldGroup label="Delhivery API Key">
          <input
            style={{ ...INPUT, fontFamily: 'monospace' }}
            type="password"
            placeholder="Token …"
            value={cfg.delhiveryApiKey}
            onChange={(e) => update('delhiveryApiKey', e.target.value)}
          />
        </FieldGroup>
      </div>

      <div style={CARD}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 0.5rem' }}>Alerts & Notifications</h3>
        <Toggle
          checked={cfg.emailNotifications}
          onChange={(v) => update('emailNotifications', v)}
          label="Email Notifications"
          description="Send daily stock summary and alerts via email"
        />
        {cfg.emailNotifications && (
          <FieldGroup label="Recipients (comma-separated)">
            <input
              style={INPUT}
              type="email"
              placeholder="ops@fabb6.com, manager@fabb6.com"
              value={cfg.emailRecipients}
              onChange={(e) => update('emailRecipients', e.target.value)}
            />
          </FieldGroup>
        )}
        <Toggle
          checked={cfg.lowStockAlert}
          onChange={(v) => update('lowStockAlert', v)}
          label="Low Stock Alerts"
          description="Alert when available-to-sell drops below threshold"
        />
        {cfg.lowStockAlert && (
          <FieldGroup label="Low Stock Threshold (units)">
            <input
              style={INPUT}
              type="number"
              min={0}
              value={cfg.lowStockThreshold}
              onChange={(e) => update('lowStockThreshold', Number(e.target.value))}
            />
          </FieldGroup>
        )}
      </div>

      <SaveButton onClick={handleSave} saved={saved} />
    </div>
  );
}

// ── TAB: Users ────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, { color: string; bg: string }> = {
  admin:      { color: '#C42B1C', bg: '#FEF0EF' },
  supervisor: { color: '#0B4F9C', bg: '#E8F0FB' },
  inward:     { color: '#1A8C5F', bg: '#E8F7F0' },
  picker:     { color: '#4B6FE3', bg: '#EEF2FF' },
  packer:     { color: '#7B52D0', bg: '#F3EEFF' },
  returns:    { color: '#C47700', bg: '#FFF7E6' },
  read_only:  { color: '#5A6884', bg: '#F5F7FA' },
};

interface UserEntry {
  id: string;
  name: string;
  role: string;
  pin: string;
}

function UsersSettings() {
  const [users, setUsers] = useState<UserEntry[]>([
    { id: '1', name: 'Fabb6_Admin', role: 'admin', pin: '****' },
    { id: '2', name: 'Warehouse Supervisor', role: 'supervisor', pin: '****' },
    { id: '3', name: 'Picker 1', role: 'picker', pin: '****' },
    { id: '4', name: 'Packer 1', role: 'packer', pin: '****' },
    { id: '5', name: 'Inward Operator', role: 'inward', pin: '****' },
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', role: 'picker', pin: '' });
  const [notice, setNotice] = useState('');

  const handleAdd = () => {
    if (!newUser.name.trim() || newUser.pin.length < 4) {
      setNotice('Name and a 4-digit PIN are required.');
      return;
    }
    setUsers((u) => [...u, { id: String(Date.now()), ...newUser }]);
    setNewUser({ name: '', role: 'picker', pin: '' });
    setShowAdd(false);
    setNotice('User added. Set their PIN via POST /api/v1/auth/pin-change in the backend.');
  };

  return (
    <div style={{ maxWidth: '700px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Warehouse Users</h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            PIN-based login — each user authenticates with a 4–8 digit PIN.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <Plus size={14} /> Add User
        </button>
      </div>

      {notice && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 14px', backgroundColor: '#fff7e6', border: '1px solid #fcd34d', borderRadius: '6px', marginBottom: '1rem', fontSize: '13px', color: '#92400e' }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
          {notice}
        </div>
      )}

      {showAdd && (
        <div style={{ ...CARD, backgroundColor: 'var(--surface-sunken)' }}>
          <h4 style={{ margin: '0 0 0.75rem', fontSize: '14px', fontWeight: 600 }}>New User</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem 1rem' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <FieldGroup label="Full Name">
                <input style={INPUT} placeholder="e.g. Ravi Kumar" value={newUser.name} onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))} />
              </FieldGroup>
            </div>
            <FieldGroup label="Role">
              <select style={SELECT} value={newUser.role} onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value }))}>
                {Object.keys(ROLE_BADGE).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </FieldGroup>
            <FieldGroup label="Initial PIN (4–8 digits)">
              <input style={{ ...INPUT, fontFamily: 'monospace' }} type="password" inputMode="numeric" maxLength={8} placeholder="••••" value={newUser.pin} onChange={(e) => setNewUser((u) => ({ ...u, pin: e.target.value.replace(/\D/g, '') }))} />
            </FieldGroup>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
            <button onClick={handleAdd} style={{ height: '34px', padding: '0 14px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Create User
            </button>
            <button onClick={() => setShowAdd(false)} style={{ height: '34px', padding: '0 14px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={CARD}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Name', 'Role', 'PIN', ''].map((h) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const badge = ROLE_BADGE[u.role] ?? ROLE_BADGE['read_only']!;
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{u.name}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: badge.color, backgroundColor: badge.bg }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{u.pin}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button
                      onClick={() => setUsers((prev) => prev.filter((x) => x.id !== u.id))}
                      style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                      title="Remove user"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
        PIN changes require the backend CLI or POST /api/v1/auth/pin-change with supervisor/admin role.
      </p>
    </div>
  );
}

// ── TAB: Print & Labels ───────────────────────────────────────────────────────

interface PrintConfig {
  printerType: string;
  labelWidth: string;
  labelHeight: string;
  showSKU: boolean;
  showBarcode: boolean;
  showName: boolean;
  showBatch: boolean;
  showExpiry: boolean;
  showPrice: boolean;
  copies: number;
  orientation: string;
}

function PrintSettings() {
  const [cfg, setCfg] = useState<PrintConfig>(() =>
    loadSetting('print', {
      printerType: 'thermal',
      labelWidth: '70',
      labelHeight: '40',
      showSKU: true,
      showBarcode: true,
      showName: true,
      showBatch: true,
      showExpiry: true,
      showPrice: false,
      copies: 1,
      orientation: 'landscape',
    }),
  );
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof PrintConfig>(k: K, v: PrintConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const handleSave = () => {
    saveSetting('print', cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={CARD}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 1rem' }}>Printer Settings</h3>
        <FieldGroup label="Printer Type">
          <select style={SELECT} value={cfg.printerType} onChange={(e) => update('printerType', e.target.value)}>
            <option value="thermal">Thermal (Zebra / TSC / Honeywell)</option>
            <option value="laser">Laser / Inkjet</option>
            <option value="pdf">PDF (save to file)</option>
          </select>
        </FieldGroup>
        <FieldGroup label="Label Orientation">
          <select style={SELECT} value={cfg.orientation} onChange={(e) => update('orientation', e.target.value)}>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </FieldGroup>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem 1rem' }}>
          <FieldGroup label="Label Width (mm)">
            <input style={INPUT} type="number" min={20} max={200} value={cfg.labelWidth} onChange={(e) => update('labelWidth', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Label Height (mm)">
            <input style={INPUT} type="number" min={10} max={200} value={cfg.labelHeight} onChange={(e) => update('labelHeight', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Copies per Label">
            <input style={INPUT} type="number" min={1} max={10} value={cfg.copies} onChange={(e) => update('copies', Number(e.target.value))} />
          </FieldGroup>
        </div>
      </div>

      <div style={CARD}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 0.5rem' }}>Label Fields</h3>
        <Toggle checked={cfg.showBarcode} onChange={(v) => update('showBarcode', v)} label="Barcode / QR Code" description="Print scannable barcode on every label" />
        <Toggle checked={cfg.showSKU} onChange={(v) => update('showSKU', v)} label="SKU Code" />
        <Toggle checked={cfg.showName} onChange={(v) => update('showName', v)} label="Product Name" />
        <Toggle checked={cfg.showBatch} onChange={(v) => update('showBatch', v)} label="Batch Number" />
        <Toggle checked={cfg.showExpiry} onChange={(v) => update('showExpiry', v)} label="Expiry Date" />
        <Toggle checked={cfg.showPrice} onChange={(v) => update('showPrice', v)} label="MRP / Unit Cost" />
      </div>

      <SaveButton onClick={handleSave} saved={saved} />
    </div>
  );
}

// ── TAB definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'warehouse',    label: 'Warehouse',    icon: Building2,  Component: WarehouseSettings },
  { id: 'scanner',      label: 'Scanner',      icon: Scan,        Component: ScannerSettings },
  { id: 'operations',   label: 'Operations',   icon: Cog,         Component: OperationsSettings },
  { id: 'integrations', label: 'Integrations', icon: Plug,        Component: IntegrationSettings },
  { id: 'users',        label: 'Users',        icon: Users,       Component: UsersSettings },
  { id: 'print',        label: 'Print & Labels', icon: Printer,   Component: PrintSettings },
  { id: 'data',         label: 'Data Import',  icon: Upload,      Component: StockImport },
] as const;

type TabId = typeof TABS[number]['id'];

// ── Root Settings component ───────────────────────────────────────────────────

export default function Settings() {
  const user = useSessionStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<TabId>('warehouse');

  useEffect(() => {
    document.title = 'Fabb6 WMS — Settings';
  }, []);

  const visibleTabs = TABS.filter((t) => {
    if (t.id === 'users' && user?.role !== 'admin' && user?.role !== 'supervisor') return false;
    return true;
  });

  const active = TABS.find((t) => t.id === activeTab)!;
  const { Component } = active;

  return (
    <DeskLayout heading="Settings" title="Settings">
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', minHeight: '70vh' }}>
        {/* Side nav */}
        <nav style={{ width: '200px', flexShrink: 0 }}>
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  height: '40px',
                  padding: '0 12px',
                  border: 'none',
                  borderRadius: '6px',
                  marginBottom: '2px',
                  backgroundColor: isActive ? 'var(--brand-primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text)',
                  fontSize: '14px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  transition: 'background-color 120ms',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface-sunken)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                }}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
              {active.label}
            </h2>
          </div>
          <Component />
        </div>
      </div>
    </DeskLayout>
  );
}
