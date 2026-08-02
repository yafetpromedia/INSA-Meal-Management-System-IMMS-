'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ZoomIn } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { api, apiBlob, getActiveOrganizationId } from '@/lib/api';
import {
  formatActivityDate,
  formatMediaWhen,
  type ActivityCategory,
  type ActivityMedia,
} from '@/lib/activity';

type Campus = { id: string; name: string; shortName?: string | null };

export default function NationalGalleryPage() {
  const router = useRouter();
  const [items, setItems] = useState<ActivityMedia[]>([]);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusId, setCampusId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  async function load() {
    const orgId = getActiveOrganizationId();
    const qs = new URLSearchParams({
      take: '120',
      ...(orgId ? { organizationId: orgId } : {}),
      ...(campusId ? { campusId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    setLoading(true);
    setError('');
    try {
      const data = await api<ActivityMedia[]>(`/activity-reports/gallery?${qs}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gallery');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    const orgId = getActiveOrganizationId();
    const qs = orgId ? `?organizationId=${orgId}` : '';
    Promise.all([
      api<ActivityCategory[]>(
        `/activity-categories?${new URLSearchParams({
          activeOnly: 'true',
          ...(orgId ? { organizationId: orgId } : {}),
        })}`,
      ),
      api<Campus[]>(`/campuses${qs}`),
    ])
      .then(([cats, cams]) => {
        setCategories(Array.isArray(cats) ? cats : []);
        setCampuses(Array.isArray(cams) ? cams : []);
      })
      .catch(() => undefined);
  }, [router]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId, categoryId, from, to]);

  useEffect(() => {
    let cancelled = false;
    const next: Record<string, string> = {};
    void (async () => {
      for (const m of items) {
        try {
          const blob = await apiBlob(`/activity-reports/media/${m.id}/file`);
          if (cancelled) return;
          next[m.id] = URL.createObjectURL(blob);
        } catch {
          /* skip */
        }
      }
      if (!cancelled) {
        setThumbs((prev) => {
          for (const url of Object.values(prev)) URL.revokeObjectURL(url);
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <Link href="/activity" className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Activity reports
          </Link>
          <h1 className="page-title">National photo gallery</h1>
          <p className="page-sub">Browse activity photos across campuses for headquarters review.</p>
        </div>
      </div>

      <div className="toolbar">
        <select
          className="select"
          value={campusId}
          onChange={(e) => setCampusId(e.target.value)}
          aria-label="Campus"
        >
          <option value="">All campuses</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.shortName ?? c.name}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="activity-gallery">
          <Skeleton height={180} />
          <Skeleton height={180} />
          <Skeleton height={180} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No photos yet" description="Approved or submitted reports with images will appear here." />
      ) : (
        <div className="activity-gallery">
          {items.map((m) => (
            <article className="activity-gallery-item" key={m.id}>
              {thumbs[m.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbs[m.id]} alt={m.caption || m.originalName} />
              ) : (
                <div className="activity-gallery-file">Loading…</div>
              )}
              <div className="activity-gallery-meta">
                <strong>{m.caption || m.report?.title || m.originalName}</strong>
                <span className="muted">
                  {m.report?.campus?.shortName ?? m.report?.campus?.name} ·{' '}
                  {formatActivityDate(m.report?.reportDate)} · {formatMediaWhen(m.uploadedAt)}
                </span>
                <div className="form-actions" style={{ marginTop: 6 }}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        const blob = await apiBlob(`/activity-reports/media/${m.id}/file`);
                        const url = URL.createObjectURL(blob);
                        if (preview?.url) URL.revokeObjectURL(preview.url);
                        setPreview({
                          url,
                          title: m.caption || m.report?.title || m.originalName,
                        });
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    <ZoomIn size={14} strokeWidth={1.75} aria-hidden />
                    View
                  </Button>
                  {m.report?.id ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => router.push(`/activity/${m.report!.id}`)}
                    >
                      Open report
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => {
          if (preview?.url) URL.revokeObjectURL(preview.url);
          setPreview(null);
        }}
        title={preview?.title || 'Photo'}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.url}
            alt={preview.title}
            style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain' }}
          />
        ) : null}
      </Modal>
    </AppShell>
  );
}
