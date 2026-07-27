'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/providers/ToastProvider';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { push } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const token = params.get('token') ?? '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      push({ kind: 'error', title: 'Passwords do not match' });
      return;
    }
    setLoading(true);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password }),
      });
      push({ kind: 'success', title: 'Password updated' });
      router.push('/login');
    } catch (err) {
      push({
        kind: 'error',
        title: 'Reset failed',
        message: err instanceof Error ? err.message : 'Try again',
        sticky: true,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-card" onSubmit={onSubmit}>
      <h1>IMMS</h1>
      <p>Choose a new password</p>
      <Input
        label="New password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
      />
      <Input
        label="Confirm password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        minLength={8}
      />
      <Button type="submit" loading={loading} disabled={!token}>
        Update password
      </Button>
      <div className="auth-links">
        <Link href="/login">Back to sign in</Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="login-page">
      <Suspense fallback={<div className="login-card">Loading…</div>}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
