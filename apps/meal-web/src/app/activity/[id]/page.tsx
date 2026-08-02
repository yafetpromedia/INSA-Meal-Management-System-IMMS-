'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Download,
  Pencil,
  Printer,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import {
  ActivityReportDocument,
  downloadActivityReportHtml,
} from '@/components/activity/ActivityReportDocument';
import { VoiceNotePlayer } from '@/components/activity/VoiceNotePlayer';
import { VoiceNoteRecorder } from '@/components/activity/VoiceNoteRecorder';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/providers/ToastProvider';
import { api, apiBlob } from '@/lib/api';
import {
  formatFileSize,
  formatMediaWhen,
  type ActivityMedia,
  type ActivityReport,
} from '@/lib/activity';
import { pushLocalNotification } from '@/lib/notifications';
import {
  canApproveActivity,
  canCreateActivity,
  readStoredUser,
} from '@/lib/rbac';

export default function ActivityReportDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { push } = useToast();
  const id = params?.id ?? '';
  const fileRef = useRef<HTMLInputElement>(null);

  const [report, setReport] = useState<ActivityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [notes, setNotes] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [preview, setPreview] = useState<{ url: string; caption?: string | null } | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<ActivityReport>(`/activity-reports/${id}`);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    const user = readStoredUser();
    setCanApprove(canApproveActivity(user));
    setCanEdit(canCreateActivity(user));
  }, [router]);

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id, load]);

  useEffect(() => {
    if (!report?.media?.length) return;
    let cancelled = false;
    const next: Record<string, string> = {};
    void (async () => {
      for (const m of report.media ?? []) {
        if (m.fileType !== 'image') continue;
        try {
          const blob = await apiBlob(`/activity-reports/media/${m.id}/file`);
          if (cancelled) return;
          next[m.id] = URL.createObjectURL(blob);
        } catch {
          /* ignore broken thumb */
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
  }, [report?.media]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(thumbs)) URL.revokeObjectURL(url);
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(path: string, body?: Record<string, unknown>, success = 'Updated') {
    setBusy(true);
    try {
      const data = await api<ActivityReport>(`/activity-reports/${id}/${path}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      setReport(data);
      setNotes('');
      push({ kind: 'success', title: success, message: data.reportNumber });
      if (path === 'submit') {
        pushLocalNotification({
          kind: 'info',
          title: 'Activity report submitted',
          message: `${data.reportNumber} awaits coordinator review`,
          href: `/activity/${data.id}`,
        });
      }
      if (path === 'approve' || path === 'reject') {
        pushLocalNotification({
          kind: path === 'approve' ? 'success' : 'warning',
          title: path === 'approve' ? 'Report approved' : 'Report rejected',
          message: data.reportNumber,
          href: `/activity/${data.id}`,
        });
      }
    } catch (err) {
      push({
        kind: 'error',
        title: 'Action failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | File[], caption?: string) {
    const list = Array.from(files);
    if (!list.length || !report) return;
    setUploading(true);
    try {
      for (const file of list) {
        const body = new FormData();
        body.append('file', file);
        if (caption) body.append('caption', caption);
        await api(`/activity-reports/${id}/media`, { method: 'POST', body });
      }
      push({
        kind: 'success',
        title: caption === 'Voice note' ? 'Voice note attached' : 'Upload complete',
        message: `${list.length} file(s)`,
      });
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Upload failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setUploading(false);
    }
  }

  async function openPreview(media: ActivityMedia) {
    try {
      const blob = await apiBlob(`/activity-reports/media/${media.id}/file`);
      const url = URL.createObjectURL(blob);
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview({ url, caption: media.caption });
    } catch (err) {
      push({
        kind: 'error',
        title: 'Preview failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    }
  }

  async function downloadMedia(media: ActivityMedia) {
    try {
      const blob = await apiBlob(`/activity-reports/media/${media.id}/file`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = media.originalName || media.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      push({
        kind: 'error',
        title: 'Download failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    }
  }

  async function deleteMedia(mediaId: string) {
    setBusy(true);
    try {
      await api(`/activity-reports/media/${mediaId}`, { method: 'DELETE' });
      await load();
      push({ kind: 'success', title: 'Media removed' });
    } catch (err) {
      push({
        kind: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setBusy(false);
    }
  }

  async function onReject(e: FormEvent) {
    e.preventDefault();
    if (notes.trim().length < 2) return;
    setRejectOpen(false);
    await runAction('reject', { notes: notes.trim() }, 'Report rejected');
  }

  const editable =
    canEdit &&
    report &&
    (report.status === 'DRAFT' || report.status === 'REJECTED');

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <Link href="/activity" className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Activity reports
          </Link>
          <h1 className="page-title">{report?.reportNumber ?? 'Activity report'}</h1>
          <p className="page-sub">Official template view — edit, approve, download, or print.</p>
        </div>
        {report ? (
          <div className="dash-head-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                downloadActivityReportHtml(report);
                push({ kind: 'success', title: 'Downloaded', message: 'Open the HTML file and Print → Save as PDF' });
              }}
            >
              <Download size={15} strokeWidth={1.75} aria-hidden />
              Download
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/activity/${id}/print`)}
            >
              <Printer size={15} strokeWidth={1.75} aria-hidden />
              Print
            </Button>
            {editable ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/activity/${id}/edit`)}
              >
                <Pencil size={15} strokeWidth={1.75} aria-hidden />
                Edit
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 12 }}>
          <Skeleton height={48} />
          <Skeleton height={160} />
        </div>
      ) : !report ? (
        <EmptyState
          title="Report not found"
          actionLabel="Back to list"
          onAction={() => router.push('/activity')}
        />
      ) : (
        <div className="profile-page">
          <ActivityReportDocument report={report}>
            <div className="art-doc-actions no-print">
              <div className="form-actions" style={{ flexWrap: 'wrap' }}>
              {editable ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction('submit', undefined, 'Submitted for review')}
                >
                  Submit for approval
                </Button>
              ) : null}
              {canApprove && report.status === 'SUBMITTED' ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void runAction('review', undefined, 'Under review')}
                >
                  Start review
                </Button>
              ) : null}
              {canApprove &&
              (report.status === 'SUBMITTED' || report.status === 'UNDER_REVIEW') ? (
                <>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction('approve', { notes }, 'Approved')}
                  >
                    <Check size={15} strokeWidth={1.75} aria-hidden />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setRejectOpen(true)}
                  >
                    <X size={15} strokeWidth={1.75} aria-hidden />
                    Reject / request changes
                  </Button>
                </>
              ) : null}
              {canApprove && report.status === 'APPROVED' ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction('publish', undefined, 'Published')}
                >
                  Publish
                </Button>
              ) : null}
              {canApprove &&
              (report.status === 'APPROVED' || report.status === 'PUBLISHED') ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void runAction('archive', undefined, 'Archived')}
                >
                  Archive
                </Button>
              ) : null}
              </div>
              {canApprove &&
              (report.status === 'SUBMITTED' || report.status === 'UNDER_REVIEW') ? (
                <label className="field" style={{ marginTop: 12 }}>
                  <span>Approval notes (optional)</span>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              ) : null}
            </div>
          </ActivityReportDocument>

          <section className="panel art-media-panel no-print">
            <div className="page-head" style={{ marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Media & voice notes</h2>
                <p className="page-sub" style={{ margin: 0 }}>
                  Photos, documents, and recorded voice notes for this report.
                </p>
              </div>
            </div>

            {editable ? (
              <div className="activity-media-actions">
                <div
                  className={`upload-dropzone ${dragging ? 'is-dragging' : ''}`}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    dragDepth.current += 1;
                    setDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    dragDepth.current -= 1;
                    if (dragDepth.current <= 0) {
                      dragDepth.current = 0;
                      setDragging(false);
                    }
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    dragDepth.current = 0;
                    setDragging(false);
                    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
                  }}
                >
                  <Upload size={22} strokeWidth={1.75} aria-hidden />
                  <strong>{uploading ? 'Uploading…' : 'Drag & drop files here'}</strong>
                  <span className="muted">Images, PDF, Word, PowerPoint, video, or audio</span>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    hidden
                    accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,video/mp4,video/webm,audio/*"
                    onChange={(e) => {
                      if (e.target.files) void uploadFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>
                <div className="activity-voice-panel">
                  <strong>Voice note</strong>
                  <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
                    Record a short spoken update from your microphone.
                  </p>
                  <VoiceNoteRecorder
                    disabled={uploading || busy}
                    onRecorded={(file) => void uploadFiles([file], 'Voice note')}
                  />
                </div>
              </div>
            ) : null}

            {!report.media?.length ? (
              <p className="muted" style={{ marginTop: 12 }}>
                No media attached yet.
              </p>
            ) : (
              <div className="activity-gallery" style={{ marginTop: 14 }}>
                {report.media.map((m) => (
                  <article className="activity-gallery-item" key={m.id}>
                    {m.fileType === 'image' && thumbs[m.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbs[m.id]} alt={m.caption || m.originalName} />
                    ) : m.fileType === 'audio' ? (
                      <VoiceNotePlayer mediaId={m.id} caption={m.caption} />
                    ) : (
                      <div className="activity-gallery-file">
                        <span>{m.fileType.toUpperCase()}</span>
                        <small>{formatFileSize(m.fileSize)}</small>
                      </div>
                    )}
                    <div className="activity-gallery-meta">
                      <strong>{m.caption || m.originalName}</strong>
                      <span className="muted">
                        {m.uploadedBy?.fullName} · {formatMediaWhen(m.uploadedAt)}
                      </span>
                      <div className="form-actions" style={{ marginTop: 6 }}>
                        {m.fileType === 'image' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void openPreview(m)}
                          >
                            <ZoomIn size={14} strokeWidth={1.75} aria-hidden />
                            View
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void downloadMedia(m)}
                        >
                          <Download size={14} strokeWidth={1.75} aria-hidden />
                          Download
                        </Button>
                        {editable ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void deleteMedia(m.id)}
                          >
                            <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject / request changes">
        <form onSubmit={onReject} style={{ display: 'grid', gap: 12 }}>
          <label className="field">
            <span>Notes for the mentor</span>
            <textarea
              className="textarea"
              rows={4}
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Send back
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(preview)}
        onClose={() => {
          if (preview?.url) URL.revokeObjectURL(preview.url);
          setPreview(null);
        }}
        title={preview?.caption || 'Photo preview'}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.url}
            alt={preview.caption || 'Preview'}
            style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }}
          />
        ) : null}
      </Modal>
    </AppShell>
  );
}
