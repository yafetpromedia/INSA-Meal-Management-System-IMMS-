'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AddButton } from '@/components/ui/AddButton';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';

type Job = {
  id: string;
  originalFile: string;
  status: string;
  totalRows?: number;
  rowsImported: number;
  rowsFailed: number;
  createdAt: string;
};

type Campus = { id: string; name: string; shortName: string };
type Program = { id: string; name: string; campusId: string };
type Year = { id: string; name: string; isCurrent?: boolean };

type ImportResult = {
  job: Job;
  imported: number;
  failed: number;
  totalRows: number;
  errors?: { row: number; studentId?: string; message: string }[];
};

export default function ImportPage() {
  const router = useRouter();
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<Job[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [years, setYears] = useState<Year[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [campusId, setCampusId] = useState('');
  const [programId, setProgramId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [mode, setMode] = useState('ADD_ONLY');
  const [lastErrors, setLastErrors] = useState<ImportResult['errors']>([]);

  const filteredPrograms = programs.filter((p) => !campusId || p.campusId === campusId);

  async function loadHistory() {
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    const data = await api<Job[] | { items?: Job[] }>(`/import/history${q}`);
    if (Array.isArray(data)) setItems(data);
    else setItems(data.items ?? []);
  }

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    Promise.all([
      loadHistory(),
      api<Campus[]>(`/campuses${q}`),
      api<Program[]>(`/programs${q}`),
      api<Year[]>(`/academic-years${q}`),
    ])
      .then(([, c, p, y]) => {
        const campusesList = Array.isArray(c) ? c : [];
        const programsList = Array.isArray(p) ? p : [];
        const yearsList = Array.isArray(y) ? y : [];
        setCampuses(campusesList);
        setPrograms(programsList);
        setYears(yearsList);
        if (campusesList[0]) setCampusId(campusesList[0].id);
        const current = yearsList.find((item) => item.isCurrent) ?? yearsList[0];
        if (current) setAcademicYearId(current.id);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!campusId) return;
    const first = programs.find((p) => p.campusId === campusId);
    setProgramId(first?.id ?? '');
  }, [campusId, programs]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    const orgId = getActiveOrganizationId();
    if (!orgId) {
      push({ kind: 'error', title: 'No organization selected' });
      return;
    }
    if (!file) {
      push({ kind: 'error', title: 'Choose an Excel file first' });
      return;
    }
    if (!campusId || !programId || !academicYearId) {
      push({ kind: 'error', title: 'Select campus, program, and academic year' });
      return;
    }

    setUploading(true);
    setLastErrors([]);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('organizationId', orgId);
      body.append('campusId', campusId);
      body.append('programId', programId);
      body.append('academicYearId', academicYearId);
      body.append('mode', mode);

      const result = await api<ImportResult>('/import/students', { method: 'POST', body });
      setLastErrors(result.errors ?? []);
      push({
        kind: result.failed && !result.imported ? 'error' : 'success',
        title: `Imported ${result.imported} of ${result.totalRows}`,
        message: result.failed ? `${result.failed} row(s) failed` : undefined,
      });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await loadHistory();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Import failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setUploading(false);
    }
  }

  function downloadTemplate() {
    const header = 'studentId,fullName,barcode,gender,department,educationLevel,email,phone';
    const sample = 'STU001,Abebe Kebede,STU001,Male,Computer Science,Undergraduate,,';
    const blob = new Blob([`${header}\n${sample}\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'imms-students-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const canUpload = campuses.length > 0 && programs.length > 0 && years.length > 0;

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Excel Import</h1>
          <p className="page-sub">Upload student roster (.xlsx, .xls, or .csv).</p>
        </div>
        <Button type="button" variant="secondary" onClick={downloadTemplate}>
          <FileSpreadsheet size={16} strokeWidth={1.75} aria-hidden />
          Template
        </Button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <form className="panel import-panel" onSubmit={onUpload}>
        <div className="import-grid">
          <label className="field">
            Campus
            <select
              className="input"
              value={campusId}
              onChange={(e) => setCampusId(e.target.value)}
              required
            >
              <option value="">Select campus</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Program
            <select
              className="input"
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              required
            >
              <option value="">Select program</option>
              {filteredPrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Academic year
            <select
              className="input"
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              required
            >
              <option value="">Select year</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Mode
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="ADD_ONLY">Add only</option>
              <option value="UPDATE_EXISTING">Update existing</option>
              <option value="REPLACE_EXISTING">Add or update</option>
            </select>
          </label>
        </div>

        <div className="import-file-row">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-label="Excel file"
          />
          <span className="muted">{file ? file.name : 'No file chosen'}</span>
        </div>

        <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
          Required columns: <code>studentId</code>, <code>fullName</code>. Optional:{' '}
          <code>barcode</code> (defaults to studentId), gender, department, educationLevel, email,
          phone.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <AddButton
            type="submit"
            label={uploading ? 'Importing…' : 'Import'}
            disabled={!canUpload || uploading || !file}
            loading={uploading}
          />
        </div>

        {!canUpload ? (
          <p className="error" style={{ margin: 0 }}>
            Create a campus, academic year, and program before importing.
          </p>
        ) : null}
      </form>

      {lastErrors && lastErrors.length > 0 ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '0.9375rem' }}>Row errors (sample)</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {lastErrors.map((err, i) => (
              <li key={`${err.row}-${i}`} className="muted" style={{ marginBottom: 4 }}>
                Row {err.row}
                {err.studentId ? ` (${err.studentId})` : ''}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h2 style={{ margin: '24px 0 12px', fontSize: '1rem' }}>Import history</h2>

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No imports yet"
          description="Upload a student Excel file to get started."
          actionLabel="Choose file"
          onAction={() => fileRef.current?.click()}
        />
      ) : (
        <div className="table-wrap">
          <table className="table zebra">
            <thead>
              <tr>
                <th>File</th>
                <th>Imported</th>
                <th>Failed</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <tr key={j.id}>
                  <td style={{ fontWeight: 500 }}>{j.originalFile}</td>
                  <td>{j.rowsImported}</td>
                  <td>{j.rowsFailed}</td>
                  <td>
                    <StatusChip
                      tone={
                        j.status === 'COMPLETED' ? 'success' : j.status === 'FAILED' ? 'error' : 'info'
                      }
                    >
                      {j.status}
                    </StatusChip>
                  </td>
                  <td className="muted">{new Date(j.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
