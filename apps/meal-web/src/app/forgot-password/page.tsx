'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/providers/ToastProvider';

export default function ForgotPasswordPage() {
  const { push } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      push({
        kind: 'info',
        title: 'Check your email',
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
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
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
