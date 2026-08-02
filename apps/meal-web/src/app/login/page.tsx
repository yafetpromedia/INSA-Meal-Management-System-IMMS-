'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { login } from '@/lib/api';
import { homePathForRole, readStoredUser } from '@/lib/rbac';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/providers/ToastProvider';
import { BrandLogo } from '@/components/BrandLogo';

const isDev = process.env.NODE_ENV === 'development';

export default function LoginPage() {
  const { push } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already signed in → go straight to the portal
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!token || token === 'undefined' || token === 'null') {
      localStorage.removeItem('imms_access');
      localStorage.removeItem('imms_refresh');
      sessionStorage.removeItem('imms_access');
      sessionStorage.removeItem('imms_refresh');
      return;
    }
    window.location.replace(homePathForRole(readStoredUser()));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const user = username.trim();
    if (!user) {
      setError('Enter your username (or email).');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await login(user, password, { remember });
      push({ kind: 'success', title: 'Signed in' });
      window.location.assign(homePathForRole(data.user));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit} noValidate>
        <div className="brand login-brand">
          <BrandLogo variant="mark" size={56} alt="IMMS" />
          <div>
            IMMS
            <span>Camp Management</span>
          </div>
        </div>
        <p>Sign in with your username. Email still works if you prefer.</p>
        {error ? (
          <div className="error" role="alert">
            {error}
          </div>
        ) : null}

        <Input
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          placeholder="Your username"
          required
        />

        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        <label className="checkbox-row">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me on this device
        </label>

        <Button type="submit" loading={loading}>
          Sign in
        </Button>

        {isDev ? (
          <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
            Dev only — seed account is documented in the project README (change it before production).
          </p>
        ) : null}

        <div className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      </form>
    </div>
  );
}
