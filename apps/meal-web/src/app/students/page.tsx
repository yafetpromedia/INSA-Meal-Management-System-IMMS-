'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AddButton } from '@/components/ui/AddButton';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { getActiveOrganizationId, api, apiWithMeta } from '@/lib/api';
import { canImportStudents, canManageStudents, readStoredUser } from '@/lib/rbac';

type StudentRow = {
  id: string;
  studentId: string;
  barcode: string;
  fullName: string;
  department?: string | null;
  gender?: string | null;
  educationLevel?: string | null;
  status: string;
  campusId: string;
  programId: string;
  academicYearId: string;
  campus?: { name: string; shortName: string };
  program?: { name: string };
};

type Option = { id: string; name: string; shortName?: string };

function StudentsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { push } = useToast();
  const initialQ = params.get('q') ?? '';

  const [q, setQ] = useState(initialQ);
  const [draft, setDraft] = useState(initialQ);
  const [items, setItems] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [campuses, setCampuses] = useState<Option[]>([]);
  const [programs, setPrograms] = useState<Option[]>([]);
  const [years, setYears] = useState<Option[]>([]);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [form, setForm] = useState({
    studentId: '',
    fullName: '',
    department: '',
    gender: '',
    educationLevel: '',
    campusId: '',
    programId: '',
    academicYearId: '',
    status: 'ACTIVE',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<StudentRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canImport, setCanImport] = useState(false);
  const limit = 20;

  async function loadMeta() {
    if (!canManageStudents(readStoredUser())) return;
    const orgId = getActiveOrganizationId();
    const qs = orgId ? `?organizationId=${orgId}` : '';
    try {
      const [c, p, y] = await Promise.all([
        api<Option[]>(`/campuses${qs}`),
        api<Option[]>(`/programs${qs}`),
        api<Option[]>(`/academic-years${qs}`),
      ]);
      setCampuses(Array.isArray(c) ? c : []);
      setPrograms(Array.isArray(p) ? p : []);
      setYears(Array.isArray(y) ? y : []);
    } catch {
      // Mentors / viewers may lack campus/program permissions — list still works.
    }
  }

  async function loadList() {
    const orgId = getActiveOrganizationId();
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(orgId ? { organizationId: orgId } : {}),
      ...(q ? { search: q } : {}),
    });
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await apiWithMeta<StudentRow[]>(`/students?${qs}`);
      const rows = Array.isArray(data) ? data : [];
      setItems(rows);
      setTotal(Number(meta.total ?? rows.length));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students');
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
    const user = readStoredUser();
    setCanManage(canManageStudents(user));
    setCanImport(canImportStudents(user));
    void loadMeta();
  }, [router]);

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) return;
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = draft.trim();
      if (next === q) return;
      setPage(1);
      setQ(next);
    }, 300);
    return () => window.clearTimeout(t);
  }, [draft, q]);

  function openCreate() {
    setEditing(null);
    setForm({
      studentId: '',
      fullName: '',
      department: '',
      gender: '',
      educationLevel: '',
      campusId: campuses[0]?.id ?? '',
      programId: programs[0]?.id ?? '',
      academicYearId: years[0]?.id ?? '',
      status: 'ACTIVE',
    });
    setModal('create');
  }

  function openEdit(s: StudentRow) {
    setEditing(s);
    setForm({
      studentId: s.studentId,
      fullName: s.fullName,
      department: s.department ?? '',
      gender: s.gender ?? '',
      educationLevel: s.educationLevel ?? '',
      campusId: s.campusId,
      programId: s.programId,
      academicYearId: s.academicYearId,
      status: s.status,
    });
    setModal('edit');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const orgId = getActiveOrganizationId();
    setSaving(true);
    try {
      if (modal === 'create') {
        await api('/students', {
          method: 'POST',
          body: JSON.stringify({
            organizationId: orgId,
            studentId: form.studentId.trim(),
            fullName: form.fullName.trim(),
            campusId: form.campusId,
            programId: form.programId,
            academicYearId: form.academicYearId,
            department: form.department.trim() || undefined,
            gender: form.gender.trim() || undefined,
            educationLevel: form.educationLevel.trim() || undefined,
          }),
        });
        push({ kind: 'success', title: 'Student created' });
      } else if (editing) {
        await api(`/students/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fullName: form.fullName.trim(),
            department: form.department.trim() || undefined,
            gender: form.gender.trim() || undefined,
            educationLevel: form.educationLevel.trim() || undefined,
            status: form.status,
          }),
        });
        push({ kind: 'success', title: 'Student updated' });
      }
      setModal(null);
      await loadList();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await api(`/students/${deleting.id}`, { method: 'DELETE' });
      push({ kind: 'success', title: 'Student archived' });
      setDeleting(null);
      await loadList();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setBusyDelete(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const canCreate = canManage && campuses.length > 0 && programs.length > 0 && years.length > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Students</h1>
          <p className="page-sub">
            {canManage ? 'Search, add, edit, and archive the meal roster.' : 'View and search students in your scope.'}
          </p>
        </div>
        {canManage ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {canImport ? (
              <Button type="button" variant="secondary" onClick={() => router.push('/import')}>
                Import Excel
              </Button>
            ) : null}
            <AddButton onClick={openCreate} label="Add" disabled={!canCreate} />
          </div>
        ) : null}
      </div>

      <form
        className="panel"
        style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          const next = draft.trim();
          setPage(1);
          setQ(next);
        }}
      >
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Name, student ID, barcode, department…"
          aria-label="Search students"
          style={{ flex: 1, minWidth: 220 }}
        />
      </form>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No students found"
          description={
            canManage
              ? canCreate
                ? 'Add a student or import from Excel.'
                : 'Create campus, year, and program first.'
              : 'No students match your search.'
          }
          actionLabel={canCreate ? 'Add' : undefined}
          onAction={canCreate ? openCreate : undefined}
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table zebra">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Program</th>
                  <th>Campus</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <code style={{ fontSize: '0.8125rem' }}>{s.studentId}</code>
                    </td>
                    <td style={{ fontWeight: 500 }}>{s.fullName?.trim() || '—'}</td>
                    <td>{s.program?.name?.trim() || '—'}</td>
                    <td>{s.campus?.shortName?.trim() || s.campus?.name?.trim() || '—'}</td>
                    <td>
                      <StatusChip tone={s.status === 'ACTIVE' ? 'success' : 'warning'}>{s.status}</StatusChip>
                    </td>
                    <td>
                      <div className="row-actions">
                        {canManage ? (
                          <>
                            <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(s)}>
                              <Pencil size={14} strokeWidth={1.75} aria-hidden />
                              Edit
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(s)}>
                              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                              Archive
                            </Button>
                          </>
                        ) : null}
                        <Link href={`/students/${s.id}`}>
                          <Button type="button" variant="ghost" size="sm">
                            Meals
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, alignItems: 'center' }}>
            <span className="muted">
              Page {page} of {totalPages} · {total} students
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <Modal
        open={modal !== null}
        title={modal === 'create' ? 'Add student' : 'Edit student'}
        onClose={() => setModal(null)}
      >
        <form onSubmit={onSave} style={{ display: 'grid', gap: 12 }}>
          {modal === 'create' ? (
            <Input
              label="Student ID (barcode)"
              value={form.studentId}
              onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}
              required
              placeholder="CTC-1042-26"
            />
          ) : (
            <Input label="Student ID" value={form.studentId} disabled />
          )}
          <Input
            label="Full name"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            required
          />
          {modal === 'create' ? (
            <>
              <label className="field">
                Campus
                <select
                  className="select"
                  value={form.campusId}
                  onChange={(e) => setForm((f) => ({ ...f, campusId: e.target.value }))}
                  required
                >
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.shortName ?? c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Program
                <select
                  className="select"
                  value={form.programId}
                  onChange={(e) => setForm((f) => ({ ...f, programId: e.target.value }))}
                  required
                >
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Academic year
                <select
                  className="select"
                  value={form.academicYearId}
                  onChange={(e) => setForm((f) => ({ ...f, academicYearId: e.target.value }))}
                  required
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="field">
              Status
              <select
                className="select"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="GRADUATED">GRADUATED</option>
                <option value="WITHDRAWN">WITHDRAWN</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </label>
          )}
          <Input
            label="Department"
            value={form.department}
            onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
          />
          <Input
            label="Gender"
            value={form.gender}
            onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            placeholder="MALE / FEMALE"
          />
          <Input
            label="Education level"
            value={form.educationLevel}
            onChange={(e) => setForm((f) => ({ ...f, educationLevel: e.target.value }))}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Archive student?"
        message={deleting ? `Archive “${deleting.fullName}” (${deleting.studentId})?` : ''}
        confirmLabel="Archive"
        loading={busyDelete}
        onConfirm={() => void onDelete()}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

export default function StudentsPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="panel">Loading students…</div>}>
        <StudentsContent />
      </Suspense>
    </AppShell>
  );
}
