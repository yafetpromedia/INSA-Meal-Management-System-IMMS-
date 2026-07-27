'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import { homePathForRole, readStoredUser } from '@/lib/rbac';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/providers/ToastProvider';

export default function LoginPage() {
  const router = useRouter();
  const { push } = useToast();
  const [username, setUsername] = useState('superadmin');
  const [password, setPassword] = useState('ChangeMe!123');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      await login(user, password);
      if (!remember) sessionStorage.setItem('imms_remember', '0');
      push({ kind: 'success', title: 'Signed in' });
      router.push(homePathForRole(readStoredUser()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit} noValidate>
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            IM
          </span>
          <div>
            IMMS
            <span>INSA Meal Management</span>
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
          placeholder="superadmin"
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
          Remember me
        </label>

        <Button type="submit" loading={loading}>
          Sign in
        </Button>

        <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
          Default admin: <strong>superadmin</strong> / <strong>ChangeMe!123</strong>
        </p>

        <div className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      </form>
    </div>
  );
}
