'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, FileText, Printer } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { GatePassPrintSheet } from '@/components/gate-pass/GatePassPrintSheet';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';
import {
  blankCard,
  leaveToCardData,
  mergeGatePassSettings,
  readCachedGatePassSettings,
  cacheGatePassSettings,
  GATE_PASS_SETTINGS_KEY,
  type GatePassCardData,
  type GatePassLayout,
  type GatePassTemplateSettings,
} from '@/lib/gate-pass-print';
import type { LeaveRequest } from '@/lib/leave';

function PrintStudioInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { push } = useToast();

  const idsParam = params.get('ids') ?? '';
  const blankParam = params.get('blank') === '1';
  const layoutParam = Number(params.get('layout') || 0) as GatePassLayout | 0;
  const blankCount = Math.min(32, Math.max(1, Number(params.get('count') || 8)));

  const [settings, setSettings] = useState<GatePassTemplateSettings>(
    readCachedGatePassSettings,
  );
  const [layout, setLayout] = useState<GatePassLayout>(
    layoutParam === 1 || layoutParam === 4 || layoutParam === 8
      ? layoutParam
      : readCachedGatePassSettings().cardsPerPage,
  );
  const [mode, setMode] = useState<'filled' | 'blank'>(blankParam ? 'blank' : 'filled');
  const [cards, setCards] = useState<GatePassCardData[]>([]);
  const [loading, setLoading] = useState(!blankParam && Boolean(idsParam));
  const [error, setError] = useState('');

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }

    async function loadSettings() {
      try {
        const orgId = getActiveOrganizationId();
        const q = orgId ? `?organizationId=${orgId}` : '';
        const data = await api<Array<{ key: string; value: unknown }>>(`/settings${q}`);
        const row = Array.isArray(data)
          ? data.find((s) => s.key === GATE_PASS_SETTINGS_KEY)
          : null;
        if (row) {
          const merged = mergeGatePassSettings(row.value);
          setSettings(merged);
          cacheGatePassSettings(merged);
          if (!layoutParam) setLayout(merged.cardsPerPage);
        }
      } catch {
        /* use cached */
      }
    }
    void loadSettings();
  }, [router, layoutParam]);

  const loadLeaves = useCallback(async () => {
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) {
      setCards([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(
        ids.map((id) => api<LeaveRequest>(`/leave-requests/${id}`).catch(() => null)),
      );
      const next = results
        .filter((r): r is LeaveRequest => Boolean(r))
        .filter((r) =>
          ['APPROVED', 'CHECKED_OUT', 'OVERDUE', 'RETURNED'].includes(r.status),
        )
        .map(leaveToCardData);
      if (!next.length) {
        setError('No printable approved leave passes found for the selection.');
      }
      setCards(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load passes');
    } finally {
      setLoading(false);
    }
  }, [idsParam]);

  useEffect(() => {
    if (mode === 'blank') {
      setCards(Array.from({ length: blankCount }, (_, i) => blankCard(i + 1)));
      setLoading(false);
      return;
    }
    void loadLeaves();
  }, [mode, blankCount, loadLeaves]);

  const sheetSettings = useMemo(
    () => ({ ...settings, cardsPerPage: layout }),
    [settings, layout],
  );

  const pageCount = Math.max(1, Math.ceil((cards.length || layout) / layout));

  function onPrint() {
    window.print();
  }

  function onDownloadPdf() {
    push({
      kind: 'info',
      title: 'Save as PDF',
      message: 'In the print dialog, choose “Save as PDF” / “Microsoft Print to PDF”.',
    });
    window.setTimeout(() => window.print(), 200);
  }

  return (
    <AppShell>
      <div className="page-head no-print">
        <div>
          <Link href="/leave" className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Leave Requests
          </Link>
          <h1 className="page-title">Print Gate Passes</h1>
          <p className="page-sub">
            A4 printable cards — digital view, print, or blank handwriting templates.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="button" variant="secondary" onClick={onDownloadPdf}>
            <Download size={15} strokeWidth={1.75} aria-hidden />
            Download PDF
          </Button>
          <Button type="button" onClick={onPrint}>
            <Printer size={15} strokeWidth={1.75} aria-hidden />
            Print
          </Button>
        </div>
      </div>

      <div className="panel no-print gp-studio-toolbar">
        <label className="field">
          <span>Mode</span>
          <select
            className="input"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'filled' | 'blank')}
          >
            <option value="filled">Filled passes</option>
            <option value="blank">Blank manual templates</option>
          </select>
        </label>
        <label className="field">
          <span>Layout</span>
          <select
            className="input"
            value={layout}
            onChange={(e) => setLayout(Number(e.target.value) as GatePassLayout)}
          >
            <option value={8}>8 cards / A4 (default)</option>
            <option value={4}>4 cards / A4</option>
            <option value={1}>1 card / A4</option>
          </select>
        </label>
        {mode === 'blank' ? (
          <label className="field">
            <span>Blank cards</span>
            <select
              className="input"
              value={blankCount}
              onChange={(e) => {
                const n = Number(e.target.value);
                router.replace(`/leave/print?blank=1&layout=${layout}&count=${n}`);
              }}
            >
              {[8, 16, 24, 32].map((n) => (
                <option key={n} value={n}>
                  {n} cards ({Math.ceil(n / layout)} page
                  {Math.ceil(n / layout) === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="muted" style={{ margin: 0, alignSelf: 'end', fontSize: '0.8125rem' }}>
            {cards.length} pass{cards.length === 1 ? '' : 'es'} · {pageCount} page
            {pageCount === 1 ? '' : 's'} · cut on dashed guides
          </p>
        )}
        <Link href="/settings" className="muted" style={{ alignSelf: 'end', fontSize: '0.8125rem' }}>
          <FileText size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Gate
          Pass Designer in Settings
        </Link>
      </div>

      {error ? <p className="error no-print">{error}</p> : null}

      {loading ? (
        <div className="panel no-print">
          <Skeleton height={220} />
        </div>
      ) : mode === 'filled' && !cards.length ? (
        <div className="panel no-print">
          <p className="muted" style={{ margin: 0 }}>
            Select approved leave requests from the Leave list, or open Print from a leave
            detail page. For emergencies, switch to{' '}
            <button
              type="button"
              className="linkish"
              onClick={() => setMode('blank')}
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                color: 'inherit',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              blank manual templates
            </button>
            .
          </p>
        </div>
      ) : (
        <div className="gp-studio-preview">
          <GatePassPrintSheet
            cards={cards}
            layout={layout}
            settings={sheetSettings}
            fillBlanks={mode === 'filled'}
          />
        </div>
      )}
    </AppShell>
  );
}

export default function LeavePrintPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="panel">
            <Skeleton height={220} />
          </div>
        </AppShell>
      }
    >
      <PrintStudioInner />
    </Suspense>
  );
}
