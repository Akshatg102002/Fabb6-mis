import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/stores/sessionStore';
import { apiClient } from '@/api/client';

const MAX_PIN = 8;

interface LoginResponse {
  token: string;
  user: {
    id: string;
    name: string;
    role: string;
    site_id: string | null;
  };
}

type Screen = 'login' | 'forgot-email' | 'forgot-otp' | 'forgot-newpin';

export default function Login() {
  const [screen, setScreen] = useState<Screen>('login');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Forgot PIN state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPin, setForgotNewPin] = useState('');
  const [forgotConfirmPin, setForgotConfirmPin] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const login = useSessionStore((s) => s.login);
  const deviceId = useSessionStore((s) => s.deviceId);
  const navigate = useNavigate();

  function pressDigit(d: string) {
    if (pin.length >= MAX_PIN) return;
    setPin((p) => p + d);
    setError(null);
  }

  function pressBackspace() {
    setPin((p) => p.slice(0, -1));
    setError(null);
  }

  async function pressEnter() {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { pin, device_id: deviceId },
      });
      login(
        { id: res.user.id, name: res.user.name, role: res.user.role as Parameters<typeof login>[0]['role'], site_id: res.user.site_id },
        res.token,
      );
      // Auto-pick first active site and store for the session
      try {
        const sites = await apiClient<{ id: string; is_active: boolean }[]>('/locations/sites');
        const active = sites.find((s) => s.is_active) ?? sites[0];
        if (active) localStorage.setItem('fabb6_site_id', active.id);
      } catch {
        // non-critical — site_id will be fetched per-request on backend
      }
      const role = res.user.role;
      const dest =
        role === 'admin' || role === 'read_only'
          ? '/stock'
          : role === 'supervisor'
          ? '/home'
          : role === 'picker'
          ? '/pick'
          : role === 'packer'
          ? '/pack'
          : role === 'inward'
          ? '/inward'
          : role === 'returns'
          ? '/returns'
          : '/home';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  // Forgot PIN handlers
  async function sendOtp() {
    if (!forgotEmail.trim()) { setError('Enter your email address.'); return; }
    setLoading(true); setError(null);
    try {
      await apiClient('/auth/forgot-pin', { method: 'POST', body: { email: forgotEmail.trim() } });
      setScreen('forgot-otp');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtpAndReset() {
    if (forgotOtp.length !== 6) { setError('Enter the 6-digit OTP.'); return; }
    if (!/^\d{4,8}$/.test(forgotNewPin)) { setError('New PIN must be 4–8 digits.'); return; }
    if (forgotNewPin !== forgotConfirmPin) { setError('PINs do not match.'); return; }
    setLoading(true); setError(null);
    try {
      await apiClient('/auth/reset-pin', { method: 'PATCH', body: { email: forgotEmail, otp: forgotOtp, new_pin: forgotNewPin } });
      setForgotSuccess('PIN reset! Please login with your new PIN.');
      setScreen('login');
      setForgotEmail(''); setForgotOtp(''); setForgotNewPin(''); setForgotConfirmPin('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset PIN');
    } finally {
      setLoading(false);
    }
  }

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['⌫', '0', '↵'],
  ];

  const containerStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '100dvh', backgroundColor: 'var(--surface-sunken)', padding: '1.5rem',
  };

  const logoBlock = (
    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
      <img src="https://fabb6.com/cdn/shop/files/FTM.webp" alt="Fabb6"
        style={{ maxHeight: '80px', display: 'block', margin: '0 auto 1rem', objectFit: 'contain' }} />
    </div>
  );

  // ── Forgot PIN screens ────────────────────────────────────────────────────
  if (screen === 'forgot-email') {
    return (
      <div style={containerStyle}>
        {logoBlock}
        <div style={{ width: '100%', maxWidth: '320px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>Forgot PIN</h2>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>Enter your registered email. We'll send a 6-digit OTP.</p>
          {error && <p role="alert" style={{ margin: 0, color: 'var(--scan-error)', fontSize: '13px', fontWeight: 500 }}>{error}</p>}
          <input type="email" autoFocus placeholder="you@example.com" value={forgotEmail}
            onChange={(e) => { setForgotEmail(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && void sendOtp()}
            style={{ height: '44px', padding: '0 12px', fontSize: '15px', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--surface-sunken)', color: 'var(--text)', fontFamily: 'inherit' }} />
          <button onClick={() => void sendOtp()} disabled={loading}
            style={{ height: '48px', borderRadius: '10px', border: 'none', fontSize: '16px', fontWeight: 700, cursor: 'pointer', backgroundColor: 'var(--brand-primary)', color: '#fff', opacity: loading ? 0.6 : 1, fontFamily: 'inherit' }}>
            {loading ? 'Sending…' : 'Send OTP'}
          </button>
          <button onClick={() => { setScreen('login'); setError(null); }}
            style={{ height: '40px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', cursor: 'pointer', background: 'none', color: 'var(--text-muted)', fontFamily: 'inherit' }}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'forgot-otp') {
    return (
      <div style={containerStyle}>
        {logoBlock}
        <div style={{ width: '100%', maxWidth: '320px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>Enter OTP</h2>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>Check your email for a 6-digit code. Then choose a new PIN.</p>
          {error && <p role="alert" style={{ margin: 0, color: 'var(--scan-error)', fontSize: '13px', fontWeight: 500 }}>{error}</p>}
          <input type="text" inputMode="numeric" maxLength={6} placeholder="6-digit OTP" value={forgotOtp}
            onChange={(e) => { setForgotOtp(e.target.value.replace(/\D/g, '')); setError(null); }}
            style={{ height: '44px', padding: '0 12px', fontSize: '20px', letterSpacing: '0.2em', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--surface-sunken)', color: 'var(--text)', fontFamily: 'monospace', textAlign: 'center' }} />
          <input type="password" inputMode="numeric" maxLength={8} placeholder="New PIN (4–8 digits)" value={forgotNewPin}
            onChange={(e) => { setForgotNewPin(e.target.value.replace(/\D/g, '')); setError(null); }}
            style={{ height: '44px', padding: '0 12px', fontSize: '15px', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--surface-sunken)', color: 'var(--text)', fontFamily: 'monospace' }} />
          <input type="password" inputMode="numeric" maxLength={8} placeholder="Confirm new PIN" value={forgotConfirmPin}
            onChange={(e) => { setForgotConfirmPin(e.target.value.replace(/\D/g, '')); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && void verifyOtpAndReset()}
            style={{ height: '44px', padding: '0 12px', fontSize: '15px', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--surface-sunken)', color: 'var(--text)', fontFamily: 'monospace' }} />
          <button onClick={() => void verifyOtpAndReset()} disabled={loading}
            style={{ height: '48px', borderRadius: '10px', border: 'none', fontSize: '16px', fontWeight: 700, cursor: 'pointer', backgroundColor: 'var(--brand-primary)', color: '#fff', opacity: loading ? 0.6 : 1, fontFamily: 'inherit' }}>
            {loading ? 'Resetting…' : 'Reset PIN'}
          </button>
          <button onClick={() => { setScreen('forgot-email'); setError(null); }}
            style={{ height: '40px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', cursor: 'pointer', background: 'none', color: 'var(--text-muted)', fontFamily: 'inherit' }}>
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Main login screen ─────────────────────────────────────────────────────
  return (
    <div style={containerStyle}>
      {logoBlock}
      <p style={{ margin: '-1rem 0 1.5rem', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
        Enter your PIN to continue
      </p>

      {/* Success message after PIN reset */}
      {forgotSuccess && (
        <p style={{ margin: '0 0 1rem', color: '#0e8a4f', fontSize: '0.9rem', textAlign: 'center', fontWeight: 500 }}>{forgotSuccess}</p>
      )}

      {/* PIN display */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center', justifyContent: 'center', minHeight: '44px' }}
        aria-label="PIN entered" aria-live="polite">
        {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
          <div key={i} style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: i < pin.length ? 'var(--brand-primary)' : 'var(--border)', transition: 'background-color 80ms ease' }} />
        ))}
      </div>

      {/* Error */}
      {error && (
        <p role="alert" style={{ color: 'var(--scan-error)', fontSize: '0.9rem', textAlign: 'center', marginBottom: '1rem', fontWeight: 500 }}>
          {error}
        </p>
      )}

      {/* Keypad */}
      <div style={{ backgroundColor: 'var(--surface)', borderRadius: '16px', padding: '1rem', border: '1px solid var(--border)', width: '100%', maxWidth: '320px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {keys.flat().map((key) => {
            const isBackspace = key === '⌫';
            const isEnter = key === '↵';
            return (
              <button
                key={key}
                onClick={() => {
                  if (isBackspace) pressBackspace();
                  else if (isEnter) void pressEnter();
                  else pressDigit(key);
                }}
                disabled={loading}
                aria-label={isBackspace ? 'Backspace' : isEnter ? 'Enter' : key}
                style={{
                  height: '72px', borderRadius: '12px', border: '1px solid var(--border)',
                  fontSize: isEnter || isBackspace ? '1.5rem' : '1.75rem', fontWeight: 600, cursor: 'pointer',
                  backgroundColor: isEnter ? 'var(--brand-primary)' : isBackspace ? 'var(--surface-sunken)' : 'var(--surface)',
                  color: isEnter ? '#ffffff' : 'var(--text)',
                  opacity: loading ? 0.6 : 1, transition: 'background-color 80ms ease', fontFamily: 'inherit',
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {loading && isEnter ? '…' : key}
              </button>
            );
          })}
        </div>
      </div>

      {/* Forgot PIN link */}
      <button
        onClick={() => { setScreen('forgot-email'); setError(null); setForgotSuccess(''); }}
        style={{ marginTop: '1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'inherit', textDecoration: 'underline' }}
      >
        Forgot PIN?
      </button>
    </div>
  );
}
