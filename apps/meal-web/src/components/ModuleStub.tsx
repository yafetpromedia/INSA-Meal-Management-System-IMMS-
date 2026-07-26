'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from './AppShell';
import { api, getActiveOrganizationId } from '@/lib/api';

export function ModuleStub({
  title,
  description,
  endpoint,
}: {
  title: string;
  description: string;
  endpoint?: string;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<unknown>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('imms_access');
    if (!token) {
      router.replace('/login');
      return;
    }
    if (!endpoint) return;

    const orgId = getActiveOrganizationId();
    const url =
      orgId && !endpoint.includes('organizationId=')
        ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}organizationId=${orgId}`
        : endpoint;

    api(url)
      .then(setPayload)
      .catch((err: Error) => setError(err.message));
  }, [endpoint, router]);

  return (
    <AppShell>
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">{description}</p>
      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        {endpoint ? (
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.85rem' }}>
            {payload ? JSON.stringify(payload, null, 2) : error ? null : 'Loading…'}
          </pre>
        ) : (
          <p className="muted">Module shell ready. Full UI arrives in a later phase.</p>
        )}
      </div>
    </AppShell>
  );
}
