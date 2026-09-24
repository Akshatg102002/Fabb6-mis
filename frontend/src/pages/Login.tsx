import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/stores/sessionStore';
import { apiClient } from '@/api/client';

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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useSessionStore((s) => s.login);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) { setError('Enter a username'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { username: username.trim(), password },
      });
      login(
        {
          id: res.user.id,
          name: res.user.name,
          role: res.user.role as Parameters<typeof login>[0]['role'],
          site_id: res.user.site_id,
        },
        res.token,
      );
      try {
        const sites = await apiClient<{ id: string; is_active: boolean }[]>('/locations/sites');
        const active = sites.find((s) => s.is_active) ?? sites[0];
        if (active) localStorage.setItem('fabb6_site_id', active.id);
      } catch {
        // non-critical
      }
      const role = res.user.role;
      const dest =
        role === 'admin' || role === 'read_only'
          ? '/home'
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
    } finally {
      setLoading(false);
    }
  }

  function fillDemo() {
    setUsername('demo');
    setPassword('demo');
    setError(null);
  }

  const inp: React.CSSProperties = {
    width: '100%', height: '48px', padding: '0 14px', fontSize: '15px',
    border: '1px solid var(--border)', borderRadius: '10px',
    backgroundColor: 'var(--surface-sunken)', color: 'var(--text)',
    fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh',
      backgroundColor: 'var(--surface-sunken)', padding: '1.5rem',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <img
          src="https://fabb6.com/cdn/shop/files/FTM.webp"
          alt="Fabb6"
          style={{ maxHeight: '72px', display: 'block', margin: '0 auto 0.75rem', objectFit: 'contain' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Warehouse Management System
        </p>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: '360px',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '18px', padding: '2rem',
        display: 'flex', flexDirection: 'column', gap: '1rem',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
      }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>
          Sign in
        </h1>

        {/* Demo badge */}
        <div style={{
          backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
          borderRadius: '8px', padding: '10px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        }}>
          <span style={{ fontSize: '13px', color: '#1d4ed8' }}>
            Demo mode — any credentials work
          </span>
          <button
            type="button"
            onClick={fillDemo}
            style={{
              padding: '4px 10px', fontSize: '12px', fontWeight: 600,
              backgroundColor: '#2563eb', color: '#fff', border: 'none',
              borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            Fill demo
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
              Username
            </label>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              placeholder="e.g. admin"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(null); }}
              style={inp}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="any password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              style={inp}
            />
          </div>

          {error && (
            <p role="alert" style={{
              margin: 0, color: 'var(--scan-error)', fontSize: '13px',
              fontWeight: 500, padding: '8px 12px',
              backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca',
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              height: '50px', borderRadius: '12px', border: 'none',
              fontSize: '16px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              backgroundColor: 'var(--brand-primary)', color: '#fff',
              opacity: loading ? 0.7 : 1, transition: 'opacity 150ms',
              fontFamily: 'inherit', marginTop: '4px',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>
      </div>

      <p style={{ marginTop: '1.5rem', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
        Fabb6 WMS · Demo Build
      </p>
    </div>
  );
}
