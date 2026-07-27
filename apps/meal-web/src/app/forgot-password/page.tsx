'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/providers/ToastProvider';

export default function ForgotPasswordPage() {
  const { push } = useToast();
  const [account, setAccount] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ account: account.trim() }),
      });
      push({
        kind: 'info',
        title: 'Check your inbox',
        message: 'If an account exists, reset instructions were sent.',
      });
    } catch (err) {
      push({
        kind: 'error',
        title: 'Request failed',
        message: err instanceof Error ? err.message : 'Try again',
        sticky: true,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>IMMS</h1>
        <p>Reset your password</p>
        <Input
          label="Username or email"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          required
          autoComplete="username"
        />
        <Button type="submit" loading={loading}>
          Send reset link
        </Button>
        <div className="auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </form>
    </div>
  );
}
