'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/providers/ToastProvider';
import { api, clearTokens } from '@/lib/api';

type Profile = {
  id: string;
  username: string;
  email?: string | null;
  fullName: string;
  phone?: string | null;
  roles?: string[];
  status?: string;
  lastLoginAt?: string | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    username: '',
    fullName: '',
    email: '',
    phone: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    api<Profile>('/auth/me')
      .then((me) => {
        setForm((f) => ({
          ...f,
          username: me.username ?? '',
          fullName: me.fullName ?? '',
          email: me.email ?? '',
          phone: me.phone ?? '',
        }));
        const stored = JSON.parse(localStorage.getItem('imms_user') ?? '{}') as Record<
          string,
          unknown
        >;
        localStorage.setItem(
          'imms_user',
          JSON.stringify({
            ...stored,
            username: me.username,
            email: me.email,
            fullName: me.fullName,
            roles: me.roles ?? stored.roles,
          }),
        );
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api<Profile & { message?: string }>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          username: form.username.trim(),
          fullName: form.fullName.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || undefined,
        }),
      });
      const stored = JSON.parse(localStorage.getItem('imms_user') ?? '{}') as Record<
        string,
        unknown
      >;
      localStorage.setItem(
        'imms_user',
        JSON.stringify({
          ...stored,
          username: updated.username,
          email: updated.email,
          fullName: updated.fullName,
        }),
      );
      push({ kind: 'success', title: 'Profile updated' });
    } catch (err) {
      push({
        kind: 'error',
        title: 'Update failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      push({ kind: 'error', title: 'Passwords do not match' });
      return;
    }
    setSaving(true);
    try {
      await api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      push({
        kind: 'success',
        title: 'Password changed',
        message: 'Please sign in again with your new password.',
      });
      clearTokens();
      router.replace('/login');
    } catch (err) {
      push({
        kind: 'error',
        title: 'Password change failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-sub">Update your username and password for this account.</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={40} />
          <Skeleton height={40} />
        </div>
      ) : (
        <div className="profile-account-grid">
          <form className="panel" onSubmit={onSaveProfile} style={{ display: 'grid', gap: 12 }}>
            <h2 className="profile-section-title">Account</h2>
            <Input
              label="Username"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              required
              minLength={3}
              autoComplete="username"
            />
            <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>
              3–32 characters: letters, numbers, dots, or underscores.
            </p>
            <Input
              label="Full name"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              required
            />
            <Input
              label="Email (optional)"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              autoComplete="email"
            />
            <Input
              label="Phone (optional)"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" loading={saving}>
                Save profile
              </Button>
            </div>
          </form>

          <form className="panel" onSubmit={onChangePassword} style={{ display: 'grid', gap: 12 }}>
            <h2 className="profile-section-title">Change password</h2>
            <Input
              label="Current password"
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
              required
              autoComplete="current-password"
            />
            <Input
              label="New password"
              type="password"
              value={form.newPassword}
              onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>
              Use at least 8 characters with uppercase, lowercase, number, and special character.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" loading={saving}>
                Update password
              </Button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
