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

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['⌫', '0', '↵'],
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        backgroundColor: 'var(--surface-sunken)',
        padding: '1.5rem',
      }}
    >
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '20px',
            backgroundColor: 'var(--brand-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem',
          }}
        >
          <span style={{ color: '#fff', fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.05em' }}>
            F6
          </span>
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: '1.75rem',
            fontWeight: 700,
            color: 'var(--brand-primary)',
          }}
        >
          Fabb6 WMS
        </h1>
        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Enter your PIN to continue
        </p>
      </div>

      {/* PIN display */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '1.25rem',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '44px',
        }}
        aria-label="PIN entered"
        aria-live="polite"
      >
        {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
          <div
            key={i}
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: i < pin.length ? 'var(--brand-primary)' : 'var(--border)',
              transition: 'background-color 80ms ease',
            }}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <p
          role="alert"
          style={{
            color: 'var(--scan-error)',
            fontSize: '0.9rem',
            textAlign: 'center',
            marginBottom: '1rem',
            fontWeight: 500,
          }}
        >
          {error}
        </p>
      )}

      {/* Keypad */}
      <div
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: '16px',
          padding: '1rem',
          border: '1px solid var(--border)',
          width: '100%',
          maxWidth: '320px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem',
          }}
        >
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
                  height: '72px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  fontSize: isEnter || isBackspace ? '1.5rem' : '1.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: isEnter
                    ? 'var(--brand-primary)'
                    : isBackspace
                    ? 'var(--surface-sunken)'
                    : 'var(--surface)',
                  color: isEnter ? '#ffffff' : 'var(--text)',
                  opacity: loading ? 0.6 : 1,
                  transition: 'background-color 80ms ease',
                  fontFamily: 'inherit',
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {loading && isEnter ? '…' : key}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
