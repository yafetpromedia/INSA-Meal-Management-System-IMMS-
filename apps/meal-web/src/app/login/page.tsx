'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import { homePathForRole, readStoredUser } from '@/lib/rbac';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/providers/ToastProvider';

export default function LoginPage() {
  const router = useRouter();
  const { push } = useToast();
  const [email, setEmail] = useState('superadmin@insa.gov.et');
  const [password, setPassword] = useState('ChangeMe!123');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailError = useMemo(() => {
    if (!touched.email) return '';
    if (!email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email.';
    return '';
  }, [email, touched.email]);

  const passwordError = useMemo(() => {
    if (!touched.password) return '';
    if (!password) return 'Password is required.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    return '';
  }, [password, touched.password]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (emailError || passwordError || !email || password.length < 8) return;

    setLoading(true);
    setError('');
    try {
      await login(email, password);
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
        <p>Sign in to manage meal distribution across campuses.</p>
        {error ? (
          <div className="error" role="alert">
            {error}
          </div>
        ) : null}

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={emailError}
          autoComplete="username"
          required
        />

        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={passwordError}
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

        <div className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      </form>
    </div>
  );
}
