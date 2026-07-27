'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from './AppShell';
import { api, getActiveOrganizationId } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

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
  const [loading, setLoading] = useState(!!endpoint);

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

    setLoading(true);
    api(url)
      .then(setPayload)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [endpoint, router]);

  const empty =
    payload == null ||
    (Array.isArray(payload) && payload.length === 0) ||
    (typeof payload === 'object' &&
      payload !== null &&
      'items' in payload &&
      Array.isArray((payload as { items: unknown[] }).items) &&
      (payload as { items: unknown[] }).items.length === 0);

  return (
    <AppShell>
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">{description}</p>
      {error ? <p className="error">{error}</p> : null}
      {endpoint ? (
        loading ? (
          <div className="panel" style={{ display: 'grid', gap: 10 }}>
            <Skeleton height={20} />
            <Skeleton height={20} />
            <Skeleton height={20} width="70%" />
          </div>
        ) : empty && !error ? (
          <EmptyState title={`No ${title.toLowerCase()} yet`} description="Data will appear here once configured." />
        ) : (
          <div className="panel">
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.85rem' }}>
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
        )
      ) : (
        <EmptyState title="Module ready" description="Full interactive UI arrives in a later phase." />
      )}
    </AppShell>
  );
}
